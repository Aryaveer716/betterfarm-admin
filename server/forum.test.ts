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

describe("admin forum-posts access control", () => {
  it("rejects anonymous on getPosts", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.admin.getPosts({})).rejects.toThrow();
  });

  it("rejects non-admin on getPosts", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.getPosts({})).rejects.toThrow();
  });

  it("rejects non-admin on getFlaggedPosts", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.getFlaggedPosts({})).rejects.toThrow();
  });

  it("rejects non-admin on removePost/restorePost/flagPost/unflagPost", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.removePost({ postId: 1, reason: "spam" })).rejects.toThrow();
    await expect(caller.admin.restorePost({ postId: 1 })).rejects.toThrow();
    await expect(caller.admin.flagPost({ postId: 1, reason: "review" })).rejects.toThrow();
    await expect(caller.admin.unflagPost({ postId: 1 })).rejects.toThrow();
  });
});

describe("admin forum-posts input validation", () => {
  it("removePost rejects empty reason", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.removePost({ postId: 1, reason: "" }),
    ).rejects.toThrow();
  });

  it("flagPost rejects empty reason", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.flagPost({ postId: 1, reason: "" }),
    ).rejects.toThrow();
  });

  it("removePost rejects reason > 500 chars", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.removePost({ postId: 1, reason: "x".repeat(501) }),
    ).rejects.toThrow();
  });
});
