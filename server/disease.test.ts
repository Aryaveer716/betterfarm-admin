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

describe("admin disease-detection access control", () => {
  it("rejects anonymous on listDiseaseDetections", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.admin.listDiseaseDetections({})).rejects.toThrow();
  });

  it("rejects non-admin on listDiseaseDetections", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.listDiseaseDetections({})).rejects.toThrow();
  });

  it("rejects non-admin on getDiseaseDetection", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.getDiseaseDetection({ id: 1 })).rejects.toThrow();
  });

  it("rejects non-admin on updateDiseaseDetectionStatus", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.updateDiseaseDetectionStatus({ id: 1, status: "resolved" }),
    ).rejects.toThrow();
  });
});

describe("admin disease-detection input validation", () => {
  it("updateDiseaseDetectionStatus rejects invalid status", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.updateDiseaseDetectionStatus({ id: 1, status: "not_a_status" as never }),
    ).rejects.toThrow();
  });

  it("listDiseaseDetections rejects limit > 100", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.listDiseaseDetections({ limit: 500 }),
    ).rejects.toThrow();
  });
});
