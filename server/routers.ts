import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminHealthRouter } from "./admin-health-router";
import { operatorRouter } from "./operator-router";
import { adminChatRouter } from "./admin-chat-router";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { users, adminAuditLogs, supportEmails, verificationRequests, forumPosts, contentReports, messageReports, diseaseDetections, aiAdviceHistory, copilotConversations, aiFeedback, featureFlags } from "@betterfarm/db";
import { buildUserModerationAuditEntry } from "./users-moderation-helpers";
import { buildSupportEmailAuditEntry } from "./support-emails-helpers";
import { buildVerificationAuditEntry } from "./verifications-helpers";
import { buildForumPostAuditEntry } from "./forum-helpers";
import { buildReportAuditEntry } from "./reports-helpers";
import { buildDiseaseAuditEntry } from "./disease-helpers";
// Admin-local schema fully retired in Phase 4c. All consumers switched to canonical
// @betterfarm/db tables across Phases 1-3. The orphaned admin-local tables
// (farmerProfiles, marketplaceListings, userReports, supportTickets, aiInteractions,
// activityLogs, feature_flags, forum_posts, disease_detections) are no longer
// imported or queried. The drizzle/schema.ts file is deleted.
import { eq, desc, like, or, and, count, sql, ne } from "drizzle-orm";

// Admin-only middleware
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// logAction helper retired in Phase 4c — all callers switched to direct
// adminAuditLogs inserts with their own action constants. (Phase 4a fixed
// updateUserRole + deleteUser; Phases 1-3 used per-area helpers for the new
// procedures.)

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

  adminHealth: adminHealthRouter,

  admin: router({
    // ── Dashboard ──────────────────────────────────────────────────────────
    getDashboardStats: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // All queries hit canonical @betterfarm/db tables post-Phase-3.
      const [totalUsers] = await db.select({ count: count() }).from(users);
      const [totalPosts] = await db.select({ count: count() }).from(forumPosts);
      const [flaggedPosts] = await db.select({ count: count() }).from(forumPosts).where(eq(forumPosts.isFlagged, true));
      const [unreadEmails] = await db.select({ count: count() }).from(supportEmails).where(eq(supportEmails.status, "unread"));
      const [pendingContentReports] = await db.select({ count: count() }).from(contentReports).where(eq(contentReports.status, "pending"));
      const [pendingVerifications] = await db.select({ count: count() }).from(verificationRequests).where(eq(verificationRequests.badgeStatus, "pending_review"));
      const [activeDetections] = await db.select({ count: count() }).from(diseaseDetections).where(eq(diseaseDetections.status, "active"));
      const [totalAdvice] = await db.select({ count: count() }).from(aiAdviceHistory);
      const [totalConversations] = await db.select({ count: count() }).from(copilotConversations);

      const recentUsers = await db.select().from(users).orderBy(desc(users.createdAt)).limit(5);
      const recentEmails = await db.select().from(supportEmails).orderBy(desc(supportEmails.receivedAt)).limit(5);
      const recentAuditLogs = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(10);

      return {
        stats: {
          totalUsers: totalUsers?.count ?? 0,
          totalPosts: totalPosts?.count ?? 0,
          flaggedPosts: flaggedPosts?.count ?? 0,
          unreadEmails: unreadEmails?.count ?? 0,
          pendingContentReports: pendingContentReports?.count ?? 0,
          pendingVerifications: pendingVerifications?.count ?? 0,
          activeDetections: activeDetections?.count ?? 0,
          totalAdvice: totalAdvice?.count ?? 0,
          totalConversations: totalConversations?.count ?? 0,
        },
        recentUsers,
        recentEmails,
        recentAuditLogs,
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
      .input(z.object({ userId: z.number(), role: z.enum(["user", "admin", "moderator"]) }))
      .mutation(async ({ ctx, input }) => {
        // Phase 5 hardening: self-promotion guard + last-admin protection.
        // Admins cannot change their own role (prevents accidental lock-out)
        // and we refuse to demote the last admin in the system (prevents
        // accidental admin-less state requiring break-glass recovery).
        // Self-check first (no DB needed; fast-fails tests).
        if (input.userId === ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot change your own role. Ask another admin.",
          });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [prev] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (prev.role === "admin" && input.role !== "admin") {
          const [adminCount] = await db.select({ count: count() }).from(users).where(eq(users.role, "admin"));
          if ((adminCount?.count ?? 0) <= 1) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Cannot demote the last admin. Promote another user to admin first.",
            });
          }
        }
        await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values({
          adminEmail: getActorEmail(ctx),
          action: "user_role_updated",
          targetType: "user",
          targetId: input.userId,
          details: JSON.stringify({ oldRole: prev.role, newRole: input.role }),
          ipAddress: getIpAddress(ctx.req),
        });
        return { success: true, oldRole: prev.role, newRole: input.role };
      }),

    deleteUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Phase 5 hardening: cannot delete self; cannot delete last admin.
        // Self-check first (no DB needed).
        if (input.userId === ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You cannot delete your own account.",
          });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [prev] = await db.select({ email: users.email, name: users.name, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
        if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        if (prev.role === "admin") {
          const [adminCount] = await db.select({ count: count() }).from(users).where(eq(users.role, "admin"));
          if ((adminCount?.count ?? 0) <= 1) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Cannot delete the last admin. Promote another user to admin first.",
            });
          }
        }
        await db.delete(users).where(eq(users.id, input.userId));
        await db.insert(adminAuditLogs).values({
          adminEmail: getActorEmail(ctx),
          action: "user_deleted",
          targetType: "user",
          targetId: input.userId,
          details: JSON.stringify({ deletedEmail: prev?.email ?? null, deletedName: prev?.name ?? null }),
          ipAddress: getIpAddress(ctx.req),
        });
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

    // ── Reports (canonical contentReports + messageReports) ─────────────────
    // Reads/writes canonical @betterfarm/db.contentReports + messageReports.
    // Admin-local userReports is orphaned (Phase 4 cleanup). verificationFlags
    // is a different concept (system anomaly flags) handled by Verification flow.

    listContentReports: adminProcedure
      .input(
        z.object({
          status: z.enum(["all", "pending", "reviewed", "dismissed", "action_taken"]).default("pending"),
          contentType: z.enum(["all", "post", "comment"]).default("all"),
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
        }),
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.status !== "all") conditions.push(eq(contentReports.status, input.status));
        if (input.contentType !== "all") conditions.push(eq(contentReports.contentType, input.contentType));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db
          .select()
          .from(contentReports)
          .where(where)
          .orderBy(desc(contentReports.createdAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db.select({ count: count() }).from(contentReports).where(where);
        return { reports: rows, total: total?.count ?? 0 };
      }),

    listMessageReports: adminProcedure
      .input(
        z.object({
          status: z.enum(["all", "pending", "reviewed", "dismissed", "action_taken"]).default("pending"),
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
        }),
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const where = input.status === "all" ? undefined : eq(messageReports.status, input.status);
        const rows = await db
          .select()
          .from(messageReports)
          .where(where)
          .orderBy(desc(messageReports.createdAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db.select({ count: count() }).from(messageReports).where(where);
        return { reports: rows, total: total?.count ?? 0 };
      }),

    updateContentReportStatus: adminProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "reviewed", "dismissed", "action_taken"]),
          reviewNote: z.string().max(2000).nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [existing] = await db
          .select({ status: contentReports.status })
          .from(contentReports)
          .where(eq(contentReports.id, input.id))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Content report not found" });
        const oldStatus = existing.status;
        await db
          .update(contentReports)
          .set({
            status: input.status,
            reviewedBy: ctx.user.id,
            reviewNote: input.reviewNote ?? null,
          })
          .where(eq(contentReports.id, input.id));
        const action =
          input.status === "dismissed"
            ? "content_report_dismissed"
            : input.status === "action_taken"
              ? "content_report_action_taken"
              : "content_report_reviewed";
        await db.insert(adminAuditLogs).values(
          buildReportAuditEntry({
            adminEmail: getActorEmail(ctx),
            action,
            targetType: "content_report",
            targetReportId: input.id,
            details: { oldStatus, newStatus: input.status, reviewNote: input.reviewNote ?? null },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true, oldStatus, newStatus: input.status };
      }),

    updateMessageReportStatus: adminProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "reviewed", "dismissed", "action_taken"]),
          reviewNote: z.string().max(2000).nullish(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [existing] = await db
          .select({ status: messageReports.status })
          .from(messageReports)
          .where(eq(messageReports.id, input.id))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Message report not found" });
        const oldStatus = existing.status;
        await db
          .update(messageReports)
          .set({ status: input.status })
          .where(eq(messageReports.id, input.id));
        const action =
          input.status === "dismissed"
            ? "message_report_dismissed"
            : input.status === "action_taken"
              ? "message_report_action_taken"
              : "message_report_reviewed";
        await db.insert(adminAuditLogs).values(
          buildReportAuditEntry({
            adminEmail: getActorEmail(ctx),
            action,
            targetType: "message_report",
            targetReportId: input.id,
            details: { oldStatus, newStatus: input.status, reviewNote: input.reviewNote ?? null },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true, oldStatus, newStatus: input.status };
      }),

    // ── Disease Detection (canonical @betterfarm/db.diseaseDetections) ──────
    // Status enum: active | resolved | ignored. No reviewedBy/reviewNotes columns
    // exist — review context is captured via adminAuditLogs.details.

    listDiseaseDetections: adminProcedure
      .input(z.object({
        status: z.enum(["all", "active", "resolved", "ignored"]).default("active"),
        severity: z.enum(["all", "low", "medium", "high"]).default("all"),
        cropName: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.status !== "all") conditions.push(eq(diseaseDetections.status, input.status));
        if (input.severity !== "all") conditions.push(eq(diseaseDetections.severity, input.severity));
        if (input.cropName) conditions.push(like(diseaseDetections.cropName, `%${input.cropName}%`));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db
          .select()
          .from(diseaseDetections)
          .where(where)
          .orderBy(desc(diseaseDetections.createdAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db.select({ count: count() }).from(diseaseDetections).where(where);
        return { detections: rows, total: total?.count ?? 0 };
      }),

    getDiseaseDetection: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [row] = await db
          .select()
          .from(diseaseDetections)
          .where(eq(diseaseDetections.id, input.id))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Detection not found" });
        return row;
      }),

    updateDiseaseDetectionStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["active", "resolved", "ignored"]),
        reviewNote: z.string().max(2000).nullish(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [existing] = await db
          .select({ status: diseaseDetections.status })
          .from(diseaseDetections)
          .where(eq(diseaseDetections.id, input.id))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Detection not found" });
        const oldStatus = existing.status;
        await db
          .update(diseaseDetections)
          .set({ status: input.status })
          .where(eq(diseaseDetections.id, input.id));
        const action =
          input.status === "resolved" ? "disease_detection_resolved" :
          input.status === "ignored" ? "disease_detection_ignored" :
          "disease_detection_reopened";
        await db.insert(adminAuditLogs).values(
          buildDiseaseAuditEntry({
            adminEmail: getActorEmail(ctx),
            action,
            targetDetectionId: input.id,
            details: { oldStatus, newStatus: input.status, reviewNote: input.reviewNote ?? null },
            ipAddress: getIpAddress(ctx.req),
          }),
        );
        return { success: true, oldStatus, newStatus: input.status };
      }),

    // ── AI Oversight (canonical aiAdviceHistory + copilotConversations + aiFeedback) ──
    // Read-only observability. No mutations — canonical schema doesn't track
    // latency/tokens/success; that's a separate concern handled by apps/main's
    // telemetry pipeline (not exposed to admin in Phase 3d).

    listAiAdviceHistory: adminProcedure
      .input(z.object({
        cropType: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const where = input.cropType ? like(aiAdviceHistory.cropType, `%${input.cropType}%`) : undefined;
        const rows = await db
          .select()
          .from(aiAdviceHistory)
          .where(where)
          .orderBy(desc(aiAdviceHistory.createdAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db.select({ count: count() }).from(aiAdviceHistory).where(where);
        return { advice: rows, total: total?.count ?? 0 };
      }),

    listCopilotConversations: adminProcedure
      .input(z.object({
        userId: z.number().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const where = input.userId ? eq(copilotConversations.userId, input.userId) : undefined;
        const rows = await db
          .select()
          .from(copilotConversations)
          .where(where)
          .orderBy(desc(copilotConversations.createdAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db.select({ count: count() }).from(copilotConversations).where(where);
        return { conversations: rows, total: total?.count ?? 0 };
      }),

    listAiFeedback: adminProcedure
      .input(z.object({
        feedback: z.enum(["all", "positive", "negative"]).default("all"),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const where = input.feedback === "all" ? undefined : eq(aiFeedback.feedback, input.feedback);
        const rows = await db
          .select()
          .from(aiFeedback)
          .where(where)
          .orderBy(desc(aiFeedback.createdAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db.select({ count: count() }).from(aiFeedback).where(where);
        const [positiveCount] = await db.select({ count: count() }).from(aiFeedback).where(eq(aiFeedback.feedback, "positive"));
        const [negativeCount] = await db.select({ count: count() }).from(aiFeedback).where(eq(aiFeedback.feedback, "negative"));
        return {
          feedback: rows,
          total: total?.count ?? 0,
          positiveCount: positiveCount?.count ?? 0,
          negativeCount: negativeCount?.count ?? 0,
        };
      }),

    // ── Admin Audit Logs (canonical) ──────────────────────────────────────
    // Reads canonical adminAuditLogs (the destination for all Phase 1-3 admin
    // mutations). The admin-local activityLogs table is orphaned in Phase 4.

    listAdminAuditLogs: adminProcedure
      .input(z.object({
        targetType: z.string().optional(),
        action: z.string().optional(),
        adminEmail: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(30),
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const offset = (input.page - 1) * input.limit;
        const conditions = [];
        if (input.targetType) conditions.push(eq(adminAuditLogs.targetType, input.targetType));
        if (input.action) conditions.push(eq(adminAuditLogs.action, input.action));
        if (input.adminEmail) conditions.push(like(adminAuditLogs.adminEmail, `%${input.adminEmail}%`));
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db
          .select()
          .from(adminAuditLogs)
          .where(where)
          .orderBy(desc(adminAuditLogs.createdAt))
          .limit(input.limit)
          .offset(offset);
        const [total] = await db.select({ count: count() }).from(adminAuditLogs).where(where);
        return { logs: rows, total: total?.count ?? 0 };
      }),

    // ── Feature Flags (canonical, non-operator) ───────────────────────────
    // Reads/writes canonical @betterfarm/db.featureFlags. The 5 operator
    // kill-switches (voice_enabled, xtts_allowed, device_tts_allowed,
    // background_flush_enabled, learning_telemetry_enabled) are filtered OUT
    // since they're managed on the Operator page. This page shows the
    // insurance/AI/data-ingestion product flags only.

    listNonOperatorFlags: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const OPERATOR_FLAG_KEYS = [
        "voice_enabled",
        "xtts_allowed",
        "device_tts_allowed",
        "background_flush_enabled",
        "learning_telemetry_enabled",
      ];
      const all = await db.select().from(featureFlags).orderBy(featureFlags.flagKey);
      return all.filter((f) => !OPERATOR_FLAG_KEYS.includes(f.flagKey));
    }),

    setNonOperatorFlag: adminProcedure
      .input(z.object({ flagKey: z.string().min(1).max(100), flagValue: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const OPERATOR_FLAG_KEYS = [
          "voice_enabled",
          "xtts_allowed",
          "device_tts_allowed",
          "background_flush_enabled",
          "learning_telemetry_enabled",
        ];
        if (OPERATOR_FLAG_KEYS.includes(input.flagKey)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `'${input.flagKey}' is an operator kill switch — manage from the Operator page, not Settings`,
          });
        }
        const [existing] = await db
          .select({ flagValue: featureFlags.flagValue })
          .from(featureFlags)
          .where(eq(featureFlags.flagKey, input.flagKey))
          .limit(1);
        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Flag '${input.flagKey}' not found. Seed flags must be added via main app's flag seeding code, not admin.`,
          });
        }
        const oldValue = existing.flagValue;
        const adminEmail = getActorEmail(ctx);
        await db
          .update(featureFlags)
          .set({ flagValue: input.flagValue, updatedBy: adminEmail })
          .where(eq(featureFlags.flagKey, input.flagKey));
        await db.insert(adminAuditLogs).values({
          adminEmail,
          action: "feature_flag_toggled",
          targetType: "feature_flag",
          targetId: null,
          details: JSON.stringify({ flagKey: input.flagKey, oldValue, newValue: input.flagValue }),
          ipAddress: getIpAddress(ctx.req),
        });
        return { success: true, oldValue, newValue: input.flagValue };
      }),

    // Analytics + Revenue + Marketplace + Reports/Tickets/Farms procedures were
    // removed in Phase 4c. Their pages now show "coming soon" stubs (Marketplace,
    // Revenue, Analytics) or redirect (Farms → Verification). The canonical
    // replacements: listContentReports/listMessageReports (Reports), listSupportEmails
    // (Support), listVerificationRequests (Verification), listDiseaseDetections
    // (DiseaseDetection), getDashboardStats (Dashboard, SystemHealth).

    operator: operatorRouter,

    // ── AI Assistant Panel (OpenRouter) ───────────────────────────────────
    // admin.chat.send: single-shot chat completion. No streaming, no tool
    // use, no page-context server-side wiring yet (props accepted on the
    // input schema for API stability, ignored by this checkpoint).
    chat: adminChatRouter,
  }),
});

export type AppRouter = typeof appRouter;
