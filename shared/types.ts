/**
 * Unified type exports
 * Import shared types from this single entry point.
 *
 * Phase 0 admin-wiring: re-exports types from @betterfarm/db (canonical only).
 * Admin-only types (FarmerProfile, MarketplaceListing, UserReport, SupportTicket,
 * AiInteraction, ActivityLog) are imported directly from "../drizzle/schema" by
 * the (currently zero) consumers that need them. The local drizzle/schema.ts
 * also re-exports `users` from @betterfarm/db so admin code can keep importing
 * from "../drizzle/schema".
 *
 * Three table names (forumPosts, diseaseDetections, featureFlags) overlap
 * conceptually between admin and main; this file only forwards the @betterfarm/db
 * versions to avoid TypeScript re-export ambiguity. Phases 2-4 will reconcile
 * those tables fully.
 */

export type * from "@betterfarm/db";
export * from "./_core/errors";
