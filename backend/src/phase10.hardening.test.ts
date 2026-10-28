import "dotenv/config";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { ObjectId } from "mongodb";
import { checkMongoHealth, requireMongoDb, collection, type TimeEntryDocument, type ApprovalHistoryDocument } from "./mongo";
import { getSessionCookieOptions } from "./_core/cookies";
import * as erp from "./erpDb";
import type { User } from "./types";

describe("Phase 10: Production Hardening, Security, and Final Acceptance", () => {
  let db: Awaited<ReturnType<typeof requireMongoDb>>;

  beforeAll(async () => {
    db = await requireMongoDb();
  });

  describe("1. Infrastructure & MongoDB Health Probe", () => {
    it("reports real database connectivity, latency, and topology without error", async () => {
      const health = await checkMongoHealth();
      expect(health.connected).toBe(true);
      expect(typeof health.latencyMs).toBe("number");
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.database).toBe("consultant_utilization_dashboard");
      expect(["standalone", "replicaSet"]).toContain(health.topology);
      expect(typeof health.transactionsSupported).toBe("boolean");
    });
  });

  describe("2. Authentication & Cookie Security (SameSite & CSRF Defense)", () => {
    it("defaults to SameSite=Lax and Secure=true in production direct deployments", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSameSite = process.env.COOKIE_SAME_SITE;
      try {
        process.env.NODE_ENV = "production";
        delete process.env.COOKIE_SAME_SITE;

        const options = getSessionCookieOptions();
        expect(options.sameSite).toBe("lax");
        expect(options.secure).toBe(true);
        expect(options.httpOnly).toBe(true);
        expect(options.path).toBe("/");
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSameSite !== undefined) process.env.COOKIE_SAME_SITE = originalSameSite;
      }
    });

    it("supports SameSite=None only when explicitly configured for cross-site embedding", () => {
      const originalSameSite = process.env.COOKIE_SAME_SITE;
      try {
        process.env.COOKIE_SAME_SITE = "none";
        const options = getSessionCookieOptions();
        expect(options.sameSite).toBe("none");
        expect(options.secure).toBe(true); // Must always be secure if SameSite=None
      } finally {
        if (originalSameSite !== undefined) process.env.COOKIE_SAME_SITE = originalSameSite;
        else delete process.env.COOKIE_SAME_SITE;
      }
    });

    it("supports SameSite=Strict for maximum CSRF isolation", () => {
      const originalSameSite = process.env.COOKIE_SAME_SITE;
      try {
        process.env.COOKIE_SAME_SITE = "strict";
        const options = getSessionCookieOptions();
        expect(options.sameSite).toBe("strict");
      } finally {
        if (originalSameSite !== undefined) process.env.COOKIE_SAME_SITE = originalSameSite;
        else delete process.env.COOKIE_SAME_SITE;
      }
    });
  });

  describe("3. Data Integrity & Production Replica Set Policy", () => {
    it("enforces replica set transactions in production unless explicitly bypassed", async () => {
      const originalEnv = process.env.NODE_ENV;
      const originalReq = process.env.REQUIRE_REPLICA_SET_TRANSACTIONS;
      const originalAllow = process.env.ALLOW_STANDALONE_IN_PROD;

      const health = await checkMongoHealth();

      try {
        // Enforce replica set requirement
        process.env.REQUIRE_REPLICA_SET_TRANSACTIONS = "true";
        delete process.env.ALLOW_STANDALONE_IN_PROD;

        if (!health.transactionsSupported) {
          // If running locally on standalone, attempting transition must fail safely
          const dummyUser: User = { id: new ObjectId().toHexString(), openId: "o", name: "T", email: "e", loginMethod: "t", role: "admin", consultantId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
          await expect(erp.transitionTimeEntry(new ObjectId().toHexString(), "Submitted", dummyUser)).rejects.toThrow(/replica set for multi-document transaction atomicity/);
        }
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalReq !== undefined) process.env.REQUIRE_REPLICA_SET_TRANSACTIONS = originalReq;
        else delete process.env.REQUIRE_REPLICA_SET_TRANSACTIONS;
        if (originalAllow !== undefined) process.env.ALLOW_STANDALONE_IN_PROD = originalAllow;
        else delete process.env.ALLOW_STANDALONE_IN_PROD;
      }
    });
  });

  describe("4. End-to-End Multi-Role Workflow Acceptance", () => {
    it("completes full operational lifecycle across Consultant, Manager, Finance, and Admin", async () => {
      // 1. Admin creates client, project, and consultant
      const client = await erp.createClient({ clientCode: `CL-E2E-${Date.now()}`, name: "End-to-End Enterprise", status: "Active", defaultCurrency: "USD" });
      const project = await erp.createProject({ clientId: client.id, name: "ERP Migration", status: "Active", billingCurrency: "USD" });
      const consultant = await erp.createConsultant({
        employeeCode: `EMP-E2E-${Date.now()}`,
        firstName: "Charlie",
        lastName: "Engineer",
        email: `charlie.${Date.now()}@nexcore.test`,
        role: "DevOps Architect",
        department: "Infrastructure",
        employmentStatus: "Active",
        weeklyCapacityHours: 40,
        billingRate: 275,
        currency: "USD",
        startDate: "2026-01-01",
      });

      const consultantUser: User = {
        id: new ObjectId().toHexString(),
        openId: "charlie-openId",
        name: "Charlie Engineer",
        email: consultant.email,
        loginMethod: "test",
        role: "consultant",
        consultantId: consultant.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      const managerUser: User = {
        id: new ObjectId().toHexString(),
        openId: "mgr-openId",
        name: "Mary Manager",
        email: "mary@nexcore.test",
        loginMethod: "test",
        role: "manager",
        consultantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      const financeUser: User = {
        id: new ObjectId().toHexString(),
        openId: "fin-openId",
        name: "Fred Finance",
        email: "fred@nexcore.test",
        loginMethod: "test",
        role: "finance",
        consultantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      const adminUser: User = {
        id: new ObjectId().toHexString(),
        openId: "admin-e2e-openId",
        name: "Alice Admin",
        email: "admin@nexcore.test",
        loginMethod: "test",
        role: "admin",
        consultantId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      let entry: any = null;
      try {
        // 2. Consultant logs 8 hours (Draft)
        entry = await erp.createTimeEntry({
          consultantId: consultant.id,
          clientId: client.id,
          projectId: project.id,
          workDate: "2026-10-25",
          description: "Infrastructure terraform scripts",
          hours: 8,
          billingClassification: "Billable",
        }, consultantUser);
        expect(entry.status).toBe("Draft");
        expect(entry.billingRateSnapshot).toBe(275);

        // 3. Consultant submits timesheet
        const submitted = await erp.transitionTimeEntry(entry.id, "Submitted", consultantUser);
        expect(submitted.status).toBe("Submitted");

        // 4. Manager reviews and approves
        const approved = await erp.transitionTimeEntry(entry.id, "Approved", managerUser);
        expect(approved.status).toBe("Approved");
        expect(approved.reviewedBy).toBe(managerUser.id);

        // 5. Finance inspects revenue metrics
        const finMetrics = await erp.timeEntryMetrics({ from: "2026-10-01", to: "2026-10-31" }, financeUser);
        expect(finMetrics.estimatedRevenueByCurrency.USD).toBeGreaterThanOrEqual(2200); // 8h * 275

        // 6. Admin audits history trail
        const auditTrail = await erp.listApprovalHistory(entry.id, adminUser);
        expect(auditTrail.length).toBeGreaterThanOrEqual(2);
        const approvedAudit = auditTrail.find((a) => a.newStatus === "Approved");
        expect(approvedAudit?.actedBy).toBe(managerUser.id);
        expect(approvedAudit?.previousStatus).toBe("Submitted");

        // 7. Verify Unassigned user is blocked from viewing entry
        const unassignedUser: User = { id: new ObjectId().toHexString(), openId: "unassigned", name: "Guest", email: null, loginMethod: "test", role: "user", consultantId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
        await expect(erp.getTimeEntry(entry.id, unassignedUser)).rejects.toThrow();
      } finally {
        // Cleanup test data
        await collection(db, "timeEntries").deleteMany({ consultantId: new ObjectId(consultant.id) });
        await collection(db, "timeEntryApprovalHistory").deleteMany({ timeEntryId: new ObjectId(entry?.id) });
        await collection(db, "consultants").deleteOne({ _id: new ObjectId(consultant.id) });
        await collection(db, "projects").deleteOne({ _id: new ObjectId(project.id) });
        await collection(db, "clients").deleteOne({ _id: new ObjectId(client.id) });
      }
    });
  });
});
