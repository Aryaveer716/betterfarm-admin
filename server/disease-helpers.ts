/**
 * Disease-detection helpers — audit-log builder for diseaseDetections admin actions.
 */

import { type adminAuditLogs } from "@betterfarm/db";

export type DiseaseDetectionAction =
  | "disease_detection_resolved"
  | "disease_detection_ignored"
  | "disease_detection_reopened";

export function buildDiseaseAuditEntry(args: {
  adminEmail: string;
  action: DiseaseDetectionAction;
  targetDetectionId: number;
  details: Record<string, unknown>;
  ipAddress: string | null;
}): typeof adminAuditLogs.$inferInsert {
  return {
    adminEmail: args.adminEmail,
    action: args.action,
    targetType: "disease_detection",
    targetId: args.targetDetectionId,
    details: JSON.stringify(args.details),
    ipAddress: args.ipAddress,
  };
}
