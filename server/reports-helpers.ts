/**
 * Reports helpers — audit-log builder for content + message report admin actions.
 */

import { type adminAuditLogs } from "@betterfarm/db";

export type ReportAction =
  | "content_report_reviewed"
  | "content_report_dismissed"
  | "content_report_action_taken"
  | "message_report_reviewed"
  | "message_report_dismissed"
  | "message_report_action_taken";

export function buildReportAuditEntry(args: {
  adminEmail: string;
  action: ReportAction;
  targetType: "content_report" | "message_report";
  targetReportId: number;
  details: Record<string, unknown>;
  ipAddress: string | null;
}): typeof adminAuditLogs.$inferInsert {
  return {
    adminEmail: args.adminEmail,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetReportId,
    details: JSON.stringify(args.details),
    ipAddress: args.ipAddress,
  };
}
