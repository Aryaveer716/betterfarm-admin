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

describe("admin ai-oversight access control", () => {
  it("rejects anonymous on listAiAdviceHistory", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.admin.listAiAdviceHistory({})).rejects.toThrow();
  });

  it("rejects non-admin on listAiAdviceHistory", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.listAiAdviceHistory({})).rejects.toThrow();
  });

  it("rejects non-admin on listCopilotConversations", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.listCopilotConversations({})).rejects.toThrow();
  });

  it("rejects non-admin on listAiFeedback", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.listAiFeedback({})).rejects.toThrow();
  });
});

describe("admin ai-oversight input validation", () => {
  it("listAiFeedback rejects invalid feedback filter", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.listAiFeedback({ feedback: "neutral" as never }),
    ).rejects.toThrow();
  });

  it("listAiAdviceHistory rejects limit > 100", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(caller.admin.listAiAdviceHistory({ limit: 500 })).rejects.toThrow();
  });
});
