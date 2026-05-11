import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(role: "user" | "admin"): TrpcContext {
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

describe("admin verifications access control", () => {
  it("rejects anonymous on listVerificationRequests", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.admin.listVerificationRequests({})).rejects.toThrow();
  });

  it("rejects non-admin on listVerificationRequests", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.listVerificationRequests({})).rejects.toThrow();
  });

  it("rejects non-admin on getVerificationRequest", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.getVerificationRequest({ id: 1 })).rejects.toThrow();
  });

  it("rejects non-admin on approve/reject/requestMoreInfo", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.approveVerificationRequest({ id: 1 }),
    ).rejects.toThrow();
    await expect(
      caller.admin.rejectVerificationRequest({ id: 1, reason: "missing docs" }),
    ).rejects.toThrow();
    await expect(
      caller.admin.requestMoreInfoOnVerification({ id: 1, moreInfoRequested: "send FSSAI" }),
    ).rejects.toThrow();
  });
});

describe("admin verifications input validation", () => {
  it("rejectVerificationRequest rejects empty reason", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.rejectVerificationRequest({ id: 1, reason: "" }),
    ).rejects.toThrow();
  });

  it("requestMoreInfoOnVerification rejects empty moreInfoRequested", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.requestMoreInfoOnVerification({ id: 1, moreInfoRequested: "" }),
    ).rejects.toThrow();
  });

  it("listVerificationRequests rejects invalid status", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.listVerificationRequests({ status: "not_a_status" as never }),
    ).rejects.toThrow();
  });

  it("listVerificationRequests rejects limit > 100", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.listVerificationRequests({ limit: 500 }),
    ).rejects.toThrow();
  });
});
