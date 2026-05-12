import { z } from "zod";
import type { TrpcContext } from "../_core/context";
import { appRouter } from "../routers";

/**
 * OpenRouter / OpenAI tool definitions exposed to the admin AI assistant.
 *
 * All tools are READ-ONLY wrappers around existing admin tRPC queries
 * (plus admin.getUserDetail, added in this checkpoint). Each tool's
 * underlying procedure is `adminProcedure`, so the tRPC middleware
 * re-checks ctx.user.role === "admin" on every call — that's the spec's
 * "every tool execution must re-check the admin's auth" rule, satisfied
 * automatically by routing through createCaller(ctx).
 *
 * All limit/page parameters are capped at 25 at the tool-schema layer.
 * The underlying procedures support up to 100, but the AI's tool-use loop
 * is capped at 6 iterations — keep per-call results small enough to fit
 * in the LLM context window across iterations.
 */

const TOOL_LIMIT_MAX = 25;

// JSON schema is what OpenRouter expects in tools[].function.parameters.
// We hand-write these rather than auto-deriving from zod because the JSON
// schema needs `description` fields per property so the model knows when
// to use each.

export const tools = [
  {
    type: "function" as const,
    function: {
      name: "listFarmers",
      description:
        "List farmer users (and optionally admins/moderators) with optional name/email search. Returns paginated rows from the canonical users table. Use this to find users by name or email substring, or to enumerate recent signups.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description: "Substring matched against user name or email (case-insensitive LIKE %term%). Optional.",
          },
          role: {
            type: "string",
            enum: ["user", "admin", "all"],
            description: 'Filter by role. "user" = farmers (default), "admin" = admin staff, "all" = both.',
            default: "user",
          },
          page: { type: "number", description: "1-indexed page number", default: 1 },
          limit: { type: "number", description: "Page size (max 25)", default: 20 },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getFarmerDetail",
      description:
        "Look up one user by id. Returns the full row from the users table. Use this after listFarmers narrowed the id, or when the admin gives you a specific user id.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Numeric user id" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getUsageStats",
      description:
        "Returns a snapshot of current totals across the platform: total users, posts, flagged posts, unread support emails, pending content reports, pending verifications, active disease detections, total AI advice rows, total copilot conversations. ALSO returns the 5 most recent users + emails and 10 most recent admin audit logs. This is a snapshot of right-now state, NOT time-windowed metrics — if asked about deltas over time, mention that you only have current totals.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "listRecentConversations",
      description:
        "List recent copilotConversations rows (Dusty's turn-by-turn chat history with users). Ordered by createdAt DESC. Useful for finding what Dusty has been saying to a specific user, or surveying recent assistant activity.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "number", description: "Filter to one user. Optional." },
          page: { type: "number", default: 1 },
          limit: { type: "number", description: "Page size (max 25)", default: 20 },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getSystemHealth",
      description:
        "Returns current open issues count, count of new issues since yesterday, and the worst current issue (highest hit count). This reflects APP-LEVEL anomaly health from the appAnomalies + knownIssues tables. For deeper infra status (DB, queue, voice server) we don't have a tool yet — say so honestly if asked about that.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "searchAuditLogs",
      description:
        "Search the adminAuditLogs table — every admin action (role changes, suspensions, bans, post removals, etc.) is logged here. Filter by target type (e.g., 'user', 'post', 'email'), action (e.g., 'user_suspended'), or admin email substring. Ordered by createdAt DESC.",
      parameters: {
        type: "object",
        properties: {
          targetType: { type: "string", description: "Exact match (e.g., 'user', 'post', 'email')" },
          action: { type: "string", description: "Exact match (e.g., 'user_suspended', 'post_removed')" },
          adminEmail: { type: "string", description: "Substring LIKE match against the actor admin's email" },
          page: { type: "number", default: 1 },
          limit: { type: "number", description: "Page size (max 25)", default: 25 },
        },
        required: [],
      },
    },
  },
];

// Zod schemas for VALIDATING the LLM-supplied arguments before dispatch.
// These mirror the JSON schemas above but also enforce the limit-25 cap
// even if the LLM tries to override the default.
const listFarmersArgs = z.object({
  search: z.string().max(200).optional(),
  role: z.enum(["user", "admin", "all"]).default("user"),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(TOOL_LIMIT_MAX).default(20),
});

const getFarmerDetailArgs = z.object({
  id: z.number().int(),
});

const listRecentConversationsArgs = z.object({
  userId: z.number().int().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(TOOL_LIMIT_MAX).default(20),
});

const searchAuditLogsArgs = z.object({
  targetType: z.string().max(64).optional(),
  action: z.string().max(64).optional(),
  adminEmail: z.string().max(200).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(TOOL_LIMIT_MAX).default(25),
});

export interface ToolExecution {
  /** Markdown blockquote summarizing the call for the inline transcript */
  callSummary: string;
  /** Markdown blockquote summarizing the result for the inline transcript */
  resultSummary: string;
  /** JSON string fed back to the LLM as the tool message content */
  toolMessageContent: string;
}

/**
 * Run a tool. Validates args, calls the underlying tRPC procedure via
 * createCaller(ctx) (which routes through adminProcedure middleware =>
 * re-checks admin role per call), returns a structured execution result
 * with separate fields for (a) what to show inline to the admin via
 * markdown, and (b) what to feed back to the LLM as the tool message.
 *
 * Note on router topology: `adminHealth` is a TOP-LEVEL sibling of `admin`
 * in the appRouter (see routers.ts line 59), so the caller path for
 * health is `caller.adminHealth.getHealthSummary()`, not nested under
 * `caller.admin`. The other 5 tools all live under `caller.admin.*`.
 */
export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: TrpcContext,
): Promise<ToolExecution> {
  // Parse the LLM-supplied arguments string. The model usually returns
  // valid JSON but defensive parsing is cheap.
  let parsedArgs: unknown;
  try {
    parsedArgs = rawArgs.trim().length === 0 ? {} : JSON.parse(rawArgs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse_failed";
    return {
      callSummary: `> **${name}** — invalid arguments JSON`,
      resultSummary: `> Tool arg parse failed: ${msg}`,
      toolMessageContent: JSON.stringify({ error: "Invalid arguments JSON", detail: msg }),
    };
  }

  const caller = appRouter.createCaller(ctx);
  const adminCaller = caller.admin;

  try {
    switch (name) {
      case "listFarmers": {
        const args = listFarmersArgs.parse(parsedArgs);
        const result = await adminCaller.getUsers(args);
        return {
          callSummary: `> **listFarmers**(\`${JSON.stringify(args)}\`)`,
          resultSummary: `> Found ${result.total} matching, returning ${result.users.length} on page ${args.page}`,
          toolMessageContent: JSON.stringify(result),
        };
      }
      case "getFarmerDetail": {
        const args = getFarmerDetailArgs.parse(parsedArgs);
        const result = await adminCaller.getUserDetail(args);
        return {
          callSummary: `> **getFarmerDetail**(\`{"id":${args.id}}\`)`,
          resultSummary: `> User ${result.user.id}: ${result.user.name ?? "<no name>"} (${result.user.email ?? "<no email>"}), role: ${result.user.role}`,
          toolMessageContent: JSON.stringify(result),
        };
      }
      case "getUsageStats": {
        const result = await adminCaller.getDashboardStats();
        const s = result.stats;
        return {
          callSummary: `> **getUsageStats**()`,
          resultSummary: `> ${s.totalUsers} users, ${s.totalPosts} posts, ${s.flaggedPosts} flagged, ${s.pendingContentReports} pending reports, ${s.pendingVerifications} pending verifications, ${s.totalConversations} copilot conversations`,
          toolMessageContent: JSON.stringify(result),
        };
      }
      case "listRecentConversations": {
        const args = listRecentConversationsArgs.parse(parsedArgs);
        const result = await adminCaller.listCopilotConversations(args);
        return {
          callSummary: `> **listRecentConversations**(\`${JSON.stringify(args)}\`)`,
          resultSummary: `> ${result.total} conversation turns, returning ${result.conversations.length} on page ${args.page}`,
          toolMessageContent: JSON.stringify(result),
        };
      }
      case "getSystemHealth": {
        // adminHealth is mounted as a TOP-LEVEL sibling of admin in appRouter
        // (see routers.ts line 59: `adminHealth: adminHealthRouter`).
        const result = await caller.adminHealth.getHealthSummary();
        const top = result.topFingerprint
          ? `${result.topFingerprint.title} (${result.topFingerprint.hitCount} hits)`
          : "none";
        return {
          callSummary: `> **getSystemHealth**()`,
          resultSummary: `> ${result.openCount} open, +${result.newSinceYesterday} since yesterday, top: ${top}`,
          toolMessageContent: JSON.stringify(result),
        };
      }
      case "searchAuditLogs": {
        const args = searchAuditLogsArgs.parse(parsedArgs);
        const result = await adminCaller.listAdminAuditLogs(args);
        return {
          callSummary: `> **searchAuditLogs**(\`${JSON.stringify(args)}\`)`,
          resultSummary: `> ${result.total} audit log entries, returning ${result.logs.length} on page ${args.page}`,
          toolMessageContent: JSON.stringify(result),
        };
      }
      default:
        return {
          callSummary: `> **${name}** — unknown tool`,
          resultSummary: `> Tool "${name}" is not in the registry.`,
          toolMessageContent: JSON.stringify({ error: `Unknown tool: ${name}` }),
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return {
      callSummary: `> **${name}**(\`${rawArgs.slice(0, 200)}\`)`,
      resultSummary: `> Tool execution failed: ${msg}`,
      toolMessageContent: JSON.stringify({ error: msg }),
    };
  }
}
