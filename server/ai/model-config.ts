/**
 * Provider config for the admin AI assistant panel.
 *
 * Primary: OpenRouter, free `:free` slug. Fallback: Google AI Studio
 * (Gemini), which exposes an OpenAI-compatible chat-completions endpoint
 * so the same streaming + tool-call parser works for both.
 *
 * The fallback engages only when the primary fails BEFORE emitting any
 * tokens (in-stream error, HTTP non-2xx, empty completion on iteration 0).
 * Once the primary has streamed real content to the client, a mid-stream
 * failure is surfaced as an error event instead of silently switching
 * providers — switching mid-conversation would leak partial state.
 *
 * Both `OPENROUTER_MODEL` and `GEMINI_FALLBACK_MODEL` are `:free` / free-tier
 * slugs — swap with care if you ever introduce a paid model, since the
 * fallback can be hit unexpectedly under rate-limit conditions.
 */
export const OPENROUTER_MODEL = "inclusionai/ring-2.6-1t:free" as const;
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Headers OpenRouter uses for attribution + discovery. Hardcoded to the
 * BetterFarm Admin Portal. These don't gate access; they're metadata.
 */
export const OPENROUTER_HTTP_REFERER = "https://betterfarm.in/admin";
export const OPENROUTER_X_TITLE = "BetterFarm Admin";

/**
 * Google AI Studio OpenAI-compatible endpoint. Same /chat/completions
 * surface as OpenAI/OpenRouter, including streaming and OpenAI-format
 * tool calls — so the same pass function works for both providers.
 * Auth is `Authorization: Bearer ${GEMINI_API_KEY}`.
 *
 * Free tier on `gemini-2.0-flash` is ~15 RPM / ~1500 req/day per key
 * (verify against current quotas at https://ai.google.dev/pricing).
 */
export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
export const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash" as const;
