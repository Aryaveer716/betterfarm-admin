import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, like, or, sql } from "drizzle-orm";
import { appAnomalies, knownIssues, recoveryAttempts } from "@betterfarm/db";
import { getDb } from "./db";

/**
 * Admin Health Router (admin BFF mirror) — read+mutation procedures for the
 * admin health board. Procedure bodies mirror the canonical implementation in
 * `apps/main/server/admin-health-router.ts` verbatim, with two adjustments
 * appropriate for this BFF:
 *
 *  1. `protectedProcedure` → `adminProcedure` (admin's `adminProcedure`
 *     middleware enforces `ctx.user.role === "admin"` and throws FORBIDDEN
 *     for non-admins before the body runs).
 *  2. The `requireAdminRole(ctx.user.role)` line at the top of each body is
 *     dropped — the middleware already gates access, so it would be redundant.
 *
 * Reads from:
 *  - `knownIssues` (rolled-up registry, written by admin-health-rollup worker
 *    in apps/main)
 *  - `appAnomalies` (raw occurrences)
 *  - `recoveryAttempts` (silent-recovery telemetry)
 *
 * The DB is shared across both apps via `@betterfarm/db`; the rollup worker
 * runs only in apps/main, so this BFF is a read+mutation surface only.
 */

export const adminHealthRouter = router({
  // ─── List with filters + pagination ─────────────────────────────────────────
  getOpenIssues: adminProcedure
    .input(
      z.object({
        status: z
          .enum(["open", "acknowledged", "investigating", "resolved", "all"])
          .default("open"),
        kind: z
          .enum(["render_error", "network_error", "auth_expired", "all"])
          .default("all"),
        sortBy: z.enum(["hitCount", "lastSeen", "affectedUsers"]).default("hitCount"),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
        search: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const wheres = [];
      if (input.status !== "all") {
        wheres.push(eq(knownIssues.status, input.status));
      }
      if (input.kind !== "all") {
        wheres.push(eq(knownIssues.kind, input.kind));
      }
      if (input.search) {
        const term = `%${input.search}%`;
        wheres.push(
          or(like(knownIssues.title, term), like(knownIssues.fingerprint, term))!,
        );
      }
      const whereClause = wheres.length > 0 ? and(...wheres) : undefined;

      const orderCol =
        input.sortBy === "hitCount"
          ? knownIssues.hitCount
          : input.sortBy === "lastSeen"
            ? knownIssues.lastSeen
            : knownIssues.affectedUsers;

      const rowsP = db
        .select()
        .from(knownIssues)
        .where(whereClause as never)
        .orderBy(desc(orderCol))
        .limit(input.limit)
        .offset(input.offset);
      const totalP = db
        .select({ c: count() })
        .from(knownIssues)
        .where(whereClause as never);
      const [rows, totalRes] = await Promise.all([rowsP, totalP]);
      return { rows, total: Number(totalRes[0]?.c ?? 0) };
    }),

  // ─── One issue's curated row + 24h sparkline ────────────────────────────────
  getIssueDetail: adminProcedure
    .input(z.object({ fingerprint: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }
      const issueRows = await db
        .select()
        .from(knownIssues)
        .where(eq(knownIssues.fingerprint, input.fingerprint))
        .limit(1);
      if (issueRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
      }

      // 24h sparkline — one bucket per hour, chronological.
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const buckets = await db
        .select({
          tsHour: sql<string>`DATE_FORMAT(${appAnomalies.occurredAt}, '%Y-%m-%d %H:00:00')`.as(
            "ts_hour",
          ),
          count: sql<number>`COUNT(*)`.as("c"),
        })
        .from(appAnomalies)
        .where(
          and(
            eq(appAnomalies.fingerprint, input.fingerprint),
            gte(appAnomalies.occurredAt, dayAgo),
          )!,
        )
        .groupBy(sql`DATE_FORMAT(${appAnomalies.occurredAt}, '%Y-%m-%d %H:00:00')`)
        .orderBy(
          asc(sql`DATE_FORMAT(${appAnomalies.occurredAt}, '%Y-%m-%d %H:00:00')`),
        );

      // Pad to exactly 24 buckets (oldest first), filling missing hours with 0.
      const sparkline: { tsHour: string; count: number }[] = [];
      const bucketMap = new Map(buckets.map((b) => [b.tsHour, Number(b.count)]));
      for (let i = 23; i >= 0; i--) {
        const dt = new Date(Date.now() - i * 60 * 60 * 1000);
        dt.setMinutes(0, 0, 0);
        const yr = dt.getFullYear();
        const mo = String(dt.getMonth() + 1).padStart(2, "0");
        const da = String(dt.getDate()).padStart(2, "0");
        const ho = String(dt.getHours()).padStart(2, "0");
        const key = `${yr}-${mo}-${da} ${ho}:00:00`;
        sparkline.push({ tsHour: key, count: bucketMap.get(key) ?? 0 });
      }

      return { issue: issueRows[0]!, sparkline };
    }),

  // ─── Raw occurrences (paginated drill-down) ─────────────────────────────────
  getIssueOccurrences: adminProcedure
    .input(
      z.object({
        fingerprint: z.string().min(1).max(128),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }
      const rowsP = db
        .select()
        .from(appAnomalies)
        .where(eq(appAnomalies.fingerprint, input.fingerprint))
        .orderBy(desc(appAnomalies.occurredAt))
        .limit(input.limit)
        .offset(input.offset);
      const totalP = db
        .select({ c: count() })
        .from(appAnomalies)
        .where(eq(appAnomalies.fingerprint, input.fingerprint));
      const [rows, totalRes] = await Promise.all([rowsP, totalP]);
      return { rows, total: Number(totalRes[0]?.c ?? 0) };
    }),

  // ─── Recovery breakdown for one fingerprint ─────────────────────────────────
  getRecoveryStatsForFingerprint: adminProcedure
    .input(z.object({ fingerprint: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }
      const rows = await db
        .select({
          action: recoveryAttempts.action,
          outcome: recoveryAttempts.outcome,
          c: count(),
        })
        .from(recoveryAttempts)
        .where(eq(recoveryAttempts.fingerprint, input.fingerprint))
        .groupBy(recoveryAttempts.action, recoveryAttempts.outcome);

      // Pivot to byAction[] + total
      const byActionMap = new Map<
        string,
        { action: string; success: number; failed: number; suppressed: number }
      >();
      const total = { success: 0, failed: 0, suppressed: 0 };
      for (const r of rows) {
        const c = Number(r.c);
        if (!byActionMap.has(r.action)) {
          byActionMap.set(r.action, {
            action: r.action,
            success: 0,
            failed: 0,
            suppressed: 0,
          });
        }
        const entry = byActionMap.get(r.action)!;
        if (r.outcome === "success") {
          entry.success += c;
          total.success += c;
        } else if (r.outcome === "failed") {
          entry.failed += c;
          total.failed += c;
        } else if (r.outcome === "suppressed") {
          entry.suppressed += c;
          total.suppressed += c;
        }
      }
      return { byAction: Array.from(byActionMap.values()), total };
    }),

  // ─── Dashboard tile summary ────────────────────────────────────────────────
  getHealthSummary: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Database not available",
      });
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const openCountP = db
      .select({ c: count() })
      .from(knownIssues)
      .where(eq(knownIssues.status, "open"));
    const newCountP = db
      .select({ c: count() })
      .from(knownIssues)
      .where(gte(knownIssues.createdAt, yesterday));
    const topP = db
      .select()
      .from(knownIssues)
      .where(eq(knownIssues.status, "open"))
      .orderBy(desc(knownIssues.hitCount))
      .limit(1);

    const [openRes, newRes, topRes] = await Promise.all([openCountP, newCountP, topP]);
    return {
      openCount: Number(openRes[0]?.c ?? 0),
      newSinceYesterday: Number(newRes[0]?.c ?? 0),
      topFingerprint: topRes[0]
        ? {
            fingerprint: topRes[0].fingerprint,
            title: topRes[0].title,
            hitCount: topRes[0].hitCount,
          }
        : null,
    };
  }),

  // ─── Status workflow ───────────────────────────────────────────────────────
  // Walks the issue through open → acknowledged → investigating → resolved.
  // Audit columns (acknowledgedBy/At, resolvedBy/At) are stamped the FIRST
  // time we leave `open` and never cleared, so re-opening an issue preserves
  // the original triage history.
  updateKnownIssueStatus: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        status: z.enum(["open", "acknowledged", "investigating", "resolved"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const rows = await db
        .select()
        .from(knownIssues)
        .where(eq(knownIssues.id, input.id))
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
      }
      const existing = rows[0]!;

      const now = new Date();
      const set: Record<string, unknown> = {
        status: input.status,
        updatedAt: now,
      };

      // Audit columns: set the FIRST time we leave `open`; never clear.
      if (input.status === "acknowledged" || input.status === "investigating") {
        if (!existing.acknowledgedAt) {
          set.acknowledgedBy = ctx.user.id;
          set.acknowledgedAt = now;
        }
      } else if (input.status === "resolved") {
        if (!existing.acknowledgedAt) {
          set.acknowledgedBy = ctx.user.id;
          set.acknowledgedAt = now;
        }
        set.resolvedBy = ctx.user.id;
        set.resolvedAt = now;
      }
      // status === "open" → re-open. Don't clear audit columns; preserve history.

      await db
        .update(knownIssues)
        .set(set)
        .where(eq(knownIssues.id, input.id));
      return { success: true } as const;
    }),

  // ─── Upsert admin-curated row ──────────────────────────────────────────────
  // Two paths:
  //   1. `id` provided → straight UPDATE by id.
  //   2. No `id` → look up by fingerprint; UPDATE if found, INSERT otherwise.
  // The rollup worker fills in aggregate columns (hitCount, affectedUsers,
  // lastSeen, recoverySuccessRate) on the next tick; an admin-created row
  // starts with zeros for those required not-null fields.
  upsertKnownIssue: adminProcedure
    .input(
      z.object({
        id: z.number().int().optional(),
        fingerprint: z.string().min(1).max(128),
        title: z.string().min(1).max(256),
        description: z.string().optional(),
        farmerMessage: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      if (input.id !== undefined) {
        await db
          .update(knownIssues)
          .set({
            title: input.title,
            description: input.description ?? null,
            farmerMessage: input.farmerMessage ?? null,
            updatedAt: new Date(),
          })
          .where(eq(knownIssues.id, input.id));
        return { success: true, action: "updated" as const };
      }

      // Create or update by fingerprint.
      const existing = await db
        .select({ id: knownIssues.id })
        .from(knownIssues)
        .where(eq(knownIssues.fingerprint, input.fingerprint))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(knownIssues)
          .set({
            title: input.title,
            description: input.description ?? null,
            farmerMessage: input.farmerMessage ?? null,
            updatedAt: new Date(),
          })
          .where(eq(knownIssues.fingerprint, input.fingerprint));
        return { success: true, action: "updated" as const };
      }

      // First-time insert from admin (the rollup will fill aggregates later).
      const now = new Date();
      await db.insert(knownIssues).values({
        fingerprint: input.fingerprint,
        status: "open",
        kind: "render_error", // placeholder; rollup will refresh
        title: input.title,
        description: input.description ?? null,
        farmerMessage: input.farmerMessage ?? null,
        firstSeen: now,
        lastSeen: now,
        hitCount: 0,
        affectedUsers: 0,
      });
      return { success: true, action: "created" as const };
    }),
});
