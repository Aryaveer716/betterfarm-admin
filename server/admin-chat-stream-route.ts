import type { Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import type { TrpcContext } from "./_core/context";

import {
  OPENROUTER_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_HTTP_REFERER,
  OPENROUTER_X_TITLE,
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

function sseWrite(res: ExpressResponse, event: StreamEvent): void {
  // SSE events: `data: <json>\n\n`. The blank line is the event terminator.
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** OpenRouter streaming delta we consume. */
interface OpenRouterStreamingDelta {
  role?: string;
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/** Accumulated tool call from a streaming pass. */
interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * The plain OpenAI/OpenRouter "messages" shape — we pass these to the
 * upstream model verbatim. We include `tool_calls` and `tool_call_id` for
 * the multi-turn loop. We don't pin to a vendored type because the API
 * surface is OpenAI-compatible and the shape is stable.
 */
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

/**
 * Runs ONE pass against OpenRouter with stream:true. Forwards token deltas
 * to the client via the SSE token event, and accumulates any tool_calls
 * deltas in-place. Returns the final assistant text, the list of tool
 * calls (if any), and the finish_reason.
 *
 * The caller drives the multi-iteration loop on top of this primitive.
 */
async function runOneOpenRouterPass(
  apiKey: string,
  messages: LLMMessage[],
  signal: AbortSignal,
  res: ExpressResponse,
): Promise<{
  assistantText: string;
  toolCalls: AccumulatedToolCall[];
  finishReason: string | null;
}> {
  const upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": OPENROUTER_HTTP_REFERER,
      "X-Title": OPENROUTER_X_TITLE,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      tools,
      stream: true,
    }),
    signal,
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "<empty>");
    throw new Error(`OpenRouter ${upstream.status}: ${text.slice(0, 500)}`);
  }
  if (!upstream.body) {
    throw new Error("OpenRouter returned no response body");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  let finishReason: string | null = null;
  const accumulatedCalls = new Map<number, AccumulatedToolCall>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // OpenRouter SSE: events are "data: <json>\n\n" separated. Strip
    // everything except the `data: ` line per event block.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const payload = dataLine.slice(6); // strip "data: "
      if (payload === "[DONE]") {
        // Upstream stream ended. Return whatever we've accumulated.
        return {
          assistantText,
          toolCalls: Array.from(accumulatedCalls.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([, v]) => v),
          finishReason,
        };
      }
      let parsed: {
        choices?: Array<{
          delta?: OpenRouterStreamingDelta;
          finish_reason?: string;
        }>;
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        // Non-JSON keep-alive or comment line — ignore.
        continue;
      }

      const delta = parsed.choices?.[0]?.delta;
      const text = delta?.content;
      if (typeof text === "string" && text.length > 0) {
        assistantText += text;
        sseWrite(res, { type: "token", text });
      }
      // Accumulate tool-call deltas per index — arguments arrive
      // character-by-character across multiple chunks.
      for (const tc of delta?.tool_calls ?? []) {
        if (tc.index === undefined) continue;
        const existing =
          accumulatedCalls.get(tc.index) ?? { id: "", name: "", arguments: "" };
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
  // Stream ended without [DONE] — return what we have.
  return {
    assistantText,
    toolCalls: Array.from(accumulatedCalls.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v),
    finishReason,
  };
}

/**
 * POST /api/admin/chat/stream
 *
 * Body: { messages: Message[], pageContext?: unknown, pageIdentifier?: string }
 * Response: text/event-stream of SSE events. One `data: {...}\n\n` per event.
 *
 * Event types:
 *  - { type: "token", text }            — assistant text delta
 *  - { type: "tool_call", name, input } — structured, server-emitted when LLM invokes a tool
 *  - { type: "tool_result", name, summary } — structured, server-emitted after tool returns
 *  - { type: "done", finishReason }     — terminal success
 *  - { type: "error", message }         — terminal failure
 *
 * The structured tool_call / tool_result events are for future audit
 * logging (checkpoint 6). The HUMAN-VISIBLE rendering of tool activity
 * happens via additional `token` events that emit the same info as
 * markdown blockquotes — this keeps the existing client rendering path
 * (placeholder.content += text) working without modification.
 *
 * Auth: hand-checks the same admin role tRPC's adminProcedure enforces
 * (belt-and-suspenders), then each tool execution re-checks via
 * createCaller(ctx) routing through adminProcedure middleware.
 *
 * Page context: if input.pageContext is provided, it's stringified
 * (capped at ~8KB) and prepended as a system message to the messages
 * passed upstream, with input.pageIdentifier as a path hint.
 *
 * Tool-use loop: capped at MAX_TOOL_ITERATIONS=6 passes. If the model
 * keeps calling tools beyond that, we emit an error event.
 *
 * On client disconnect: aborts the upstream OpenRouter fetch and closes the
 * response.
 */
export async function adminChatStreamHandler(
  req: Request,
  res: ExpressResponse,
): Promise<void> {
  // 1. Auth — admin-only
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

  // 2. Validate body
  const parseResult = bodySchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: "Invalid body",
      details: parseResult.error.format(),
    });
    return;
  }
  const input = parseResult.data;

  // 3. API key
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    res.status(500).json({
      error: "OPENROUTER_API_KEY is not configured on the admin backend.",
    });
    return;
  }

  // 4. SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Hint to nginx / similar proxies: do NOT buffer this response.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // 5. AbortController so client disconnect cancels upstream call.
  const ac = new AbortController();
  let upstreamClosed = false;
  req.on("close", () => {
    if (!upstreamClosed) ac.abort();
  });

  // 6. Build tRPC context for tool execution. The createCaller(ctx)
  //    path routes each tool through adminProcedure middleware which
  //    re-checks user.role === "admin" — that's the spec's "every tool
  //    execution must re-check the admin's auth" rule satisfied
  //    automatically.
  const trpcCtx: TrpcContext = { req, res, user };

  // 7. Compose the outgoing messages array, prepending a system message
  //    with the page-context JSON snapshot (if any). The snapshot is
  //    capped to ~8KB to bound prompt size.
  const messagesForLLM: LLMMessage[] = input.messages.map((m) => ({
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
    messagesForLLM.unshift({
      role: "system",
      content: `The admin is currently viewing this data on the dashboard${pathHint}. Use this as background context — it's the data already on their screen.\n\n\`\`\`json\n${pageContextStr}\n\`\`\``,
    });
  }

  // 8. The tool-use loop. Each iteration runs ONE OpenRouter pass.
  //    finish_reason === "tool_calls" means the model wants more data;
  //    we execute the requested tools, append assistant+tool messages
  //    to the conversation, and loop. finish_reason === "stop" (or any
  //    non-tool finish) is terminal.
  try {
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const pass = await runOneOpenRouterPass(
        apiKey,
        messagesForLLM,
        ac.signal,
        res,
      );

      if (pass.finishReason !== "tool_calls" || pass.toolCalls.length === 0) {
        // Terminal — done.
        sseWrite(res, { type: "done", finishReason: pass.finishReason });
        upstreamClosed = true;
        res.end();
        return;
      }

      // Append the assistant turn (text + tool_calls) to the messages.
      messagesForLLM.push({
        role: "assistant",
        content: pass.assistantText,
        tool_calls: pass.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        })),
      });

      // Execute each tool call in order, emit structured + markdown
      // events, then append the tool result as a `tool` message.
      for (const call of pass.toolCalls) {
        let parsedToolInput: unknown = null;
        try {
          parsedToolInput =
            call.arguments.trim().length === 0
              ? {}
              : JSON.parse(call.arguments);
        } catch {
          parsedToolInput = { _raw: call.arguments.slice(0, 200) };
        }
        sseWrite(res, {
          type: "tool_call",
          name: call.name,
          input: parsedToolInput,
        });

        const execResult = await executeTool(
          call.name,
          call.arguments,
          trpcCtx,
        );

        sseWrite(res, {
          type: "tool_result",
          name: call.name,
          summary: execResult.resultSummary,
        });

        // Inline markdown rendering via the existing token channel so
        // the client's placeholder.content accumulator picks it up
        // without needing to handle the new event types.
        sseWrite(res, {
          type: "token",
          text: `\n\n${execResult.callSummary}\n${execResult.resultSummary}\n\n`,
        });

        messagesForLLM.push({
          role: "tool",
          tool_call_id: call.id,
          content: execResult.toolMessageContent,
        });
      }
      // Loop back for the next pass with the augmented messages array.
    }

    // Fell out of the loop — exceeded MAX_TOOL_ITERATIONS without a
    // terminal finish.
    sseWrite(res, {
      type: "error",
      message: `Tool-use loop exceeded ${MAX_TOOL_ITERATIONS} iterations without producing a final answer.`,
    });
    upstreamClosed = true;
    res.end();
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
    sseWrite(res, {
      type: "error",
      message:
        err instanceof Error
          ? `Stream interrupted: ${err.message}`
          : "Stream interrupted",
    });
    upstreamClosed = true;
    res.end();
  }
}
