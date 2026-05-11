/**
 * Operator tRPC sub-router — the admin web portal's write surface for the 5 voice
 * kill-switches and 11 operator tunables. Mounted under appRouter.admin.operator.
 *
 * Reads/writes the canonical @betterfarm/db.featureFlags and @betterfarm/db.operatorTunables
 * tables (NOT the admin-local feature_flags table — those are a Phase 4 reconciliation
 * concern). Every successful write inserts an adminAuditLogs row.
 *
 * Cache invalidation across processes is OUT OF SCOPE for Phase 1: the main app's
 * operator-config-builder caches the response payload for 5s. Admin writes propagate
 * within ~5s + 30s probe = max ~35s lag. Document this latency in the UI.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { adminAuditLogs, featureFlags, operatorTunables } from "@betterfarm/db";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  OPERATOR_FLAG_KEYS,
  OPERATOR_TUNABLE_DEFS,
  OPERATOR_TUNABLE_KEYS,
  buildOperatorAuditEntry,
  computeOperatorVersion,
  isOperatorFlagKey,
  isOperatorTunableKey,
  validateTunableValue,
  type TunableValue,
} from "./operator-helpers";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

function getActorEmail(ctx: { user: { email: string | null; name: string | null } }): string {
  return ctx.user.email || ctx.user.name || "admin@unknown";
}

function getIpAddress(req: { ip?: string; headers: Record<string, unknown> }): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0]?.trim() ?? null;
  return req.ip ?? null;
}

export const operatorRouter = router({
  /**
   * Read the current operator config: all 5 kill-switches (with default-true fallback),
   * all 11 tunables (with seeded defaults overlaid by DB rows), and the deterministic sha1.
   */
  getConfig: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const [flagRows, tunableRows] = await Promise.all([
      db.select().from(featureFlags),
      db.select().from(operatorTunables),
    ]);

    const flagByKey = new Map(flagRows.map((r) => [r.flagKey, r.flagValue] as const));
    const flags: Record<string, boolean> = {};
    for (const k of OPERATOR_FLAG_KEYS) {
      const v = flagByKey.get(k);
      flags[k] = typeof v === "boolean" ? v : true;
    }

    const tunables: Record<string, TunableValue> = {};
    for (const k of OPERATOR_TUNABLE_KEYS) tunables[k] = OPERATOR_TUNABLE_DEFS[k].default;
    for (const r of tunableRows) {
      if (isOperatorTunableKey(r.tunableKey)) tunables[r.tunableKey] = r.tunableValue as TunableValue;
    }

    const version = computeOperatorVersion({ flags, tunables });

    return {
      flags,
      tunables,
      version,
      defs: OPERATOR_TUNABLE_DEFS,
      flagKeys: OPERATOR_FLAG_KEYS as readonly string[],
    };
  }),

  /**
   * Toggle one kill-switch flag. Validates key allowlist, writes the row (upsert via
   * INSERT…ON DUPLICATE KEY UPDATE to handle never-seeded keys), audit-logs the change.
   */
  setFlag: adminProcedure
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.boolean(),
        reason: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isOperatorFlagKey(input.key)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `flag key '${input.key}' is not an operator kill-switch (allowlist: ${OPERATOR_FLAG_KEYS.join(", ")})`,
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const existing = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.flagKey, input.key))
        .limit(1);
      const oldValue = existing[0]?.flagValue ?? null;

      const adminEmail = getActorEmail(ctx);
      await db
        .insert(featureFlags)
        .values({
          flagKey: input.key,
          flagValue: input.value,
          updatedBy: adminEmail,
        })
        .onDuplicateKeyUpdate({
          set: { flagValue: input.value, updatedBy: adminEmail },
        });

      const [row] = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.flagKey, input.key))
        .limit(1);

      await db.insert(adminAuditLogs).values(
        buildOperatorAuditEntry({
          adminEmail,
          action: "operator_flag_set",
          targetType: "feature_flag",
          targetId: row?.id ?? null,
          details: {
            key: input.key,
            oldValue,
            newValue: input.value,
            reason: input.reason ?? null,
          },
          ipAddress: getIpAddress(ctx.req),
        }),
      );

      return { success: true, key: input.key, value: input.value };
    }),

  /**
   * Set one operator tunable. Validates key + value type + range, upserts, audit-logs.
   * Tunables not yet wired by the client are still writable (they take effect once
   * Phase 2 wires the consumers).
   */
  setTunable: adminProcedure
    .input(
      z.object({
        key: z.string().min(1).max(100),
        value: z.union([z.number(), z.string(), z.boolean()]),
        reason: z.string().max(500).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const validationError = validateTunableValue(input.key, input.value);
      if (validationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `tunable validation failed: ${validationError}`,
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const existing = await db
        .select()
        .from(operatorTunables)
        .where(eq(operatorTunables.tunableKey, input.key))
        .limit(1);
      const oldValue = existing[0]?.tunableValue ?? null;

      const adminEmail = getActorEmail(ctx);
      await db
        .insert(operatorTunables)
        .values({
          tunableKey: input.key,
          tunableValue: input.value,
          updatedBy: adminEmail,
        })
        .onDuplicateKeyUpdate({
          set: { tunableValue: input.value, updatedBy: adminEmail },
        });

      const [row] = await db
        .select()
        .from(operatorTunables)
        .where(eq(operatorTunables.tunableKey, input.key))
        .limit(1);

      await db.insert(adminAuditLogs).values(
        buildOperatorAuditEntry({
          adminEmail,
          action: "operator_tunable_set",
          targetType: "operator_tunable",
          targetId: row?.id ?? null,
          details: {
            key: input.key,
            oldValue,
            newValue: input.value,
            reason: input.reason ?? null,
          },
          ipAddress: getIpAddress(ctx.req),
        }),
      );

      return { success: true, key: input.key, value: input.value };
    }),
});
