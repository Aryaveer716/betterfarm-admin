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

describe("admin reports access control", () => {
  it("rejects anonymous on listContentReports", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.admin.listContentReports({})).rejects.toThrow();
  });

  it("rejects non-admin on listContentReports", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.listContentReports({})).rejects.toThrow();
  });

  it("rejects non-admin on listMessageReports", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.listMessageReports({})).rejects.toThrow();
  });

  it("rejects non-admin on updateContentReportStatus/updateMessageReportStatus", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.updateContentReportStatus({ id: 1, status: "reviewed" }),
    ).rejects.toThrow();
    await expect(
      caller.admin.updateMessageReportStatus({ id: 1, status: "reviewed" }),
    ).rejects.toThrow();
  });
});

describe("admin reports input validation", () => {
  it("updateContentReportStatus rejects invalid status", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.updateContentReportStatus({ id: 1, status: "not_a_status" as never }),
    ).rejects.toThrow();
  });

  it("updateMessageReportStatus rejects invalid status", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.updateMessageReportStatus({ id: 1, status: "garbage" as never }),
    ).rejects.toThrow();
  });

  it("listContentReports rejects limit > 100", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(caller.admin.listContentReports({ limit: 500 })).rejects.toThrow();
  });
});
