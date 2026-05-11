/**
 * Operator helpers — pure logic for the operator admin router.
 *
 * Mirrors the allowlists and validation in apps/main/server/operator-config-builder.ts
 * and apps/main/server/operator-tunables.ts. Phase 1 does NOT extract these into a
 * shared package because the writes go through admin's own DB connection; phase 4 may
 * promote these into packages/db if cross-app duplication becomes painful.
 */

import { createHash } from "node:crypto";
import { type adminAuditLogs } from "@betterfarm/db";

/**
 * The 5 kill-switch flag keys the main app's system.health probe pushes to clients.
 * Order matches apps/main/server/operator-config-builder.ts:25-31 — keep aligned so
 * the version sha1 is comparable.
 */
export const OPERATOR_FLAG_KEYS = [
  "voice_enabled",
  "xtts_allowed",
  "device_tts_allowed",
  "background_flush_enabled",
  "learning_telemetry_enabled",
] as const;
export type OperatorFlagKey = (typeof OPERATOR_FLAG_KEYS)[number];

export function isOperatorFlagKey(k: string): k is OperatorFlagKey {
  return (OPERATOR_FLAG_KEYS as readonly string[]).includes(k);
}

/**
 * Per-tunable type + range definitions. Mirrors DEFAULT_TUNABLES in
 * apps/main/server/operator-tunables.ts:29-80 and the validation ranges in
 * apps/main/lib/operator/policy-store.ts:106-172.
 */
export type TunableDef =
  | { type: "number"; default: number; min: number; max: number; description: string; phase: 1 | 2 }
  | { type: "string"; default: string; allowedValues?: readonly string[]; description: string; phase: 1 | 2 }
  | { type: "enum"; default: number; allowedValues: readonly number[]; description: string; phase: 1 | 2 };

export const OPERATOR_TUNABLE_DEFS: Record<string, TunableDef> = {
  "xtts.connectTimeoutMs": { type: "number", default: 5000, min: 500, max: 30000, description: "Max time to wait for XTTS WebSocket connect", phase: 2 },
  "xtts.maxReconnectAttempts": { type: "number", default: 2, min: 0, max: 10, description: "Reconnect attempts per recovery rung", phase: 2 },
  "llm.stallTimeoutMs": { type: "number", default: 6000, min: 1000, max: 60000, description: "Inter-token gap that triggers llm_stall recovery", phase: 1 },
  "llm.maxRetries": { type: "number", default: 2, min: 0, max: 5, description: "LLM small-budget retry count", phase: 2 },
  "llm.smallTokenBudget": { type: "number", default: 120, min: 32, max: 1024, description: "Token cap for fallback fast LLM call", phase: 2 },
  "llm.model": {
    type: "string",
    default: "qwen/qwen-2.5-72b-instruct",
    allowedValues: [
      "qwen/qwen-2.5-72b-instruct",
      "anthropic/claude-haiku-4-5",
      "anthropic/claude-sonnet-4-5",
      "openai/gpt-4o-mini",
      "meta-llama/llama-3.3-70b-instruct",
    ] as const,
    description: "Primary LLM model (OpenRouter slug)",
    phase: 1,
  },
  "audio.chunkSize": { type: "number", default: 1600, min: 320, max: 8000, description: "Capture/playback framing samples", phase: 2 },
  "audio.sampleRate": { type: "enum", default: 24000, allowedValues: [16000, 24000] as const, description: "Audio sample rate (only 16000 or 24000 accepted by client)", phase: 2 },
  "audio.jitterBufferMs": { type: "number", default: 150, min: 0, max: 1000, description: "Playback jitter buffer", phase: 2 },
  "sync.maxRetries": { type: "number", default: 3, min: 0, max: 10, description: "Retries per offline-queue item", phase: 2 },
  "sync.flushConcurrency": { type: "number", default: 3, min: 1, max: 10, description: "Parallel queue items flushed", phase: 2 },
};

export const OPERATOR_TUNABLE_KEYS = Object.keys(OPERATOR_TUNABLE_DEFS);

export function isOperatorTunableKey(k: string): boolean {
  return Object.prototype.hasOwnProperty.call(OPERATOR_TUNABLE_DEFS, k);
}

export type TunableValue = number | string | boolean;

/**
 * Validate a tunable value against its definition.
 * Returns null if valid; otherwise an error message describing the failure.
 */
export function validateTunableValue(key: string, value: unknown): string | null {
  const def = OPERATOR_TUNABLE_DEFS[key];
  if (!def) return `unknown tunable key: ${key}`;
  if (def.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return `expected number, got ${typeof value}`;
    if (value < def.min || value > def.max) return `value ${value} out of range [${def.min}, ${def.max}]`;
    return null;
  }
  if (def.type === "string") {
    if (typeof value !== "string") return `expected string, got ${typeof value}`;
    if (def.allowedValues && !def.allowedValues.includes(value)) {
      return `value ${JSON.stringify(value)} not in allowlist (${def.allowedValues.join(", ")})`;
    }
    return null;
  }
  if (def.type === "enum") {
    if (typeof value !== "number") return `expected number, got ${typeof value}`;
    if (!def.allowedValues.includes(value)) {
      return `value ${value} not in allowlist (${def.allowedValues.join(", ")})`;
    }
    return null;
  }
  return "unhandled tunable type";
}

/**
 * Recursive JSON stringify with sorted object keys for deterministic version hash.
 * Mirrors apps/main/server/operator-config-builder.ts:56-67.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as object).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k])).join(",") + "}";
}

/**
 * Compute the operator config version hash. Same algorithm as
 * apps/main/server/operator-config-builder.ts:91-93 so admin and main agree.
 */
export function computeOperatorVersion(payload: {
  flags: Record<string, boolean>;
  tunables: Record<string, TunableValue>;
}): string {
  return createHash("sha1").update(stableStringify(payload)).digest("hex");
}

/**
 * Build the audit log row payload. Caller inserts into adminAuditLogs.
 * adminEmail is required (varchar(320), NOT NULL); details must be JSON.stringify'd.
 */
export function buildOperatorAuditEntry(args: {
  adminEmail: string;
  action: "operator_flag_set" | "operator_tunable_set";
  targetType: "feature_flag" | "operator_tunable";
  targetId: number | null;
  details: { key: string; oldValue: unknown; newValue: unknown; reason: string | null };
  ipAddress: string | null;
}): typeof adminAuditLogs.$inferInsert {
  return {
    adminEmail: args.adminEmail,
    action: args.action,
    targetType: args.targetType,
    targetId: args.targetId,
    details: JSON.stringify(args.details),
    ipAddress: args.ipAddress,
  };
}
