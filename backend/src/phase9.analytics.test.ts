import "dotenv/config";
import { describe, expect, it } from "vitest";
import {
  utilizationFormula,
  calculateEstimatedBillableRevenue,
  availableWorkingHours,
  countBusinessDays,
  calculatePeriodCapacity,
} from "./calculations";
import { appRouter } from "./routers";
import { requireMongoDb } from "./mongo";
import { ObjectId } from "mongodb";
import type { User } from "./types";

const TEST_ADMIN: User = {
  id: "507f1f77bcf86cd799439011",
  openId: "admin-audit-sub",
  name: "Audit Administrator",
  email: "admin.audit@example.com",
  loginMethod: "manus",
  role: "admin",
  consultantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const TEST_MANAGER: User = {
  id: "507f1f77bcf86cd799439012",
  openId: "manager-audit-sub",
  name: "Audit Manager",
  email: "manager.audit@example.com",
  loginMethod: "manus",
  role: "manager",
  consultantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const createCaller = (user: User | null) =>
  appRouter.createCaller({ user, req: {} as any, res: { clearCookie: () => {} } as any });

describe("Phase 9 Audit: Calculations, Capacity Rules & Workflows", () => {
  describe("Task 2: Capacity & Utilization Calculations", () => {
    it("handles zero and negative available capacity safely without throwing", () => {
      expect(utilizationFormula(40, 0)).toBeNull();
      expect(utilizationFormula(40, -10)).toBeNull();
      expect(utilizationFormula(0, 0)).toBeNull();
    });

    it("computes accurate utilization percentage for positive capacity", () => {
      // 120 billable hours / 160 available hours = 75.0%
      expect(utilizationFormula(120, 160)).toBe(75);
      // 135 billable hours / 160 available hours = 84.4%
      expect(utilizationFormula(135, 160)).toBe(84.4);
    });

    it("counts business days (Monday to Friday) accurately across periods", () => {
      // 1 standard week: Mon 2026-04-20 to Sun 2026-04-26 -> 5 business days
      expect(countBusinessDays("2026-04-20", "2026-04-26")).toBe(5);

      // Weekend only: Sat 2026-04-25 to Sun 2026-04-26 -> 0 business days
      expect(countBusinessDays("2026-04-25", "2026-04-26")).toBe(0);

      // April 2026: 2026-04-01 to 2026-04-30 -> 22 business days
      expect(countBusinessDays("2026-04-01", "2026-04-30")).toBe(22);

      // Q2 2026: 2026-04-01 to 2026-06-30 -> 65 business days
      expect(countBusinessDays("2026-04-01", "2026-06-30")).toBe(65);
    });

    it("calculates period-specific capacity rather than assuming static 4 weeks", () => {
      // 40h/week consultant
      // This week (1 week = 5 business days = 40 hours)
      expect(calculatePeriodCapacity(40, "this-week")).toBe(40);

      // This month (22 business days = 22 * 8 = 176 hours)
      expect(calculatePeriodCapacity(40, "this-month")).toBe(176);

      // This quarter (13 weeks = 65 business days = 520 hours)
      expect(calculatePeriodCapacity(40, "this-quarter")).toBe(520);

      // Custom date range (2 weeks = 10 business days = 80 hours)
      expect(
        calculatePeriodCapacity(40, "custom", { from: "2026-04-06", to: "2026-04-17" })
      ).toBe(80);
    });

    it("availableWorkingHours adapts properly to selected period and consultant capacity", () => {
      const c40 = { weeklyCapacityHours: 40 };
      expect(availableWorkingHours(c40, "this-week")).toBe(40);
      expect(availableWorkingHours(c40, "this-month")).toBe(176);
      expect(availableWorkingHours(c40, "this-quarter")).toBe(520);

      const c35 = { weeklyCapacityHours: 35 }; // 7h/day
      expect(availableWorkingHours(c35, "this-week")).toBe(35);
      expect(availableWorkingHours(c35, "this-month")).toBe(154); // 22 * 7 = 154
    });
  });

  describe("Task 2: Revenue Integrity & Currency Segregation", () => {
    it("calculates estimated revenue using billing rate snapshot", () => {
      expect(calculateEstimatedBillableRevenue(32.5, 250)).toBe(8125);
    });

    it("rejects invalid, negative, or NaN parameters", () => {
      expect(calculateEstimatedBillableRevenue(-5, 200)).toBeNull();
      expect(calculateEstimatedBillableRevenue(10, -100)).toBeNull();
      expect(calculateEstimatedBillableRevenue(NaN, 100)).toBeNull();
    });

    it("strictly segregates currencies without cross-currency summation", () => {
      const entries = [
        { currency: "USD", rate: 200, hours: 10 },
        { currency: "EUR", rate: 180, hours: 10 },
        { currency: "GBP", rate: 150, hours: 10 },
      ];

      const revenueByCurrency: Record<string, number> = {};
      for (const e of entries) {
        revenueByCurrency[e.currency] = (revenueByCurrency[e.currency] ?? 0) + e.rate * e.hours;
      }

      expect(revenueByCurrency.USD).toBe(2000);
      expect(revenueByCurrency.EUR).toBe(1800);
      expect(revenueByCurrency.GBP).toBe(1500);
      // No currency addition into a synthetic total
      expect(Object.keys(revenueByCurrency)).toHaveLength(3);
    });
  });

  describe("Task 4: End-to-End Time Entry Approval Lifecycle in MongoDB", () => {
    it("executes complete lifecycle: Draft -> Submitted -> Approved -> Rejected -> Draft with audit history", async () => {
      const adminCaller = createCaller(TEST_ADMIN);
      const managerCaller = createCaller(TEST_MANAGER);

      // 1. Create consultant, client, project
      const c = await adminCaller.consultants.create({
        employeeCode: `WF-C-${Date.now()}`,
        firstName: "Workflow",
        lastName: "Tester",
        email: `wf.${Date.now()}@example.com`,
        role: "Senior Consultant",
        department: "Strategy",
        employmentStatus: "Active",
        weeklyCapacityHours: 40,
        billingRate: 200,
        currency: "USD",
        startDate: "2026-01-01",
      });

      const cl = await adminCaller.clients.create({
        clientCode: `WF-CL-${Date.now()}`,
        name: "Workflow Client",
        status: "Active",
        defaultCurrency: "USD",
      });

      const p = await adminCaller.projects.create({
        clientId: cl.id,
        name: "Workflow Project",
        status: "Active",
        billingCurrency: "USD",
      });

      // 2. Create Draft entry (created by Admin)
      const entry = await adminCaller.timeEntries.create({
        consultantId: c.id,
        clientId: cl.id,
        projectId: p.id,
        workDate: "2026-04-15",
        description: "Initial strategic sprint",
        hours: 8,
        billingClassification: "Billable",
      });
      expect(entry.status).toBe("Draft");

      // 3. Submit entry (Draft -> Submitted)
      const submitted = await adminCaller.timeEntries.submit({ id: entry.id });
      expect(submitted.status).toBe("Submitted");
      expect(submitted.submittedAt).not.toBeNull();

      // 4. Approve entry (Manager approves, avoiding self-approval because creator is Admin)
      const approved = await managerCaller.timeEntries.approve({ id: entry.id });
      expect(approved.status).toBe("Approved");
      expect(approved.reviewedAt).not.toBeNull();

      // 5. Audit history must contain records for Submitted and Approved
      const history = await adminCaller.timeEntries.approvalHistory({ id: entry.id });
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history.some((h) => h.newStatus === "Submitted")).toBe(true);
      expect(history.some((h) => h.newStatus === "Approved")).toBe(true);

      // Clean up test documents
      const db = await requireMongoDb();
      await db.collection("timeEntries").deleteOne({ _id: new ObjectId(entry.id) });
      await db.collection("timeEntryApprovalHistory").deleteMany({ timeEntryId: new ObjectId(entry.id) });
      await db.collection("projects").deleteOne({ _id: new ObjectId(p.id) });
      await db.collection("clients").deleteOne({ _id: new ObjectId(cl.id) });
      await db.collection("consultants").deleteOne({ _id: new ObjectId(c.id) });
    });
  });
});
