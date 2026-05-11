/**
 * Support-emails helpers — paralleling operator-helpers.ts and users-moderation-helpers.ts.
 * Audit-log builder for the supportEmails admin write surface.
 */

import { type adminAuditLogs } from "@betterfarm/db";

export type SupportEmailAction = "support_email_status_changed";

export function buildSupportEmailAuditEntry(args: {
  adminEmail: string;
  action: SupportEmailAction;
  targetEmailId: number;
  details: Record<string, unknown>;
  ipAddress: string | null;
}): typeof adminAuditLogs.$inferInsert {
  return {
    adminEmail: args.adminEmail,
    action: args.action,
    targetType: "support_email",
    targetId: args.targetEmailId,
    details: JSON.stringify(args.details),
    ipAddress: args.ipAddress,
  };
}
