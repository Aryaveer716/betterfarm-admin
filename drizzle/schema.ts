// Admin-private schema. Phase 0 of admin-wiring removed the `users` table
// in favor of importing it from @betterfarm/db. The remaining 9 tables are
// admin-only and will be progressively migrated to @betterfarm/db in Phases 1-4.
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, float, json } from "drizzle-orm/mysql-core";
import { users } from "@betterfarm/db";

export { users };

export const farmerProfiles = mysqlTable("farmer_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  farmName: varchar("farmName", { length: 255 }),
  location: varchar("location", { length: 255 }),
  farmSizeHectares: float("farmSizeHectares"),
  primaryCrop: varchar("primaryCrop", { length: 100 }),
  isVerified: boolean("isVerified").default(false).notNull(),
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "approved", "rejected"]).default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const forumPosts = mysqlTable("forum_posts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 500 }),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }),
  isRemoved: boolean("isRemoved").default(false).notNull(),
  removedReason: text("removedReason"),
  removedBy: int("removedBy"),
  likeCount: int("likeCount").default(0),
  commentCount: int("commentCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const marketplaceListings = mysqlTable("marketplace_listings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  price: float("price"),
  unit: varchar("unit", { length: 50 }),
  category: varchar("category", { length: 100 }),
  status: mysqlEnum("status", ["active", "sold", "removed", "pending"]).default("active"),
  isRemoved: boolean("isRemoved").default(false).notNull(),
  removedReason: text("removedReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const userReports = mysqlTable("user_reports", {
  id: int("id").autoincrement().primaryKey(),
  reporterId: int("reporterId").notNull(),
  targetUserId: int("targetUserId"),
  targetPostId: int("targetPostId"),
  targetListingId: int("targetListingId"),
  reason: varchar("reason", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["pending", "resolved", "dismissed"]).default("pending").notNull(),
  resolvedBy: int("resolvedBy"),
  resolvedAt: timestamp("resolvedAt"),
  resolution: text("resolution"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const supportTickets = mysqlTable("support_tickets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 100 }),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  assignedTo: int("assignedTo"),
  resolvedAt: timestamp("resolvedAt"),
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const diseaseDetections = mysqlTable("disease_detections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  cropType: varchar("cropType", { length: 100 }),
  diseaseName: varchar("diseaseName", { length: 255 }),
  confidence: float("confidence"),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]),
  imageUrl: text("imageUrl"),
  aiResponse: text("aiResponse"),
  status: mysqlEnum("status", ["pending", "reviewed", "resolved"]).default("pending").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewNotes: text("reviewNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aiInteractions = mysqlTable("ai_interactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  sessionId: varchar("sessionId", { length: 100 }),
  inputText: text("inputText"),
  outputText: text("outputText"),
  model: varchar("model", { length: 100 }),
  tokensUsed: int("tokensUsed"),
  latencyMs: int("latencyMs"),
  wasSuccessful: boolean("wasSuccessful").default(true).notNull(),
  errorMessage: text("errorMessage"),
  category: varchar("category", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const activityLogs = mysqlTable("activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("adminId").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  targetType: varchar("targetType", { length: 100 }),
  targetId: int("targetId"),
  details: json("details"),
  ipAddress: varchar("ipAddress", { length: 45 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const featureFlags = mysqlTable("feature_flags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isEnabled: boolean("isEnabled").default(false).notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FarmerProfile = typeof farmerProfiles.$inferSelect;
export type ForumPost = typeof forumPosts.$inferSelect;
export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type UserReport = typeof userReports.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type DiseaseDetection = typeof diseaseDetections.$inferSelect;
export type AiInteraction = typeof aiInteractions.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type FeatureFlag = typeof featureFlags.$inferSelect;
