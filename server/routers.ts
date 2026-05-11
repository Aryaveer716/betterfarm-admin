import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { operatorRouter } from "./operator-router";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { users, adminAuditLogs, supportEmails, verificationRequests, forumPosts } from "@betterfarm/db";
import { buildUserModerationAuditEntry } from "./users-moderation-helpers";
import { buildSupportEmailAuditEntry } from "./support-emails-helpers";
import { buildVerificationAuditEntry } from "./verifications-helpers";
import { buildForumPostAuditEntry } from "./forum-helpers";
import {
  farmerProfiles, marketplaceListings,
  userReports, supportTickets, diseaseDetections, aiInteractions,
  activityLogs, featureFlags
} from "../drizzle/schema";
import { eq, desc, like, or, and, count, sql, ne } from "drizzle-orm";

// Admin-only middleware
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// Helper to log admin actions
async function logAction(adminId: number, action: string, targetType?: string, targetId?: number, details?: unknown) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(activityLogs).values({
      adminId,
      action,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      details: details as any ?? null,
    });
  } catch (e) {
    console.error("Failed to log action:", e);
  }
}

function getActorEmail(ctx: { user: { email: string | null; name: string | null } }): string {
  return ctx.user.email || ctx.user.name || "admin@unknown";
}

function getIpAddress(req: { ip?: string; headers: Record<string, unknown> }): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]?.trim() ?? null;
  return req.ip ?? null;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  admin: router({
    // ── Dashboard ──────────────────────────────────────────────────────────
    getDashboardStats: adminProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [totalUsers] = await db.select({ count: count() }).from(users);
      const [totalFarms] = await db.select({ count: count() }).from(farmerProfiles);
      const [totalPosts] = await db.select({ count: count() }).from(forumPosts);
      const [openTickets] = await db.select({ count: count() }).from(supportTickets).where(eq(supportTickets.status, "open"));
      const [pendingReports] = await db.select({ count: count() }).from(userReports).where(eq(userReports.status, "pending"));
      const [pendingVerifications] = await db.select({ count: count() }).from(farmerProfiles).where(eq(farmerProfiles.verificationStatus, "pending"));
      const [pendingDetections] = await db.select({ count: count() }).from(diseaseDetections).where(eq(diseaseDetections.status, "pending"));
      const [totalAiInteractions] = await db.select({ count: count() }).from(aiInteractions);

      const recentUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(5);
      const recentTickets = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).limit(5);
      const recentLogs = await db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(10);

      return {
        stats: {
          totalUsers: totalUsers?.count ?? 0,
          totalFarms: totalFarms?.count ?? 0,
          totalPosts: totalPosts?.count ?? 0,
          openTickets: openTickets?.count ?? 0,
          pendingReports: pendingReports?.count ?? 0,
          pendingVerifications: pendingVerifications?.count ?? 0,
          pendingDetections: pendingDetections?.count ?? 0,
          totalAiInteractions: totalAiInteractions?.count ?? 0,
        },
        recentUsers,
        recentTickets,
        recentLogs,
      };
    }),

    // ── Users ──────────────────────────────────────────────────────────────
    getUsers: adminProcedure
      .input(z.object({
        search: z.string().optional(),
        role: z.enum(["user", "admin", "all"]).default("all"),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.search) {
          conditions.push(or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`)
          ));
        }
        if (input.role !== "all") {
          conditions.push(eq(users.role, input.role));
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(users).where(where).orderBy(desc(users.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(users).where(where);
        return { users: rows, total: total?.count ?? 0 };
      }),

    updateUserRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        await logAction(ctx.user.id, `Set user role to ${input.role}`, "user", input.userId);
        return { success: true };
      }),

    deleteUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.delete(users).where(eq(users.id, input.userId));
        await logAction(ctx.user.id, "Deleted user", "user", input.userId);
        return { success: true };
      }),

    // ── User moderation (suspend/ban/strike/shadow-ban) ────────────────────
    // Mirrors apps/main/server/admin-router.ts:109-321. Writes canonical
    // adminAuditLogs rows (NOT admin-local activityLogs) for production audit trail.

    suspendUser: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          reason: z.string().min(1).max(500),
          durationDays: z.number().int().min(1).max(365),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const suspendedUntil = new Date();
        suspendedUntil.setDate(suspendedUntil.getDate() + input.durationDays);
        await db
          .update(users)
          .set({
            isSuspended: true,
            suspendedUntil,
            suspensionReason: input.reason,
          })
          .where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values(
          buildUserModerationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "user_suspended",
            targetUserId: input.userId,
            details: {
              reason: input.reason,
              durationDays: input.durationDays,
              suspendedUntil: suspendedUntil.toISOString(),
            },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true, suspendedUntil };
      }),

    unsuspendUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(users)
          .set({
            isSuspended: false,
            suspendedUntil: null,
            suspensionReason: null,
          })
          .where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values(
          buildUserModerationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "user_unsuspended",
            targetUserId: input.userId,
            details: {},
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    banUser: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          reason: z.string().min(1).max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(users)
          .set({
            isBanned: true,
            suspensionReason: input.reason,
          })
          .where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values(
          buildUserModerationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "user_banned",
            targetUserId: input.userId,
            details: { reason: input.reason },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    unbanUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(users)
          .set({
            isBanned: false,
            suspensionReason: null,
          })
          .where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values(
          buildUserModerationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "user_unbanned",
            targetUserId: input.userId,
            details: {},
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    shadowBanUser: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          reason: z.string().min(1).max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(users)
          .set({
            isShadowBanned: true,
            suspensionReason: input.reason,
          })
          .where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values(
          buildUserModerationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "user_shadow_banned",
            targetUserId: input.userId,
            details: { reason: input.reason },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    removeShadowBan: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(users)
          .set({
            isShadowBanned: false,
            suspensionReason: null,
          })
          .where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values(
          buildUserModerationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "user_shadow_ban_removed",
            targetUserId: input.userId,
            details: {},
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    issueStrike: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          reason: z.string().min(1).max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        const newStrikeCount = user.totalStrikes + 1;
        const updates: {
          totalStrikes: number;
          isSuspended?: boolean;
          suspendedUntil?: Date;
          suspensionReason?: string;
        } = { totalStrikes: newStrikeCount };
        let autoSuspended = false;
        if (newStrikeCount >= 3) {
          updates.isSuspended = true;
          updates.suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          updates.suspensionReason = "Automatic suspension after 3 strikes";
          autoSuspended = true;
        }
        await db.update(users).set(updates).where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values(
          buildUserModerationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "user_strike_issued",
            targetUserId: input.userId,
            details: { reason: input.reason, newStrikeCount, autoSuspended },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true, newStrikeCount, autoSuspended };
      }),

    clearStrikes: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db.update(users).set({ totalStrikes: 0 }).where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values(
          buildUserModerationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "user_strikes_cleared",
            targetUserId: input.userId,
            details: {},
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    // ── Support Emails (Gmail inbox triage) ─────────────────────────────────
    // Reads canonical @betterfarm/db.supportEmails. SMTP reply / AI draft approval /
    // analyze are NOT in admin's scope — those live in apps/main's gmail.* namespace
    // (gated by isInternalAdminEmail). Phase 2b admin can: list with filters, view
    // detail, change status. Every status change writes adminAuditLogs.

    listSupportEmails: adminProcedure
      .input(
        z.object({
          status: z.enum(["all", "unread", "read", "processing", "responded", "archived"]).default("all"),
          category: z.enum(["all", "support", "farmer_onboarding", "investor", "partnership", "spam", "other"]).default("all"),
          urgency: z.enum(["all", "low", "medium", "high", "critical"]).default("all"),
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
        }),
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.status !== "all") conditions.push(eq(supportEmails.status, input.status));
        if (input.category !== "all") conditions.push(eq(supportEmails.category, input.category));
        if (input.urgency !== "all") conditions.push(eq(supportEmails.urgency, input.urgency));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db
          .select()
          .from(supportEmails)
          .where(where)
          .orderBy(desc(supportEmails.receivedAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db.select({ count: count() }).from(supportEmails).where(where);
        return { emails: rows, total: total?.count ?? 0 };
      }),

    getSupportEmail: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [row] = await db
          .select()
          .from(supportEmails)
          .where(eq(supportEmails.id, input.id))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
        return row;
      }),

    updateSupportEmailStatus: adminProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["unread", "read", "processing", "responded", "archived"]),
          reason: z.string().max(500).nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [existing] = await db
          .select({ status: supportEmails.status })
          .from(supportEmails)
          .where(eq(supportEmails.id, input.id))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
        const oldStatus = existing.status;
        await db
          .update(supportEmails)
          .set({ status: input.status })
          .where(eq(supportEmails.id, input.id));
        await db.insert(adminAuditLogs).values(
          buildSupportEmailAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "support_email_status_changed",
            targetEmailId: input.id,
            details: { oldStatus, newStatus: input.status, reason: input.reason ?? null },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true, oldStatus, newStatus: input.status };
      }),

    // ── Verification Requests (canonical workflow) ──────────────────────────
    // Reads canonical @betterfarm/db.verificationRequests. Status transitions write
    // adminAuditLogs. The recalculateFarmVerificationProfile callback (which
    // recomputes insurance pricing in apps/main) is OUT OF SCOPE — Phase 4
    // cross-app concern.

    listVerificationRequests: adminProcedure
      .input(
        z.object({
          status: z
            .enum([
              "all",
              "not_verified",
              "pending_review",
              "more_info_required",
              "better_farm_verified",
              "organic_verified",
              "government_verified",
              "claim_unverified",
              "rejected",
            ])
            .default("pending_review"),
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
        }),
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const where = input.status === "all" ? undefined : eq(verificationRequests.badgeStatus, input.status);
        const rows = await db
          .select()
          .from(verificationRequests)
          .where(where)
          .orderBy(desc(verificationRequests.createdAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db
          .select({ count: count() })
          .from(verificationRequests)
          .where(where);
        return { requests: rows, total: total?.count ?? 0 };
      }),

    getVerificationRequest: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [row] = await db
          .select()
          .from(verificationRequests)
          .where(eq(verificationRequests.id, input.id))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Verification request not found" });
        return row;
      }),

    approveVerificationRequest: adminProcedure
      .input(
        z.object({
          id: z.number(),
          notes: z.string().max(2000).nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [req] = await db
          .select()
          .from(verificationRequests)
          .where(eq(verificationRequests.id, input.id))
          .limit(1);
        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Verification request not found" });
        if (req.userId === ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Reviewers cannot approve their own verification requests",
          });
        }
        await db
          .update(verificationRequests)
          .set({
            badgeStatus: "better_farm_verified",
            reviewedAt: new Date(),
            reviewedBy: ctx.user.id,
            adminNotes: input.notes ?? null,
          })
          .where(eq(verificationRequests.id, input.id));
        await db.insert(adminAuditLogs).values(
          buildVerificationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "verification_approved",
            targetVerificationId: input.id,
            details: { farmId: req.farmId, userId: req.userId, notes: input.notes ?? null },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    rejectVerificationRequest: adminProcedure
      .input(
        z.object({
          id: z.number(),
          reason: z.string().min(1).max(2000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [req] = await db
          .select()
          .from(verificationRequests)
          .where(eq(verificationRequests.id, input.id))
          .limit(1);
        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Verification request not found" });
        if (req.userId === ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Reviewers cannot reject their own verification requests",
          });
        }
        await db
          .update(verificationRequests)
          .set({
            badgeStatus: "rejected",
            reviewedAt: new Date(),
            reviewedBy: ctx.user.id,
            rejectionReason: input.reason,
          })
          .where(eq(verificationRequests.id, input.id));
        await db.insert(adminAuditLogs).values(
          buildVerificationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "verification_rejected",
            targetVerificationId: input.id,
            details: { farmId: req.farmId, userId: req.userId, reason: input.reason },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    requestMoreInfoOnVerification: adminProcedure
      .input(
        z.object({
          id: z.number(),
          moreInfoRequested: z.string().min(1).max(2000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [req] = await db
          .select()
          .from(verificationRequests)
          .where(eq(verificationRequests.id, input.id))
          .limit(1);
        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Verification request not found" });
        if (req.userId === ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Reviewers cannot act on their own verification requests",
          });
        }
        await db
          .update(verificationRequests)
          .set({
            badgeStatus: "more_info_required",
            reviewedAt: new Date(),
            reviewedBy: ctx.user.id,
            moreInfoRequested: input.moreInfoRequested,
          })
          .where(eq(verificationRequests.id, input.id));
        await db.insert(adminAuditLogs).values(
          buildVerificationAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "verification_more_info_requested",
            targetVerificationId: input.id,
            details: {
              farmId: req.farmId,
              userId: req.userId,
              moreInfoRequested: input.moreInfoRequested,
            },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    // ── Farms ──────────────────────────────────────────────────────────────
    getFarms: adminProcedure
      .input(z.object({
        search: z.string().optional(),
        verificationStatus: z.enum(["pending", "approved", "rejected", "all"]).default("all"),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.search) {
          conditions.push(or(
            like(farmerProfiles.farmName, `%${input.search}%`),
            like(farmerProfiles.location, `%${input.search}%`),
            like(farmerProfiles.primaryCrop, `%${input.search}%`)
          ));
        }
        if (input.verificationStatus !== "all") {
          conditions.push(eq(farmerProfiles.verificationStatus, input.verificationStatus));
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(farmerProfiles).where(where).orderBy(desc(farmerProfiles.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(farmerProfiles).where(where);
        return { farms: rows, total: total?.count ?? 0 };
      }),

    updateVerification: adminProcedure
      .input(z.object({
        farmId: z.number(),
        status: z.enum(["approved", "rejected"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(farmerProfiles)
          .set({ verificationStatus: input.status, isVerified: input.status === "approved" })
          .where(eq(farmerProfiles.id, input.farmId));
        await logAction(ctx.user.id, `Verification ${input.status}`, "farm", input.farmId, { notes: input.notes });
        return { success: true };
      }),

    // ── Community / Posts (canonical @betterfarm/db.forumPosts) ────────────
    // Reads/writes canonical forumPosts. Every mutation writes adminAuditLogs
    // (canonical) — admin-local activityLogs is no longer the audit destination
    // for forum-post moderation.

    getPosts: adminProcedure
      .input(z.object({
        search: z.string().optional(),
        isRemoved: z.boolean().optional(),
        isFlagged: z.boolean().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.search) conditions.push(or(like(forumPosts.title, `%${input.search}%`), like(forumPosts.content, `%${input.search}%`)));
        if (input.isRemoved !== undefined) conditions.push(eq(forumPosts.isRemoved, input.isRemoved));
        if (input.isFlagged !== undefined) conditions.push(eq(forumPosts.isFlagged, input.isFlagged));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(forumPosts).where(where).orderBy(desc(forumPosts.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(forumPosts).where(where);
        return { posts: rows, total: total?.count ?? 0 };
      }),

    getFlaggedPosts: adminProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const where = and(eq(forumPosts.isFlagged, true), eq(forumPosts.isRemoved, false));
        const rows = await db.select().from(forumPosts).where(where).orderBy(desc(forumPosts.flaggedAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(forumPosts).where(where);
        return { posts: rows, total: total?.count ?? 0 };
      }),

    removePost: adminProcedure
      .input(z.object({ postId: z.number(), reason: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(forumPosts)
          .set({
            isRemoved: true,
            removedReason: input.reason,
            removedBy: ctx.user.id,
            removedAt: new Date(),
          })
          .where(eq(forumPosts.id, input.postId));
        await db.insert(adminAuditLogs).values(
          buildForumPostAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "forum_post_removed",
            targetPostId: input.postId,
            details: { reason: input.reason },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    restorePost: adminProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(forumPosts)
          .set({
            isRemoved: false,
            removedReason: null,
            removedBy: null,
            removedAt: null,
          })
          .where(eq(forumPosts.id, input.postId));
        await db.insert(adminAuditLogs).values(
          buildForumPostAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "forum_post_restored",
            targetPostId: input.postId,
            details: {},
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    flagPost: adminProcedure
      .input(z.object({ postId: z.number(), reason: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(forumPosts)
          .set({
            isFlagged: true,
            flaggedAt: new Date(),
            flagCount: sql`${forumPosts.flagCount} + 1`,
          })
          .where(eq(forumPosts.id, input.postId));
        await db.insert(adminAuditLogs).values(
          buildForumPostAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "forum_post_flagged",
            targetPostId: input.postId,
            details: { reason: input.reason },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    unflagPost: adminProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        await db
          .update(forumPosts)
          .set({
            isFlagged: false,
            flaggedAt: null,
            flagCount: 0,
          })
          .where(eq(forumPosts.id, input.postId));
        await db.insert(adminAuditLogs).values(
          buildForumPostAuditEntry({
            adminEmail: getActorEmail(ctx),
            action: "forum_post_unflagged",
            targetPostId: input.postId,
            details: {},
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true };
      }),

    // ── Marketplace ────────────────────────────────────────────────────────
    getListings: adminProcedure
      .input(z.object({
        search: z.string().optional(),
        status: z.enum(["active", "sold", "removed", "pending", "all"]).default("all"),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.search) conditions.push(or(like(marketplaceListings.title, `%${input.search}%`), like(marketplaceListings.description, `%${input.search}%`)));
        if (input.status !== "all") conditions.push(eq(marketplaceListings.status, input.status));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(marketplaceListings).where(where).orderBy(desc(marketplaceListings.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(marketplaceListings).where(where);
        return { listings: rows, total: total?.count ?? 0 };
      }),

    removeListing: adminProcedure
      .input(z.object({ listingId: z.number(), reason: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(marketplaceListings).set({ isRemoved: true, status: "removed", removedReason: input.reason }).where(eq(marketplaceListings.id, input.listingId));
        await logAction(ctx.user.id, "Removed listing", "listing", input.listingId, { reason: input.reason });
        return { success: true };
      }),

    restoreListing: adminProcedure
      .input(z.object({ listingId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(marketplaceListings).set({ isRemoved: false, status: "active", removedReason: null }).where(eq(marketplaceListings.id, input.listingId));
        await logAction(ctx.user.id, "Restored listing", "listing", input.listingId);
        return { success: true };
      }),

    // ── Reports ────────────────────────────────────────────────────────────
    getReports: adminProcedure
      .input(z.object({
        status: z.enum(["pending", "resolved", "dismissed", "all"]).default("all"),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = input.status !== "all" ? [eq(userReports.status, input.status)] : [];
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(userReports).where(where).orderBy(desc(userReports.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(userReports).where(where);
        return { reports: rows, total: total?.count ?? 0 };
      }),

    resolveReport: adminProcedure
      .input(z.object({ reportId: z.number(), resolution: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(userReports).set({ status: "resolved", resolvedBy: ctx.user.id, resolvedAt: new Date(), resolution: input.resolution }).where(eq(userReports.id, input.reportId));
        await logAction(ctx.user.id, "Resolved report", "report", input.reportId);
        return { success: true };
      }),

    dismissReport: adminProcedure
      .input(z.object({ reportId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(userReports).set({ status: "dismissed", resolvedBy: ctx.user.id, resolvedAt: new Date() }).where(eq(userReports.id, input.reportId));
        await logAction(ctx.user.id, "Dismissed report", "report", input.reportId);
        return { success: true };
      }),

    // ── Support Tickets ────────────────────────────────────────────────────
    getTickets: adminProcedure
      .input(z.object({
        status: z.enum(["open", "in_progress", "resolved", "closed", "all"]).default("all"),
        priority: z.enum(["low", "medium", "high", "urgent", "all"]).default("all"),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.status !== "all") conditions.push(eq(supportTickets.status, input.status));
        if (input.priority !== "all") conditions.push(eq(supportTickets.priority, input.priority));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(supportTickets).where(where).orderBy(desc(supportTickets.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(supportTickets).where(where);
        return { tickets: rows, total: total?.count ?? 0 };
      }),

    updateTicket: adminProcedure
      .input(z.object({
        ticketId: z.number(),
        status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
        adminNotes: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const updates: Record<string, unknown> = {};
        if (input.status) { updates.status = input.status; if (input.status === "resolved") updates.resolvedAt = new Date(); }
        if (input.adminNotes !== undefined) updates.adminNotes = input.adminNotes;
        if (input.priority) updates.priority = input.priority;
        await db.update(supportTickets).set(updates as any).where(eq(supportTickets.id, input.ticketId));
        await logAction(ctx.user.id, `Updated ticket status to ${input.status ?? "notes"}`, "ticket", input.ticketId);
        return { success: true };
      }),

    // ── Disease Detection ──────────────────────────────────────────────────
    getDetections: adminProcedure
      .input(z.object({
        status: z.enum(["pending", "reviewed", "resolved", "all"]).default("all"),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = input.status !== "all" ? [eq(diseaseDetections.status, input.status)] : [];
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(diseaseDetections).where(where).orderBy(desc(diseaseDetections.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(diseaseDetections).where(where);
        return { detections: rows, total: total?.count ?? 0 };
      }),

    resolveDetection: adminProcedure
      .input(z.object({ detectionId: z.number(), notes: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(diseaseDetections).set({ status: "resolved", reviewedBy: ctx.user.id, reviewNotes: input.notes }).where(eq(diseaseDetections.id, input.detectionId));
        await logAction(ctx.user.id, "Resolved disease detection", "detection", input.detectionId);
        return { success: true };
      }),

    // ── AI Interactions ────────────────────────────────────────────────────
    getAiInteractions: adminProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(20),
        wasSuccessful: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = input.wasSuccessful !== undefined ? [eq(aiInteractions.wasSuccessful, input.wasSuccessful)] : [];
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(aiInteractions).where(where).orderBy(desc(aiInteractions.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(aiInteractions).where(where);
        const [successCount] = await db.select({ count: count() }).from(aiInteractions).where(eq(aiInteractions.wasSuccessful, true));
        const [failCount] = await db.select({ count: count() }).from(aiInteractions).where(eq(aiInteractions.wasSuccessful, false));
        return { interactions: rows, total: total?.count ?? 0, successCount: successCount?.count ?? 0, failCount: failCount?.count ?? 0 };
      }),

    // ── Activity Logs ──────────────────────────────────────────────────────
    getActivityLogs: adminProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(30),
        targetType: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const offset = (input.page - 1) * input.limit;
        const conditions = input.targetType ? [eq(activityLogs.targetType, input.targetType)] : [];
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(activityLogs).where(where).orderBy(desc(activityLogs.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(activityLogs).where(where);
        return { logs: rows, total: total?.count ?? 0 };
      }),

    // ── Feature Flags ──────────────────────────────────────────────────────
    getFeatureFlags: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(featureFlags).orderBy(featureFlags.name);
    }),

    toggleFeatureFlag: adminProcedure
      .input(z.object({ flagId: z.number(), isEnabled: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(featureFlags).set({ isEnabled: input.isEnabled, updatedBy: ctx.user.id }).where(eq(featureFlags.id, input.flagId));
        await logAction(ctx.user.id, `${input.isEnabled ? "Enabled" : "Disabled"} feature flag`, "flag", input.flagId);
        return { success: true };
      }),

    // ── Analytics ─────────────────────────────────────────────────────────
    getRevenue: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [totalVal] = await db.execute(sql`SELECT COALESCE(SUM(price), 0) as total FROM marketplace_listings WHERE isRemoved = 0`) as unknown as any[];
      const [activeCount] = await db.execute(sql`SELECT COUNT(*) as count FROM marketplace_listings WHERE status = 'active' AND isRemoved = 0`) as unknown as any[];
      const [avgPrice] = await db.execute(sql`SELECT COALESCE(AVG(price), 0) as avg FROM marketplace_listings WHERE isRemoved = 0`) as unknown as any[];
      const [verifiedFarmers] = await db.execute(sql`SELECT COUNT(*) as count FROM farmer_profiles WHERE verificationStatus = 'approved'`) as unknown as any[];
      const byCategory = await db.execute(sql`SELECT category, COUNT(*) as count FROM marketplace_listings WHERE isRemoved = 0 GROUP BY category ORDER BY count DESC LIMIT 10`) as unknown as any[];
      const byStatus = await db.execute(sql`SELECT status, COUNT(*) as count FROM marketplace_listings GROUP BY status`) as unknown as any[];

      return {
        totalListingsValue: Number((totalVal as any[])[0]?.total ?? 0),
        activeListings: Number((activeCount as any[])[0]?.count ?? 0),
        avgListingPrice: Math.round(Number((avgPrice as any[])[0]?.avg ?? 0)),
        verifiedFarmers: Number((verifiedFarmers as any[])[0]?.count ?? 0),
        listingsByCategory: (byCategory[0] as any[]),
        listingsByStatus: (byStatus[0] as any[]),
      };
    }),

    getAnalytics: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const usersByMonth = await db.execute(sql`
        SELECT DATE_FORMAT(createdAt, '%Y-%m') as month, COUNT(*) as count
        FROM users
        GROUP BY month ORDER BY month DESC LIMIT 12
      `);
      const postsByMonth = await db.execute(sql`
        SELECT DATE_FORMAT(createdAt, '%Y-%m') as month, COUNT(*) as count
        FROM forum_posts
        GROUP BY month ORDER BY month DESC LIMIT 12
      `);
      const ticketsByStatus = await db.execute(sql`
        SELECT status, COUNT(*) as count FROM support_tickets GROUP BY status
      `);
      const detectionsBySeverity = await db.execute(sql`
        SELECT severity, COUNT(*) as count FROM disease_detections GROUP BY severity
      `);

      return {
        usersByMonth: (usersByMonth[0] as unknown as any[]).reverse(),
        postsByMonth: (postsByMonth[0] as unknown as any[]).reverse(),
        ticketsByStatus: ticketsByStatus[0] as unknown as any[],
        detectionsBySeverity: detectionsBySeverity[0] as unknown as any[],
      };
    }),

    operator: operatorRouter,
  }),
});

export type AppRouter = typeof appRouter;
