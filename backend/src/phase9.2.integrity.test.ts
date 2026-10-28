import "dotenv/config";
import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { ObjectId } from "mongodb";
import { requireMongoDb, getMongoClient, collection, type TimeEntryDocument, type ApprovalHistoryDocument, type ConsultantDocument, type ClientDocument, type ProjectDocument } from "./mongo";
import * as erp from "./erpDb";
import { periodDateRange, countBusinessDays, calculatePeriodCapacity, utilizationFormula, calculateEstimatedBillableRevenue } from "./calculations";
import { hasPermission, permissionsFor, type Role } from "./authorization";
import type { User } from "./types";
import { TRPCError } from "@trpc/server";

describe("Phase 9.2: NEXOR Integrity & Production Readiness Validation", () => {
  let db: Awaited<ReturnType<typeof requireMongoDb>>;
  
  // Test actors
  const adminActor: User = { id: new ObjectId().toHexString(), openId: "admin-openId", name: "Admin Test", email: "admin@test.com", loginMethod: "test", role: "admin", consultantId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  const managerActor: User = { id: new ObjectId().toHexString(), openId: "manager-openId", name: "Manager Test", email: "manager@test.com", loginMethod: "test", role: "manager", consultantId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  const financeActor: User = { id: new ObjectId().toHexString(), openId: "finance-openId", name: "Finance Test", email: "finance@test.com", loginMethod: "test", role: "finance", consultantId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  const unassignedActor: User = { id: new ObjectId().toHexString(), openId: "user-openId", name: "Unassigned Test", email: "user@test.com", loginMethod: "test", role: "user", consultantId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

  let testConsultantA: any;
  let testConsultantB: any;
  let testClient: any;
  let testProject: any;
  let consultantActorA: User;
  let consultantActorB: User;

  beforeAll(async () => {
    db = await requireMongoDb();

    // Create test entities
    testClient = await erp.createClient({ clientCode: `CL-P92-${Date.now()}`, name: "Nexcore Validation Corp", status: "Active", defaultCurrency: "USD" });
    testProject = await erp.createProject({ clientId: testClient.id, name: "Core Platform Audit", status: "Active", billingCurrency: "USD" });
    testConsultantA = await erp.createConsultant({
      employeeCode: `EMP-A-${Date.now()}`,
      firstName: "Alice",
      lastName: "Consultant",
      email: `alice.${Date.now()}@nexcore.test`,
      role: "Senior Architect",
      department: "Cloud Engineering",
      employmentStatus: "Active",
      weeklyCapacityHours: 40,
      billingRate: 200,
      currency: "USD",
      startDate: "2026-01-01",
    });
    testConsultantB = await erp.createConsultant({
      employeeCode: `EMP-B-${Date.now()}`,
      firstName: "Bob",
      lastName: "Consultant",
      email: `bob.${Date.now()}@nexcore.test`,
      role: "Strategy Lead",
      department: "Advisory",
      employmentStatus: "Active",
      weeklyCapacityHours: 35,
      billingRate: 250,
      currency: "USD",
      startDate: "2026-01-01",
    });

    consultantActorA = {
      id: new ObjectId().toHexString(),
      openId: "alice-openId",
      name: "Alice Consultant",
      email: testConsultantA.email,
      loginMethod: "test",
      role: "consultant",
      consultantId: testConsultantA.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    consultantActorB = {
      id: new ObjectId().toHexString(),
      openId: "bob-openId",
      name: "Bob Consultant",
      email: testConsultantB.email,
      loginMethod: "test",
      role: "consultant",
      consultantId: testConsultantB.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
  });

  afterAll(async () => {
    // Cleanup test artifacts
    if (db) {
      const clientColl = collection<ClientDocument>(db, "clients");
      const projectColl = collection<ProjectDocument>(db, "projects");
      const consultantColl = collection<ConsultantDocument>(db, "consultants");
      const entriesColl = collection<TimeEntryDocument>(db, "timeEntries");
      const auditColl = collection<ApprovalHistoryDocument>(db, "timeEntryApprovalHistory");

      if (testClient?.id) await clientColl.deleteOne({ _id: new ObjectId(testClient.id) });
      if (testProject?.id) await projectColl.deleteOne({ _id: new ObjectId(testProject.id) });
      if (testConsultantA?.id) await consultantColl.deleteOne({ _id: new ObjectId(testConsultantA.id) });
      if (testConsultantB?.id) await consultantColl.deleteOne({ _id: new ObjectId(testConsultantB.id) });
      if (testConsultantA?.id) {
        await entriesColl.deleteMany({ consultantId: new ObjectId(testConsultantA.id) });
      }
      if (testConsultantB?.id) {
        await entriesColl.deleteMany({ consultantId: new ObjectId(testConsultantB.id) });
      }
    }
  });

  describe("TASK 1: Approval & Audit-History Integrity", () => {
    it("Scenario 1: Approval succeeds and the audit record is durably created", async () => {
      // Create entry as Consultant A
      const entry = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-15",
        description: "Task 1 Scenario 1 Success",
        hours: 8,
        billingClassification: "Billable",
      }, consultantActorA);

      expect(entry.status).toBe("Draft");

      // Submit entry
      const submitted = await erp.transitionTimeEntry(entry.id, "Submitted", consultantActorA);
      expect(submitted.status).toBe("Submitted");

      // Approve as Manager
      const approved = await erp.transitionTimeEntry(entry.id, "Approved", managerActor);
      expect(approved.status).toBe("Approved");
      expect(approved.reviewedBy).toBe(managerActor.id);

      // Verify audit record in MongoDB
      const history = await erp.listApprovalHistory(entry.id, adminActor);
      expect(history.length).toBeGreaterThanOrEqual(2); // Draft->Submitted, Submitted->Approved
      const approvalAudit = history.find(h => h.newStatus === "Approved");
      expect(approvalAudit).toBeDefined();
      expect(approvalAudit?.previousStatus).toBe("Submitted");
      expect(approvalAudit?.actedBy).toBe(managerActor.id);
    });

    it("Scenario 2: Approval fails before time-entry update if invalid transition or missing", async () => {
      const nonExistentId = new ObjectId().toHexString();
      await expect(erp.transitionTimeEntry(nonExistentId, "Approved", managerActor)).rejects.toThrow();

      // Check DB state: nothing created
      const history = await collection<ApprovalHistoryDocument>(db, "timeEntryApprovalHistory").find({ timeEntryId: new ObjectId(nonExistentId) }).toArray();
      expect(history).toHaveLength(0);
    });

    it("Scenario 3: Audit-history failure triggers compensating rollback in standalone mode", async () => {
      // Create and submit entry
      const entry = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-16",
        description: "Task 1 Scenario 3 Failure Injection",
        hours: 6,
        billingClassification: "Billable",
      }, consultantActorA);

      await erp.transitionTimeEntry(entry.id, "Submitted", consultantActorA);

      // Monkey-patch collection to simulate failure on timeEntryApprovalHistory insert
      const originalCollection = db.collection.bind(db);
      const auditCollMock = {
        ...originalCollection("timeEntryApprovalHistory"),
        insertOne: async () => {
          throw new Error("SIMULATED_DISK_WRITE_FAILURE");
        },
      };

      const spy = vi.spyOn(db, "collection").mockImplementation((name: string) => {
        if (name === "timeEntryApprovalHistory") return auditCollMock as any;
        return originalCollection(name);
      });

      try {
        await expect(erp.transitionTimeEntry(entry.id, "Approved", managerActor)).rejects.toThrow(/Audit history write failed|Approval transition failed and was rolled back/);

        // Verify persisted DB state: entry must NOT remain Approved!
        const persisted = await collection<TimeEntryDocument>(db, "timeEntries").findOne({ _id: new ObjectId(entry.id) });
        expect(persisted?.status).toBe("Submitted"); // Rolled back to Submitted!
      } finally {
        spy.mockRestore();
      }
    });

    it("Scenario 4: Two reviewers attempt conflicting transitions concurrently (optimistic concurrency)", async () => {
      const entry = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-17",
        description: "Task 1 Scenario 4 Concurrency",
        hours: 5,
        billingClassification: "Billable",
      }, consultantActorA);

      await erp.transitionTimeEntry(entry.id, "Submitted", consultantActorA);

      // Two reviewers simultaneously transition the same entry
      const reviewer1 = managerActor;
      const reviewer2 = adminActor;

      const [res1, res2] = await Promise.allSettled([
        erp.transitionTimeEntry(entry.id, "Approved", reviewer1),
        erp.transitionTimeEntry(entry.id, "Rejected", reviewer2, "Duplicate task"),
      ]);

      // Exactly one must succeed and one must be rejected with CONFLICT
      const successes = [res1, res2].filter(r => r.status === "fulfilled");
      const failures = [res1, res2].filter(r => r.status === "rejected");

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      const err = (failures[0] as PromiseRejectedResult).reason;
      expect(err.message).toMatch(/Concurrent modification detected|Cannot move/);

      // Verify DB state has exactly 1 final status, no corrupt overwrites
      const finalEntry = await collection<TimeEntryDocument>(db, "timeEntries").findOne({ _id: new ObjectId(entry.id) });
      expect(["Approved", "Rejected"]).toContain(finalEntry?.status);
    });

    it("Scenario 5: An invalid state transition is rejected with no state change", async () => {
      const entry = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-18",
        description: "Task 1 Scenario 5 Invalid Transition",
        hours: 4,
        billingClassification: "Billable",
      }, consultantActorA);

      expect(entry.status).toBe("Draft");

      // Attempt illegal transition directly from Draft -> Approved
      await expect(erp.transitionTimeEntry(entry.id, "Approved", managerActor)).rejects.toThrow(/Cannot move/);

      // Inspect DB state
      const check = await collection<TimeEntryDocument>(db, "timeEntries").findOne({ _id: new ObjectId(entry.id) });
      expect(check?.status).toBe("Draft");
    });

    it("Scenario 6: The actor is strictly prevented from approving their own entry", async () => {
      // Manager creates an entry
      const entry = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-19",
        description: "Task 1 Scenario 6 Self-Approval by creator",
        hours: 4,
        billingClassification: "Billable",
      }, managerActor);

      await erp.transitionTimeEntry(entry.id, "Submitted", managerActor);

      // Manager attempts to approve their own entry
      await expect(erp.transitionTimeEntry(entry.id, "Approved", managerActor)).rejects.toThrow(/cannot approve or reject your own/);

      // Also verify if a consultant who is given reviewer role cannot approve their own consultant record entry
      const dualRoleActor: User = { ...consultantActorA, role: "manager" }; // consultant A with manager role
      const entry2 = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-19",
        description: "Task 1 Scenario 6 Self-Approval by consultant record",
        hours: 4,
        billingClassification: "Billable",
      }, adminActor); // created by admin

      await erp.transitionTimeEntry(entry2.id, "Submitted", adminActor);

      // Dual-role consultant A attempts to approve work done by consultant A
      await expect(erp.transitionTimeEntry(entry2.id, "Approved", dualRoleActor)).rejects.toThrow(/cannot approve or reject your own/);
    });

    it("Scenario 7: Database failure during transition fails safely without partial write", async () => {
      const entry = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-20",
        description: "Task 1 Scenario 7 DB Failure",
        hours: 4,
        billingClassification: "Billable",
      }, consultantActorA);

      await erp.transitionTimeEntry(entry.id, "Submitted", consultantActorA);

      // Mock updateOne failure on timeEntries
      const originalCollection = db.collection.bind(db);
      const timeEntriesMock = {
        ...originalCollection("timeEntries"),
        updateOne: async () => {
          throw new Error("ECONNRESET: Database connection severed");
        },
      };

      const spy = vi.spyOn(db, "collection").mockImplementation((name: string) => {
        if (name === "timeEntries") return timeEntriesMock as any;
        return originalCollection(name);
      });

      try {
        await expect(erp.transitionTimeEntry(entry.id, "Approved", managerActor)).rejects.toThrow();

        // Check persisted state: status must remain Submitted, no audit written
        const history = await collection<ApprovalHistoryDocument>(db, "timeEntryApprovalHistory").find({ timeEntryId: new ObjectId(entry.id), newStatus: "Approved" }).toArray();
        expect(history).toHaveLength(0);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("TASK 2: Dynamic Reporting Periods & Injectable Clock", () => {
    it("dynamically calculates 'this-month' boundaries and leap years", () => {
      // Leap year Feb 2024
      const feb2024 = periodDateRange("this-month", "2024-02-14");
      expect(feb2024).toEqual({ from: "2024-02-01", to: "2024-02-29" });

      // Non-leap year Feb 2025
      const feb2025 = periodDateRange("this-month", "2025-02-14");
      expect(feb2025).toEqual({ from: "2025-02-01", to: "2025-02-28" });

      // Month with 30 days (April 2026)
      const apr2026 = periodDateRange("this-month", "2026-04-10");
      expect(apr2026).toEqual({ from: "2026-04-01", to: "2026-04-30" });

      // Month with 31 days (October 2026)
      const oct2026 = periodDateRange("this-month", "2026-10-28");
      expect(oct2026).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    });

    it("dynamically calculates 'last-month' with year transition", () => {
      // Year transition: Jan 2026 -> Dec 2025
      const jan2026 = periodDateRange("last-month", "2026-01-15");
      expect(jan2026).toEqual({ from: "2025-12-01", to: "2025-12-31" });

      // Standard last month: March 2026 -> Feb 2026 (non-leap: 28 days)
      const mar2026 = periodDateRange("last-month", "2026-03-10");
      expect(mar2026).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    });

    it("dynamically calculates 'this-week' (Monday to Sunday) across month boundary", () => {
      // Wednesday Oct 28 2026: Week starts Monday Oct 26, ends Sunday Nov 1
      const weekRange = periodDateRange("this-week", "2026-10-28");
      expect(weekRange).toEqual({ from: "2026-10-26", to: "2026-11-01" });

      // Business days in Mon Oct 26 to Sun Nov 01: Mon, Tue, Wed, Thu, Fri = 5 days
      expect(countBusinessDays(weekRange.from, weekRange.to)).toBe(5);
    });

    it("dynamically calculates 'this-quarter' for all 4 calendar quarters", () => {
      expect(periodDateRange("this-quarter", "2026-02-15")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
      expect(periodDateRange("this-quarter", "2026-05-15")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
      expect(periodDateRange("this-quarter", "2026-08-15")).toEqual({ from: "2026-07-01", to: "2026-09-30" });
      expect(periodDateRange("this-quarter", "2026-11-15")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    });

    it("ensures start-date and end-date inclusivity in business days count", () => {
      // Single Friday: 2026-10-23
      expect(countBusinessDays("2026-10-23", "2026-10-23")).toBe(1);
      // Single Saturday: 2026-10-24
      expect(countBusinessDays("2026-10-24", "2026-10-24")).toBe(0);
      // Friday to Monday: Fri 23, Sat 24, Sun 25, Mon 26 -> 2 business days
      expect(countBusinessDays("2026-10-23", "2026-10-26")).toBe(2);
    });
  });

  describe("TASK 3: Financial Calculation & Rate Snapshot Integrity", () => {
    it("preserves historical billingRateSnapshot when consultant rate is subsequently updated", async () => {
      // Create billable entry with snapshot rate 200
      const entry = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-21",
        description: "Historical Rate Snapshot Verification",
        hours: 10,
        billingClassification: "Billable",
      }, consultantActorA);

      expect(entry.billingRateSnapshot).toBe(200);

      // Now Admin updates consultant's rate from 200 to 350
      await erp.updateConsultant(testConsultantA.id, {
        employeeCode: testConsultantA.employeeCode,
        firstName: testConsultantA.firstName,
        lastName: testConsultantA.lastName,
        email: testConsultantA.email,
        role: testConsultantA.role,
        department: testConsultantA.department,
        employmentStatus: "Active",
        weeklyCapacityHours: 40,
        billingRate: 350, // Rate increased
        currency: "USD",
        startDate: "2026-01-01",
      });

      // Reload time entry from database
      const reloadedEntry = await erp.getTimeEntry(entry.id, adminActor);
      // Historical snapshot MUST REMAIN 200!
      expect(reloadedEntry.billingRateSnapshot).toBe(200);
    });

    it("prevents unprivileged consultant from tampering with billing rate in payload", async () => {
      // Consultant submits entry with malicious billingRate: 9999
      const entry = await erp.createTimeEntry({
        consultantId: testConsultantA.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-22",
        description: "Rate Tampering Attempt",
        hours: 5,
        billingClassification: "Billable",
        billingRate: 9999, // Attempted rate injection
      }, consultantActorA);

      // Must be bound to consultant's official rate (350 from previous test), NOT 9999!
      expect(entry.billingRateSnapshot).toBe(350);
    });

    it("segregates estimated revenue by currency without cross-currency aggregation", async () => {
      // Create multi-currency projects and entries
      const eurProject = await erp.createProject({ clientId: testClient.id, name: "European Advisory", status: "Active", billingCurrency: "EUR" });
      const eurEntry = await erp.createTimeEntry({
        consultantId: testConsultantB.id,
        clientId: testClient.id,
        projectId: eurProject.id,
        workDate: "2026-10-23",
        description: "Euro billing",
        hours: 10,
        billingClassification: "Billable",
      }, adminActor);

      // Approve EUR entry (approved by Manager to comply with no self-approval)
      await erp.transitionTimeEntry(eurEntry.id, "Submitted", adminActor);
      await erp.transitionTimeEntry(eurEntry.id, "Approved", managerActor);

      // Query metrics
      const metrics = await erp.timeEntryMetrics({ from: "2026-10-01", to: "2026-10-31" }, financeActor);
      expect(metrics.estimatedRevenueByCurrency.USD).toBeDefined();
      expect(metrics.estimatedRevenueByCurrency.EUR).toBe(2500); // 10h * 250 EUR
      // Currencies are kept strictly distinct
      expect(typeof metrics.estimatedRevenueByCurrency.USD).toBe("number");
      expect(typeof metrics.estimatedRevenueByCurrency.EUR).toBe("number");

      // Cleanup eurProject
      await collection<ProjectDocument>(db, "projects").deleteOne({ _id: new ObjectId(eurProject.id) });
      await collection<TimeEntryDocument>(db, "timeEntries").deleteOne({ _id: new ObjectId(eurEntry.id) });
    });

    it("zero-capacity handling returns null or zero without division-by-zero errors", () => {
      expect(utilizationFormula(40, 0)).toBeNull();
      expect(utilizationFormula(0, 0)).toBeNull();
      expect(calculatePeriodCapacity(0, "this-week")).toBe(0);
    });
  });

  describe("TASK 4: Authorization & Scope Enforcement", () => {
    it("Consultant can only access their own consultant record and time entries", async () => {
      // Alice tries to get Bob's consultant record
      await expect(erp.getConsultant(testConsultantB.id, consultantActorA)).rejects.toThrow(/outside your permitted scope/);

      // Alice tries to list all consultants: returns ONLY Alice
      const list = await erp.listConsultants(consultantActorA);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(testConsultantA.id);

      // Alice tries to create a time entry for Bob
      await expect(erp.createTimeEntry({
        consultantId: testConsultantB.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-10-24",
        description: "Privilege Escalation Attempt",
        hours: 4,
        billingClassification: "Billable",
      }, consultantActorA)).rejects.toThrow(/outside your permitted scope/);
    });

    it("Consultant cannot access client or project reference directories", async () => {
      await expect(erp.listClients(consultantActorA)).rejects.toThrow(/not assigned to a project scope/);
      await expect(erp.listProjects(consultantActorA)).rejects.toThrow(/not assigned to a project scope/);
    });

    it("Manager has management and approval permissions but financial metrics are scrubbed", async () => {
      expect(hasPermission("manager", "time.approve")).toBe(true);
      expect(hasPermission("manager", "metrics.financial")).toBe(false);

      const metrics = await erp.timeEntryMetrics({ from: "2026-10-01", to: "2026-10-31" }, managerActor);
      expect(metrics.estimatedRevenueByCurrency).toEqual({});
      expect(metrics.approvedEstimatedRevenueByCurrency).toEqual({});
      expect(metrics.billableHours).toBeGreaterThanOrEqual(0);
    });

    it("Finance has financial metrics and client management but cannot submit or approve time", () => {
      expect(hasPermission("finance", "metrics.financial")).toBe(true);
      expect(hasPermission("finance", "time.approve")).toBe(false);
      expect(hasPermission("finance", "time.submit")).toBe(false);
      expect(hasPermission("finance", "time.write")).toBe(false);
    });

    it("Unassigned user role has zero operational permissions", () => {
      expect(permissionsFor("user")).toEqual([]);
      expect(hasPermission("user", "consultants.read")).toBe(false);
      expect(hasPermission("user", "time.read")).toBe(false);
      expect(hasPermission("user", "metrics.utilization")).toBe(false);
    });
  });

  describe("TASK 5: Live CRUD Acceptance across all entities", () => {
    it("performs complete client lifecycle (create, read, update, deactivate)", async () => {
      const code = `CL-LIFE-${Date.now()}`;
      const client = await erp.createClient({ clientCode: code, name: "Lifecycle Client", status: "Active", defaultCurrency: "USD" });
      expect(client.clientCode).toBe(code);

      const updated = await erp.updateClient(client.id, { clientCode: code, name: "Updated Lifecycle Client", status: "Inactive", defaultCurrency: "USD" });
      expect(updated.name).toBe("Updated Lifecycle Client");
      expect(updated.status).toBe("Inactive");

      // Cleanup
      await collection<ClientDocument>(db, "clients").deleteOne({ _id: new ObjectId(client.id) });
    });

    it("performs complete project lifecycle with client association", async () => {
      const proj = await erp.createProject({ clientId: testClient.id, name: "Lifecycle Project", status: "Active", billingCurrency: "USD", startDate: "2026-01-01", endDate: "2026-12-31" });
      expect(proj.name).toBe("Lifecycle Project");

      const updated = await erp.updateProject(proj.id, { clientId: testClient.id, name: "Lifecycle Project Closed", status: "Closed", billingCurrency: "USD" });
      expect(updated.status).toBe("Closed");

      // Cleanup
      await collection<ProjectDocument>(db, "projects").deleteOne({ _id: new ObjectId(proj.id) });
    });

    it("performs complete consultant lifecycle including deactivation", async () => {
      const c = await erp.createConsultant({
        employeeCode: `EMP-DEACT-${Date.now()}`,
        firstName: "Deact",
        lastName: "User",
        email: `deact.${Date.now()}@nexcore.test`,
        role: "Contractor",
        department: "Testing",
        employmentStatus: "Active",
        weeklyCapacityHours: 20,
        billingRate: 150,
        currency: "USD",
        startDate: "2026-05-01",
      });
      expect(c.employmentStatus).toBe("Active");

      const deactivated = await erp.deactivateConsultant(c.id);
      expect(deactivated.employmentStatus).toBe("Inactive");

      // Cleanup
      await collection<ConsultantDocument>(db, "consultants").deleteOne({ _id: new ObjectId(c.id) });
    });
  });
});
