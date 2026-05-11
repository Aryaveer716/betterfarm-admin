/**
 * Verification helpers — paralleling operator-helpers, users-moderation-helpers, support-emails-helpers.
 * Audit-log builder for the verificationRequests admin write surface.
 */

import { type adminAuditLogs } from "@betterfarm/db";

export type VerificationAction =
  | "verification_approved"
  | "verification_rejected"
  | "verification_more_info_requested";

export function buildVerificationAuditEntry(args: {
  adminEmail: string;
  action: VerificationAction;
  targetVerificationId: number;
  details: Record<string, unknown>;
  ipAddress: string | null;
}): typeof adminAuditLogs.$inferInsert {
  return {
    adminEmail: args.adminEmail,
    action: args.action,
    targetType: "verification_request",
    targetId: args.targetVerificationId,
    details: JSON.stringify(args.details),
    ipAddress: args.ipAddress,
  };
}
