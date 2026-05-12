import type { Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";

import {
  OPENROUTER_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_HTTP_REFERER,
  OPENROUTER_X_TITLE,
} from "./ai/model-config";

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
  type: "token" | "done" | "error";
  text?: string;
  message?: string;
  finishReason?: string | null;
}

function sseWrite(res: ExpressResponse, event: StreamEvent): void {
  // SSE events: `data: <json>\n\n`. The blank line is the event terminator.
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * POST /api/admin/chat/stream
 *
 * Body: { messages: Message[], pageContext?: unknown, pageIdentifier?: string }
 * Response: text/event-stream of SSE events. One `data: {...}\n\n` per event.
 *
 * Auth: hand-checks the same admin role tRPC's adminProcedure enforces. Reads
 * the request through sdk.authenticateRequest (the function context.ts uses
 * to populate ctx.user). Belt-and-suspenders re-check inside this handler
 * matches the spec's "every tool execution must re-check the admin's auth"
 * rule, applied at the endpoint level.
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
  // Hint to nginx / similar proxies: do NOT buffer this response. SSE must
  // flush each event immediately.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // 5. AbortController so client disconnect cancels the upstream call.
  const ac = new AbortController();
  let upstreamClosed = false;
  req.on("close", () => {
    if (!upstreamClosed) ac.abort();
  });

  // 6. Call OpenRouter with stream:true. `Response` here is the global
  //    fetch Response — distinct from express's `Response` type, which we
  //    imported as `ExpressResponse` above to avoid the name collision.
  let upstream: Response;
  try {
    upstream = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": OPENROUTER_HTTP_REFERER,
        "X-Title": OPENROUTER_X_TITLE,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: input.messages,
        stream: true,
      }),
      signal: ac.signal,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "unknown";
    if (name === "AbortError") {
      // Client disconnected before request even began. Nothing to do.
      res.end();
      return;
    }
    sseWrite(res, {
      type: "error",
      message:
        err instanceof Error
          ? `OpenRouter call failed: ${err.message}`
          : "OpenRouter call failed",
    });
    res.end();
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "<empty>");
    sseWrite(res, {
      type: "error",
      message: `OpenRouter ${upstream.status}: ${text.slice(0, 500)}`,
    });
    res.end();
    return;
  }

  if (!upstream.body) {
    sseWrite(res, {
      type: "error",
      message: "OpenRouter returned no response body",
    });
    res.end();
    return;
  }

  // 7. Parse OpenRouter's SSE stream chunk-by-chunk, forward token deltas
  //    as { type: "token", text } events to the admin client.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finishReason: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // OpenRouter SSE: events are "data: <json>\n\n" separated. Some
      // events may also have `event:` or `id:` lines, plus comment lines
      // starting with `:` for keep-alive. Strip everything except the
      // `data: ` line.
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? ""; // last partial event stays in buffer

      for (const event of events) {
        const dataLine = event
          .split("\n")
          .find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const payload = dataLine.slice(6); // strip "data: "
        if (payload === "[DONE]") {
          sseWrite(res, { type: "done", finishReason });
          upstreamClosed = true;
          res.end();
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            sseWrite(res, { type: "token", text: delta });
          }
          const fr = parsed.choices?.[0]?.finish_reason;
          if (typeof fr === "string") {
            finishReason = fr;
          }
        } catch {
          // Non-JSON keep-alive or comment line — ignore.
        }
      }
    }
    // Stream ended without [DONE] — close cleanly.
    sseWrite(res, { type: "done", finishReason });
    upstreamClosed = true;
    res.end();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      // Client disconnected — already handled by req.on("close").
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
