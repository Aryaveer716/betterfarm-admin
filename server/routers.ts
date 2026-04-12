import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import {
  users, farmerProfiles, forumPosts, marketplaceListings,
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

    // ── Community / Posts ──────────────────────────────────────────────────
    getPosts: adminProcedure
      .input(z.object({
        search: z.string().optional(),
        isRemoved: z.boolean().optional(),
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
        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db.select().from(forumPosts).where(where).orderBy(desc(forumPosts.createdAt)).limit(input.limit).offset(offset);
        const [total] = await db.select({ count: count() }).from(forumPosts).where(where);
        return { posts: rows, total: total?.count ?? 0 };
      }),

    removePost: adminProcedure
      .input(z.object({ postId: z.number(), reason: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(forumPosts).set({ isRemoved: true, removedReason: input.reason, removedBy: ctx.user.id }).where(eq(forumPosts.id, input.postId));
        await logAction(ctx.user.id, "Removed post", "post", input.postId, { reason: input.reason });
        return { success: true };
      }),

    restorePost: adminProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(forumPosts).set({ isRemoved: false, removedReason: null, removedBy: null }).where(eq(forumPosts.id, input.postId));
        await logAction(ctx.user.id, "Restored post", "post", input.postId);
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
  }),
});

export type AppRouter = typeof appRouter;
