import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserContext(role: "user" | "admin", userId = 1): TrpcContext {
  const user = {
    id: userId,
    openId: `test-${userId}`,
    email: role === "admin" ? `admin-${userId}@betterfarm.app` : `user-${userId}@betterfarm.app`,
    name: role === "admin" ? `Admin ${userId}` : `User ${userId}`,
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

describe("Phase 5: self-promotion guard", () => {
  it("updateUserRole rejects self-role-change", async () => {
    const caller = appRouter.createCaller(createUserContext("admin", 42));
    await expect(
      caller.admin.updateUserRole({ userId: 42, role: "user" }),
    ).rejects.toThrow(/cannot change your own role/);
  });

  it("deleteUser rejects self-delete", async () => {
    const caller = appRouter.createCaller(createUserContext("admin", 99));
    await expect(
      caller.admin.deleteUser({ userId: 99 }),
    ).rejects.toThrow(/cannot delete your own account/);
  });
});
