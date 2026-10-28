import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./routers";
import { assertNotSelfApproval, assertRecordScope, hasPermission, permissionsFor } from "./authorization";
import type { User } from "./types";

const baseUser = (role: User["role"], overrides: Partial<User> = {}): User => ({
  id: "507f1f77bcf86cd799439011",
  openId: "auth-user",
  name: "Test User",
  email: "test@example.com",
  loginMethod: "oauth",
  role,
  consultantId: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  lastSignedIn: new Date("2026-01-01"),
  ...overrides,
});

function caller(user: User | null) {
  return appRouter.createCaller({ req: {} as never, res: {} as never, user });
}

async function expectForbidden(action: Promise<unknown>) {
  await expect(action).rejects.toMatchObject({ code: "FORBIDDEN" });
}

describe("authorization policy", () => {
  it("keeps unassigned users without business permissions", () => {
    expect(permissionsFor("user")).toEqual([]);
    expect(hasPermission("user", "time.read")).toBe(false);
    expect(hasPermission("admin", "users.manage")).toBe(true);
    expect(hasPermission("manager", "metrics.financial")).toBe(false);
    expect(hasPermission("finance", "time.approve")).toBe(false);
  });

  it("rejects unauthenticated and unassigned business procedure calls", async () => {
    await expect(caller(null).consultants.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expectForbidden(caller(baseUser("user")).consultants.list());
    await expectForbidden(caller(baseUser("user")).clients.list());
    await expectForbidden(caller(baseUser("user")).projects.list());
    await expectForbidden(caller(baseUser("user")).timeEntries.list({ page: 1, pageSize: 50 }));
    await expectForbidden(caller(baseUser("user")).timeEntries.metrics({}));
  });

  it("restricts finance from consultant mutations and approvals", async () => {
    const finance = caller(baseUser("finance"));
    await expectForbidden(finance.consultants.create({ employeeCode: "F-1", firstName: "Finance", lastName: "User", email: "finance@example.com", role: "Analyst", department: "Finance", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 100, currency: "USD", startDate: "2026-01-01" }));
    await expectForbidden(finance.timeEntries.approve({ id: "507f1f77bcf86cd799439012" }));
    await expectForbidden(finance.timeEntries.reject({ id: "507f1f77bcf86cd799439012", reason: "Not permitted" }));
  });

  it("does not allow managers or consultants to manage user roles", async () => {
    await expectForbidden(caller(baseUser("manager")).users.setRole({ userId: "507f1f77bcf86cd799439012", role: "finance" }));
    await expectForbidden(caller(baseUser("consultant", { consultantId: "507f1f77bcf86cd799439013" })).users.setRole({ userId: "507f1f77bcf86cd799439012", role: "finance" }));
  });

  it("prevents an administrator from changing their own role", async () => {
    await expect(caller(baseUser("admin")).users.setRole({ userId: "507f1f77bcf86cd799439011", role: "user" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires consultant scope and prevents self approval", () => {
    const consultant = baseUser("consultant", { consultantId: "507f1f77bcf86cd799439013" });
    expect(() => assertRecordScope(consultant, "507f1f77bcf86cd799439014")).toThrow(TRPCError);
    expect(() => assertRecordScope(consultant, consultant.consultantId ?? undefined)).not.toThrow();
    expect(() => assertNotSelfApproval(consultant, consultant.id)).toThrow(TRPCError);
    expect(() => assertNotSelfApproval(consultant, "507f1f77bcf86cd799439014")).not.toThrow();
  });
});
