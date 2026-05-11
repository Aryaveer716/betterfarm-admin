import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(role: "user" | "admin" | "moderator"): TrpcContext {
  const user = {
    id: 1,
    openId: "test-user",
    email: role === "admin" ? "admin@betterfarm.app" : "test@betterfarm.app",
    name: role === "admin" ? "Admin User" : "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as unknown as AuthenticatedUser;
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("admin user-moderation access control", () => {
  it("rejects anonymous callers on suspendUser", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(
      caller.admin.suspendUser({ userId: 42, reason: "spam", durationDays: 7 }),
    ).rejects.toThrow();
  });

  it("rejects non-admin callers on suspendUser", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.suspendUser({ userId: 42, reason: "spam", durationDays: 7 }),
    ).rejects.toThrow();
  });

  it("rejects non-admin on banUser", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.banUser({ userId: 42, reason: "abuse" }),
    ).rejects.toThrow();
  });

  it("rejects non-admin on shadowBanUser", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.shadowBanUser({ userId: 42, reason: "low quality" }),
    ).rejects.toThrow();
  });

  it("rejects non-admin on issueStrike", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.issueStrike({ userId: 42, reason: "spam" }),
    ).rejects.toThrow();
  });

  it("rejects non-admin on clearStrikes", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.clearStrikes({ userId: 42 }),
    ).rejects.toThrow();
  });

  it("rejects non-admin on unsuspendUser/unbanUser/removeShadowBan", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.unsuspendUser({ userId: 42 })).rejects.toThrow();
    await expect(caller.admin.unbanUser({ userId: 42 })).rejects.toThrow();
    await expect(caller.admin.removeShadowBan({ userId: 42 })).rejects.toThrow();
  });
});

describe("admin user-moderation input validation (admin caller)", () => {
  it("suspendUser rejects empty reason", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.suspendUser({ userId: 42, reason: "", durationDays: 7 }),
    ).rejects.toThrow();
  });

  it("suspendUser rejects durationDays = 0", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.suspendUser({ userId: 42, reason: "spam", durationDays: 0 }),
    ).rejects.toThrow();
  });

  it("suspendUser rejects durationDays > 365", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.suspendUser({ userId: 42, reason: "spam", durationDays: 400 }),
    ).rejects.toThrow();
  });

  it("suspendUser rejects non-integer durationDays", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.suspendUser({ userId: 42, reason: "spam", durationDays: 7.5 }),
    ).rejects.toThrow();
  });

  it("banUser rejects empty reason", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.banUser({ userId: 42, reason: "" }),
    ).rejects.toThrow();
  });

  it("shadowBanUser rejects empty reason", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.shadowBanUser({ userId: 42, reason: "" }),
    ).rejects.toThrow();
  });

  it("issueStrike rejects empty reason", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.issueStrike({ userId: 42, reason: "" }),
    ).rejects.toThrow();
  });
});
