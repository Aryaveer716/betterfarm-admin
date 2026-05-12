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

describe("admin audit-logs access control", () => {
  it("rejects anonymous on listAdminAuditLogs", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.admin.listAdminAuditLogs({})).rejects.toThrow();
  });

  it("rejects non-admin on listAdminAuditLogs", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.listAdminAuditLogs({})).rejects.toThrow();
  });
});

describe("admin audit-logs input validation", () => {
  it("listAdminAuditLogs rejects limit > 100", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(caller.admin.listAdminAuditLogs({ limit: 500 })).rejects.toThrow();
  });

  it("updateUserRole rejects invalid role", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.updateUserRole({ userId: 1, role: "superuser" as never }),
    ).rejects.toThrow();
  });
});
