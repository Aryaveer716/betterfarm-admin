/**
 * User-moderation helpers — paralleling apps/admin/server/operator-helpers.ts.
 * Provides the audit-log row builder for the suspend/ban/strike/shadow-ban suite.
 *
 * Audit logs go to the canonical @betterfarm/db.adminAuditLogs table (not admin-local
 * activityLogs). adminEmail is required (varchar(320), NOT NULL); details must be
 * JSON.stringify'd before insert.
 */

import { type adminAuditLogs } from "@betterfarm/db";

export type UserModerationAction =
  | "user_suspended"
  | "user_unsuspended"
  | "user_banned"
  | "user_unbanned"
  | "user_shadow_banned"
  | "user_shadow_ban_removed"
  | "user_strike_issued"
  | "user_strikes_cleared";

export function buildUserModerationAuditEntry(args: {
  adminEmail: string;
  action: UserModerationAction;
  targetUserId: number;
  details: Record<string, unknown>;
  ipAddress: string | null;
}): typeof adminAuditLogs.$inferInsert {
  return {
    adminEmail: args.adminEmail,
    action: args.action,
    targetType: "user",
    targetId: args.targetUserId,
    details: JSON.stringify(args.details),
    ipAddress: args.ipAddress,
  };
}
