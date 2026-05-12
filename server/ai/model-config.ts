/**
 * OpenRouter config for the admin AI assistant panel.
 *
 * The model slug is a single hardcoded value — no fallback chain. If
 * inclusionai/ring-2.6-1t:free goes down, we want the admin chat to
 * hard-fail visibly rather than silently switch to a paid model and run up
 * a bill. Swap this constant to change models.
 *
 * Verified against OpenRouter's /api/v1/models endpoint on 2026-05-12.
 */
export const OPENROUTER_MODEL = "inclusionai/ring-2.6-1t:free" as const;

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Headers OpenRouter uses for attribution + discovery. Hardcoded to the
 * BetterFarm Admin Portal. These don't gate access; they're metadata.
 */
export const OPENROUTER_HTTP_REFERER = "https://betterfarm.in/admin";
export const OPENROUTER_X_TITLE = "BetterFarm Admin";
