/**
 * Forum-post helpers — audit-log builder for canonical forumPosts admin actions.
 */

import { type adminAuditLogs } from "@betterfarm/db";

export type ForumPostAction =
  | "forum_post_removed"
  | "forum_post_restored"
  | "forum_post_flagged"
  | "forum_post_unflagged";

export function buildForumPostAuditEntry(args: {
  adminEmail: string;
  action: ForumPostAction;
  targetPostId: number;
  details: Record<string, unknown>;
  ipAddress: string | null;
}): typeof adminAuditLogs.$inferInsert {
  return {
    adminEmail: args.adminEmail,
    action: args.action,
    targetType: "forum_post",
    targetId: args.targetPostId,
    details: JSON.stringify(args.details),
    ipAddress: args.ipAddress,
  };
}
