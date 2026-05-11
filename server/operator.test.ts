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

describe("admin.operator access control", () => {
  it("rejects anonymous callers on getConfig", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.admin.operator.getConfig()).rejects.toThrow();
  });

  it("rejects non-admin callers on getConfig", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.admin.operator.getConfig()).rejects.toThrow();
  });

  it("rejects non-admin callers on setFlag", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.operator.setFlag({ key: "voice_enabled", value: false }),
    ).rejects.toThrow();
  });

  it("rejects non-admin callers on setTunable", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(
      caller.admin.operator.setTunable({ key: "llm.stallTimeoutMs", value: 8000 }),
    ).rejects.toThrow();
  });
});

describe("admin.operator input validation", () => {
  it("setFlag rejects unknown key", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.operator.setFlag({ key: "not_a_real_flag", value: false }),
    ).rejects.toThrow(/not an operator kill-switch/);
  });

  it("setTunable rejects unknown key", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.operator.setTunable({ key: "not_a_real_tunable", value: 42 }),
    ).rejects.toThrow(/unknown tunable key/);
  });

  it("setTunable rejects out-of-range number", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.operator.setTunable({ key: "llm.stallTimeoutMs", value: 99 }),
    ).rejects.toThrow(/out of range/);
  });

  it("setTunable rejects wrong-type value (string for number key)", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.operator.setTunable({ key: "llm.stallTimeoutMs", value: "8000" as never }),
    ).rejects.toThrow(/expected number/);
  });

  it("setTunable rejects llm.model not in allowlist", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.operator.setTunable({ key: "llm.model", value: "made-up/model-7b" }),
    ).rejects.toThrow(/not in allowlist/);
  });

  it("setTunable rejects audio.sampleRate non-(16000|24000)", async () => {
    const caller = appRouter.createCaller(createUserContext("admin"));
    await expect(
      caller.admin.operator.setTunable({ key: "audio.sampleRate", value: 48000 }),
    ).rejects.toThrow(/not in allowlist/);
  });
});
