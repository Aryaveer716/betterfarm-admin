import { z } from "zod";
import { router, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
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

/**
 * Type guard for the slim subset of OpenRouter's chat-completions response
 * we actually consume. OpenRouter is OpenAI-compatible at the API surface,
 * but we don't pin to the @types/openai shape so we can swap the upstream
 * later without dragging in unrelated SDK types.
 */
interface OpenRouterChatResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; code?: string | number };
}

export const adminChatRouter = router({
  /**
   * Single round-trip request → response. No streaming, no tool-use, no
   * page-context wiring yet (page context props are accepted on the input
   * schema for API stability but ignored by this checkpoint). Adds a
   * 30-second timeout via AbortSignal.
   */
  send: adminProcedure
    .input(
      z.object({
        messages: z.array(messageSchema).min(1).max(50),
        // Reserved for checkpoint 4 — currently unused.
        pageContext: z.unknown().optional(),
        pageIdentifier: z.string().max(128).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey || apiKey.trim().length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "OPENROUTER_API_KEY is not configured on the admin backend. Set it in the server environment.",
        });
      }

      let response: Response;
      try {
        response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
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
            stream: false,
          }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : "unknown";
        const msg =
          name === "TimeoutError" || name === "AbortError"
            ? "OpenRouter request timed out after 30s"
            : err instanceof Error
              ? err.message
              : "OpenRouter request failed";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `OpenRouter call failed: ${msg}`,
        });
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "<empty>");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `OpenRouter returned ${response.status}: ${errorText.slice(0, 500)}`,
        });
      }

      let parsed: OpenRouterChatResponse;
      try {
        parsed = (await response.json()) as OpenRouterChatResponse;
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "OpenRouter returned a non-JSON response body",
        });
      }

      if (parsed.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `OpenRouter error: ${parsed.error.message ?? "unknown"}`,
        });
      }

      const content = parsed.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "OpenRouter returned an empty assistant message",
        });
      }

      return {
        content,
        model: OPENROUTER_MODEL,
        finishReason: parsed.choices?.[0]?.finish_reason ?? null,
      };
    }),
});
