import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { hashPassword, verifyPassword, normalizeEmail } from "./password";
import { checkRateLimit, clearRateLimit, recordFailedAttempt, resetAllRateLimits } from "./rateLimiter";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import type { Request, Response } from "express";
import type { User } from "./types";

function createMockReqRes(cookies: Record<string, string> = {}) {
  const setCookies: Record<string, { value: string; options: any }> = {};
  const clearedCookies: Record<string, any> = {};

  const req = {
    headers: {
      cookie: Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as Request;

  const res = {
    cookie: (name: string, value: string, options: any) => {
      setCookies[name] = { value, options };
    },
    clearCookie: (name: string, options: any) => {
      clearedCookies[name] = options;
    },
  } as unknown as Response;

  return { req, res, setCookies, clearedCookies };
}

describe("Standalone Password & Rate Limiter Security", () => {
  beforeEach(() => {
    resetAllRateLimits();
  });

  it("hashes passwords with random salt and verifies correctly", () => {
    const raw = "SuperSecret123!";
    const { hash, salt } = hashPassword(raw);

    expect(hash).toBeDefined();
    expect(salt).toBeDefined();
    expect(hash.length).toBe(128); // 64 bytes hex
    expect(salt.length).toBe(32); // 16 bytes hex

    expect(verifyPassword(raw, hash, salt)).toBe(true);
    expect(verifyPassword("WrongPassword!", hash, salt)).toBe(false);
    expect(verifyPassword("", hash, salt)).toBe(false);
  });

  it("enforces password length constraints", () => {
    expect(() => hashPassword("short")).toThrow("Password must be at least 8 characters long.");
    expect(() => hashPassword("a".repeat(129))).toThrow("Password must not exceed 128 characters.");
  });

  it("normalizes emails consistently", () => {
    expect(normalizeEmail("  Admin@Nexor.IO  ")).toBe("admin@nexor.io");
    expect(normalizeEmail("User.Name+Tag@Domain.COM")).toBe("user.name+tag@domain.com");
  });

  it("rate limits consecutive failed login attempts", () => {
    const key = "127.0.0.1:test@example.com";
    for (let i = 0; i < 5; i++) {
      expect(() => checkRateLimit(key)).not.toThrow();
      recordFailedAttempt(key);
    }
    // 6th attempt should be blocked
    expect(() => checkRateLimit(key)).toThrow("Too many login attempts");

    // Clearing rate limit allows retry
    clearRateLimit(key);
    expect(() => checkRateLimit(key)).not.toThrow();
  });
});

describe("Authentication & Session Security Router", () => {
  it("never returns password hashes or salts in auth.me or auth responses", async () => {
    const mockUser: User = {
      id: "user-123",
      openId: "local_user123",
      name: "Test Consultant",
      email: "consultant@nexor.io",
      loginMethod: "password",
      role: "consultant",
      status: "active",
      consultantId: "650000000000000000000001",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const { req, res } = createMockReqRes();
    const caller = appRouter.createCaller({ req, res, user: mockUser });

    const me = await caller.auth.me();
    expect(me).toBeDefined();
    expect(me).not.toHaveProperty("passwordHash");
    expect(me).not.toHaveProperty("passwordSalt");
    expect(me?.email).toBe("consultant@nexor.io");
    expect(me?.role).toBe("consultant");
  });

  it("invalidates session cookie on logout", async () => {
    const mockUser: User = {
      id: "admin-1",
      openId: "local_admin1",
      name: "Admin User",
      email: "admin@nexor.io",
      loginMethod: "password",
      role: "admin",
      status: "active",
      consultantId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const { req, res, clearedCookies } = createMockReqRes();
    const caller = appRouter.createCaller({ req, res, user: mockUser });

    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies).toHaveProperty(COOKIE_NAME);
    expect(clearedCookies[COOKIE_NAME].httpOnly).toBe(true);
  });

  it("rejects unauthenticated requests on protected procedures", async () => {
    const { req, res } = createMockReqRes();
    const caller = appRouter.createCaller({ req, res, user: null });

    await expect(caller.users.list()).rejects.toThrow();
    await expect(caller.consultants.list()).rejects.toThrow();
    await expect(caller.timeEntries.list()).rejects.toThrow();
  });

  it("prevents non-admins from managing users or escalating roles", async () => {
    const consultantUser: User = {
      id: "c-1",
      openId: "local_c1",
      name: "Consultant User",
      email: "consultant@nexor.io",
      loginMethod: "password",
      role: "consultant",
      status: "active",
      consultantId: "650000000000000000000001",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const { req, res } = createMockReqRes();
    const caller = appRouter.createCaller({ req, res, user: consultantUser });

    // Consultant cannot list users
    await expect(caller.users.list()).rejects.toThrow("You do not have required permission");

    // Consultant cannot escalate roles
    await expect(
      caller.users.setRole({
        userId: "target-user",
        role: "admin",
      }),
    ).rejects.toThrow("You do not have required permission");

    // Consultant cannot access financial metrics
    await expect(caller.timeEntries.metrics()).rejects.toThrow();
  });

  it("prevents self-role changes by administrator", async () => {
    const adminUser: User = {
      id: "admin-id-1",
      openId: "local_admin1",
      name: "Admin",
      email: "admin@nexor.io",
      loginMethod: "password",
      role: "admin",
      status: "active",
      consultantId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const { req, res } = createMockReqRes();
    const caller = appRouter.createCaller({ req, res, user: adminUser });

    await expect(
      caller.users.setRole({
        userId: "admin-id-1",
        role: "user",
      }),
    ).rejects.toThrow("You cannot change your own role.");

    await expect(
      caller.users.setStatus({
        userId: "admin-id-1",
        status: "disabled",
      }),
    ).rejects.toThrow("You cannot disable your own account.");
  });
});
