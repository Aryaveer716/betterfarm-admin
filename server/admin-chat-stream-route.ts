import type { Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import type { TrpcContext } from "./_core/context";

import {
  OPENROUTER_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_HTTP_REFERER,
  OPENROUTER_X_TITLE,
  GEMINI_BASE_URL,
  GEMINI_FALLBACK_MODEL,
} from "./ai/model-config";
import { tools, executeTool } from "./ai/tool-registry";

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  pageContext: z.unknown().optional(),
  pageIdentifier: z.string().max(128).optional(),
});

interface StreamEvent {
  type: "token" | "done" | "error" | "tool_call" | "tool_result";
  text?: string;
  message?: string;
  finishReason?: string | null;
  name?: string;
  input?: unknown;
  summary?: string;
}

/** OpenAI/OpenRouter/Gemini-OpenAI streaming delta we consume. */
interface OpenAICompatibleDelta {
  role?: string;
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

const MAX_TOOL_ITERATIONS = 6;

interface ProviderConfig {
  /** Human-readable provider name used in error messages. */
  label: string;
  /** Full chat-completions URL. */
  url: string;
  /** Bearer API key. */
  apiKey: string;
  /** Model slug to send in body.model. */
  model: string;
  /** Optional extra headers (OpenRouter uses HTTP-Referer + X-Title). */
  extraHeaders?: Record<string, string>;
}

/**
 * Thrown when the upstream returned HTTP 200 but its SSE payload contained
 * a `{ "error": {...} }` frame. OpenRouter's free tier surfaces rate-limit
 * and provider-side issues this way — the old parser silently dropped them
 * and we'd close the stream with no content, looking like a successful
 * empty completion. Triggers fallback when no tokens were streamed yet.
 */
class UpstreamInStreamError extends Error {
  constructor(
    public providerLabel: string,
    public upstreamMessage: string,
  ) {
    super(`${providerLabel} in-stream error: ${upstreamMessage}`);
    this.name = "UpstreamInStreamError";
  }
}

/**
 * Thrown when iteration 0 of the tool loop produced ZERO content tokens
 * AND ZERO tool calls. Happens with finish_reason "stop"/"length"/
 * "content_filter" on an empty completion — also a silent-fail mode that
 * the old code emitted as `done` with an empty placeholder.
 */
class UpstreamEmptyResponseError extends Error {
  constructor(
    public providerLabel: string,
    public finishReason: string | null,
  ) {
    super(
      `${providerLabel} returned no content (finish_reason=${finishReason ?? "null"})`,
    );
    this.name = "UpstreamEmptyResponseError";
  }
}

/**
 * Runs ONE pass against an OpenAI-compatible chat-completions endpoint
 * with stream:true. Forwards token deltas to the client via the provided
 * emit callback, accumulates tool_calls deltas, surfaces in-stream
 * `error` frames as `UpstreamInStreamError`.
 */
async function runOneStreamingPass(
  cfg: ProviderConfig,
  messages: LLMMessage[],
  signal: AbortSignal,
  emit: (event: StreamEvent) => void,
): Promise<{
  assistantText: string;
  toolCalls: AccumulatedToolCall[];
  finishReason: string | null;
}> {
  const upstream = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(cfg.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      tools,
      stream: true,
    }),
    signal,
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "<empty>");
    throw new Error(`${cfg.label} ${upstream.status}: ${text.slice(0, 500)}`);
  }
  if (!upstream.body) {
    throw new Error(`${cfg.label} returned no response body`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  let finishReason: string | null = null;
  let inStreamError: string | null = null;
  const accumulatedCalls = new Map<number, AccumulatedToolCall>();

  const finalize = (): {
    assistantText: string;
    toolCalls: AccumulatedToolCall[];
    finishReason: string | null;
  } => ({
    assistantText,
    toolCalls: Array.from(accumulatedCalls.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v),
    finishReason,
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const payload = dataLine.slice(6);
      if (payload === "[DONE]") {
        if (inStreamError !== null) {
          throw new UpstreamInStreamError(cfg.label, inStreamError);
        }
        return finalize();
      }
      let parsed: {
        choices?: Array<{
          delta?: OpenAICompatibleDelta;
          finish_reason?: string;
        }>;
        error?: { message?: string; code?: string | number };
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        // Non-JSON keep-alive or comment line — ignore.
        continue;
      }

      // OpenRouter free tier returns 200 + `{ "error": {...} }` SSE frames
      // for rate limits and provider hiccups. Capture and surface — the
      // old parser silently ignored these.
      const errMsg = parsed.error?.message;
      if (typeof errMsg === "string" && errMsg.length > 0) {
        inStreamError = errMsg;
        continue;
      }

      const delta = parsed.choices?.[0]?.delta;
      const text = delta?.content;
      if (typeof text === "string" && text.length > 0) {
        assistantText += text;
        emit({ type: "token", text });
      }
      for (const tc of delta?.tool_calls ?? []) {
        if (tc.index === undefined) continue;
        const existing = accumulatedCalls.get(tc.index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name = tc.function.name;
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        accumulatedCalls.set(tc.index, existing);
      }
      const fr = parsed.choices?.[0]?.finish_reason;
      if (typeof fr === "string") {
        finishReason = fr;
      }
    }
  }
  // Stream ended without an explicit [DONE] frame.
  if (inStreamError !== null) {
    throw new UpstreamInStreamError(cfg.label, inStreamError);
  }
  return finalize();
}

/**
 * Runs the full multi-iteration tool-use loop against ONE provider.
 * Streams tokens through `emit` as they arrive. Throws on any failure;
 * the caller decides whether to fall back.
 */
async function runToolLoop(
  cfg: ProviderConfig,
  messagesForLLM: LLMMessage[],
  signal: AbortSignal,
  emit: (event: StreamEvent) => void,
  trpcCtx: TrpcContext,
): Promise<{ finishReason: string | null }> {
  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const pass = await runOneStreamingPass(cfg, messagesForLLM, signal, emit);

    if (pass.finishReason !== "tool_calls" || pass.toolCalls.length === 0) {
      // Iteration 0 empty completion → throw so the caller can fall back.
      // After iteration 0 it's fine for the model to terminate with no
      // text (e.g., the user got their answer from tool result blocks).
      if (
        iter === 0 &&
        pass.assistantText.length === 0 &&
        pass.toolCalls.length === 0
      ) {
        throw new UpstreamEmptyResponseError(cfg.label, pass.finishReason);
      }
      return { finishReason: pass.finishReason };
    }

    messagesForLLM.push({
      role: "assistant",
      content: pass.assistantText,
      tool_calls: pass.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.arguments },
      })),
    });

    for (const call of pass.toolCalls) {
      let parsedToolInput: unknown = null;
      try {
        parsedToolInput =
          call.arguments.trim().length === 0 ? {} : JSON.parse(call.arguments);
      } catch {
        parsedToolInput = { _raw: call.arguments.slice(0, 200) };
      }
      emit({ type: "tool_call", name: call.name, input: parsedToolInput });

      const execResult = await executeTool(call.name, call.arguments, trpcCtx);

      emit({
        type: "tool_result",
        name: call.name,
        summary: execResult.resultSummary,
      });
      emit({
        type: "token",
        text: `\n\n${execResult.callSummary}\n${execResult.resultSummary}\n\n`,
      });

      messagesForLLM.push({
        role: "tool",
        tool_call_id: call.id,
        content: execResult.toolMessageContent,
      });
    }
  }
  throw new Error(
    `Tool-use loop exceeded ${MAX_TOOL_ITERATIONS} iterations without producing a final answer.`,
  );
}

/**
 * POST /api/admin/chat/stream
 *
 * Body: { messages: Message[], pageContext?: unknown, pageIdentifier?: string }
 * Response: text/event-stream of SSE events. One `data: {...}\n\n` per event.
 *
 * Provider chain:
 *   1. OpenRouter (primary) — required, OPENROUTER_API_KEY.
 *   2. Gemini direct API (fallback) — optional, GEMINI_API_KEY. Uses
 *      Google AI Studio's OpenAI-compatible endpoint so the same pass
 *      function handles both providers.
 *
 * Fallback engages only when the primary fails BEFORE emitting any
 * tokens to the client. Once tokens have been streamed, switching
 * providers would produce a confusing duplicated-prefix turn, so the
 * primary's error is surfaced instead.
 *
 * Auth: hand-checks the same admin role tRPC's adminProcedure enforces
 * (belt-and-suspenders), then each tool execution re-checks via
 * createCaller(ctx) routing through adminProcedure middleware.
 */
export async function adminChatStreamHandler(
  req: Request,
  res: ExpressResponse,
): Promise<void> {
  // 1. Auth — admin-only.
  let user;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  // 2. Validate body.
  const parseResult = bodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid body",
      details: parseResult.error.format(),
    });
    return;
  }
  const input = parseResult.data;

  // 3. Provider keys.
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";

  if (openRouterKey.length === 0) {
    res.status(500).json({
      error: "OPENROUTER_API_KEY is not configured on the admin backend.",
    });
    return;
  }

  // 4. SSE headers.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // 5. AbortController so client disconnect cancels any upstream call
  //    (both primary and fallback share the same signal).
  const ac = new AbortController();
  let upstreamClosed = false;
  req.on("close", () => {
    if (!upstreamClosed) ac.abort();
  });

  // 6. Emitter wrapping res.write that tracks token events emitted so
  //    we can decide whether a primary failure is safe to retry.
  let tokensEmittedToClient = 0;
  const emit = (event: StreamEvent): void => {
    if (event.type === "token") tokensEmittedToClient += 1;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const trpcCtx: TrpcContext = { req, res, user };

  // 7. Compose the outgoing messages array.
  const baseMessages: LLMMessage[] = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (input.pageContext !== undefined) {
    const pageContextStr =
      typeof input.pageContext === "string"
        ? input.pageContext.slice(0, 8000)
        : JSON.stringify(input.pageContext, null, 2).slice(0, 8000);
    const pathHint = input.pageIdentifier
      ? ` (path: ${input.pageIdentifier})`
      : "";
    baseMessages.unshift({
      role: "system",
      content: `The admin is currently viewing this data on the dashboard${pathHint}. Use this as background context — it's the data already on their screen.\n\n\`\`\`json\n${pageContextStr}\n\`\`\``,
    });
  }

  const openRouterCfg: ProviderConfig = {
    label: "OpenRouter",
    url: `${OPENROUTER_BASE_URL}/chat/completions`,
    apiKey: openRouterKey,
    model: OPENROUTER_MODEL,
    extraHeaders: {
      "HTTP-Referer": OPENROUTER_HTTP_REFERER,
      "X-Title": OPENROUTER_X_TITLE,
    },
  };
  const geminiCfg: ProviderConfig | null =
    geminiKey.length > 0
      ? {
          label: "Gemini",
          url: `${GEMINI_BASE_URL}/chat/completions`,
          apiKey: geminiKey,
          model: GEMINI_FALLBACK_MODEL,
        }
      : null;

  // 8. Try the primary. Each provider gets its own copy of the message
  //    array — runToolLoop mutates it as it adds assistant + tool turns,
  //    and on failure we want the fallback to start from a clean slate.
  const primaryMessages: LLMMessage[] = baseMessages.map((m) => ({ ...m }));
  let primaryErr: unknown = null;
  let primaryResult: { finishReason: string | null } | null = null;
  try {
    primaryResult = await runToolLoop(
      openRouterCfg,
      primaryMessages,
      ac.signal,
      emit,
      trpcCtx,
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      upstreamClosed = true;
      try {
        res.end();
      } catch {
        // ignore
      }
      return;
    }
    primaryErr = err;
  }

  if (primaryErr === null && primaryResult !== null) {
    emit({ type: "done", finishReason: primaryResult.finishReason });
    upstreamClosed = true;
    res.end();
    return;
  }

  // 9. Primary failed. Decide whether to fall back.
  const canFallback =
    geminiCfg !== null && tokensEmittedToClient === 0;

  if (canFallback && geminiCfg !== null) {
    const fallbackMessages: LLMMessage[] = baseMessages.map((m) => ({ ...m }));
    try {
      const fbResult = await runToolLoop(
        geminiCfg,
        fallbackMessages,
        ac.signal,
        emit,
        trpcCtx,
      );
      emit({ type: "done", finishReason: fbResult.finishReason });
      upstreamClosed = true;
      res.end();
      return;
    } catch (fbErr) {
      if (fbErr instanceof Error && fbErr.name === "AbortError") {
        upstreamClosed = true;
        try {
          res.end();
        } catch {
          // ignore
        }
        return;
      }
      const primaryMsg =
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
      emit({
        type: "error",
        message: `Both providers failed. Primary: ${primaryMsg}. Fallback: ${fbMsg}`,
      });
      upstreamClosed = true;
      res.end();
      return;
    }
  }

  // 10. No fallback available — surface the primary error verbatim.
  const noFallbackReason =
    geminiCfg === null
      ? " (no GEMINI_API_KEY configured for fallback)"
      : " (primary already streamed partial content; fallback would duplicate output)";
  const primaryMsg =
    primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
  emit({
    type: "error",
    message: `${primaryMsg}${noFallbackReason}`,
  });
  upstreamClosed = true;
  res.end();
}
