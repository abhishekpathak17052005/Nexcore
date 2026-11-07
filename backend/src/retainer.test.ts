import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ObjectId } from "mongodb";
import { appRouter } from "./routers";
import { requireMongoDb } from "./mongo";
import type { User } from "./types";

// Test user factories
const TEST_ORG_ID = new ObjectId().toHexString();

const createTestUser = (role: "admin" | "manager" | "finance" | "consultant", overrides?: Partial<User>): User => ({
  id: new ObjectId().toHexString(),
  openId: `test-${role}-${Date.now()}`,
  name: `Test ${role}`,
  email: `${role}@test.com`,
  loginMethod: null,
  role,
  status: "active",
  organizationId: TEST_ORG_ID,
  membershipStatus: "active",
  consultantId: role === "consultant" ? new ObjectId().toHexString() : null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  ...overrides,
});

function createCaller(user: User | null) {
  return appRouter.createCaller({
    req: {} as never,
    res: {} as never,
    user
  });
}

describe("Retainer Management Integration Tests", () => {
  let db: Awaited<ReturnType<typeof requireMongoDb>>;
  const createdIds: { clients: string[]; projects: string[]; retainers: string[]; timeEntries: string[] } = {
    clients: [],
    projects: [],
    retainers: [],
    timeEntries: [],
  };

  let testClient: { id: string; name: string; clientCode: string };
  let testProject: { id: string; name: string; clientId: string };
  let testConsultant: { id: string; name: string };

  const adminUser = createTestUser("admin");
  const managerUser = createTestUser("manager");
  const financeUser = createTestUser("finance");
  const consultantUser = createTestUser("consultant");

  beforeAll(async () => {
    db = await requireMongoDb();

    // Create test consultant
    const adminCaller = createCaller(adminUser);
    testConsultant = await adminCaller.consultants.create({
      employeeCode: `TEST-CONS-${Date.now()}`,
      firstName: "Test",
      lastName: "Consultant",
      email: `test-consultant-${Date.now()}@test.com`,
      role: "Developer",
      department: "Engineering",
      employmentStatus: "Active",
      weeklyCapacityHours: 40,
      billingRate: 150,
      currency: "USD",
      startDate: "2026-01-01",
    });

    // Create test client
    testClient = await adminCaller.clients.create({
      clientCode: `TEST-CL-${Date.now()}`,
      name: `Test Client ${Date.now()}`,
      status: "Active",
      defaultCurrency: "USD",
    });
    createdIds.clients.push(testClient.id);

    // Create test project
    testProject = await adminCaller.projects.create({
      clientId: testClient.id,
      name: `Test Project ${Date.now()}`,
      status: "Active",
      billingCurrency: "USD",
      startDate: "2026-01-01",
      endDate: null,
    });
    createdIds.projects.push(testProject.id);
  });

  afterAll(async () => {
    // Cleanup test data
    if (db) {
      await Promise.all([
        db.collection("retainers").deleteMany({
          _id: { $in: createdIds.retainers.map(id => new ObjectId(id)) }
        }),
        db.collection("timeEntries").deleteMany({
          _id: { $in: createdIds.timeEntries.map(id => new ObjectId(id)) }
        }),
        db.collection("projects").deleteMany({
          _id: { $in: createdIds.projects.map(id => new ObjectId(id)) }
        }),
        db.collection("clients").deleteMany({
          _id: { $in: createdIds.clients.map(id => new ObjectId(id)) }
        }),
        db.collection("consultants").deleteMany({
          _id: new ObjectId(testConsultant.id)
        }),
      ]);
    }
  });

  describe("CRUD Operations", () => {
    it("creates an hour-based retainer with admin permissions", async () => {
      const adminCaller = createCaller(adminUser);

      const retainer = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: null,
        name: "Q1 2026 Development Retainer",
        type: "HOURS",
        contractedHours: 160,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });

      createdIds.retainers.push(retainer.id);

      expect(retainer.id).toBeTruthy();
      expect(retainer.name).toBe("Q1 2026 Development Retainer");
      expect(retainer.type).toBe("HOURS");
      expect(retainer.contractedHours).toBe(160);
      expect(retainer.contractedAmount).toBeNull();
      expect(retainer.status).toBe("DRAFT");
      expect(retainer.clientId).toBe(testClient.id);
    });

    it("creates an amount-based retainer", async () => {
      const adminCaller = createCaller(adminUser);

      const retainer = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: testProject.id,
        name: "Annual Support Contract",
        type: "AMOUNT",
        contractedHours: null,
        contractedAmount: 50000,
        currency: "USD",
        billingFrequency: "ANNUALLY",
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        rolloverAllowed: true,
        alertThresholdPercent: 90,
      });

      createdIds.retainers.push(retainer.id);

      expect(retainer.type).toBe("AMOUNT");
      expect(retainer.contractedAmount).toBe(50000);
      expect(retainer.contractedHours).toBeNull();
      expect(retainer.projectId).toBe(testProject.id);
      expect(retainer.rolloverAllowed).toBe(true);
    });

    it("retrieves a retainer by ID", async () => {
      const adminCaller = createCaller(adminUser);

      const created = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: null,
        name: "Test Retrieval",
        type: "HOURS",
        contractedHours: 100,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        rolloverAllowed: false,
        alertThresholdPercent: 75,
      });
      createdIds.retainers.push(created.id);

      const retrieved = await adminCaller.retainers.get({ id: created.id });

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe("Test Retrieval");
    });

    it("lists all retainers for an organization", async () => {
      const adminCaller = createCaller(adminUser);
      const list = await adminCaller.retainers.list();

      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(2);
    });

    it("updates a retainer", async () => {
      const adminCaller = createCaller(adminUser);

      const created = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: null,
        name: "Original Name",
        type: "HOURS",
        contractedHours: 100,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(created.id);

      const updated = await adminCaller.retainers.update({
        id: created.id,
        data: {
          clientId: testClient.id,
          projectId: null,
          name: "Updated Name",
          type: "HOURS",
          contractedHours: 150,
          contractedAmount: null,
          currency: "USD",
          billingFrequency: "MONTHLY",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          rolloverAllowed: true,
          alertThresholdPercent: 85,
        },
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.contractedHours).toBe(150);
      expect(updated.rolloverAllowed).toBe(true);
      expect(updated.alertThresholdPercent).toBe(85);
    });
  });

  describe("Status Transitions", () => {
    it("activates a draft retainer", async () => {
      const adminCaller = createCaller(adminUser);

      const draft = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: null,
        name: "Draft to Active",
        type: "HOURS",
        contractedHours: 80,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(draft.id);

      expect(draft.status).toBe("DRAFT");

      const activated = await adminCaller.retainers.activate({ id: draft.id });

      expect(activated.status).toBe("ACTIVE");
    });

    it("terminates an active retainer", async () => {
      const adminCaller = createCaller(adminUser);

      const draft = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: null,
        name: "Active to Terminated",
        type: "HOURS",
        contractedHours: 80,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(draft.id);

      const activated = await adminCaller.retainers.activate({ id: draft.id });
      expect(activated.status).toBe("ACTIVE");

      const terminated = await adminCaller.retainers.terminate({ id: draft.id });

      expect(terminated.status).toBe("TERMINATED");
    });

    it("prevents activating a non-draft retainer", async () => {
      const adminCaller = createCaller(adminUser);

      const draft = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: null,
        name: "Already Active",
        type: "HOURS",
        contractedHours: 80,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(draft.id);

      await adminCaller.retainers.activate({ id: draft.id });

      await expect(
        adminCaller.retainers.activate({ id: draft.id })
      ).rejects.toThrow(/Cannot activate/i);
    });
  });

  describe("Usage Calculation", () => {
    it("calculates usage for hour-based retainer with approved time entries", async () => {
      const adminCaller = createCaller(adminUser);
      const managerCaller = createCaller(managerUser);

      // Create and activate retainer
      const retainer = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: testProject.id,
        name: "Usage Test Retainer",
        type: "HOURS",
        contractedHours: 100,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(retainer.id);

      await adminCaller.retainers.activate({ id: retainer.id });

      // Create approved time entries
      const entry1 = await adminCaller.timeEntries.create({
        consultantId: testConsultant.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-01-15",
        description: "Development work",
        hours: 8,
        billingClassification: "Billable",
        billingRate: 150,
        currency: "USD",
      });
      createdIds.timeEntries.push(entry1.id);

      await adminCaller.timeEntries.submit({ id: entry1.id });
      await managerCaller.timeEntries.approve({ id: entry1.id });

      // Check usage
      const usage = await adminCaller.retainers.usage({ id: retainer.id });

      expect(usage.retainerId).toBe(retainer.id);
      expect(usage.approvedHours).toBe(8);
      expect(usage.remainingHours).toBe(92); // 100 - 8
      expect(usage.utilizationPercent).toBe(8); // (8/100) * 100
      expect(usage.exceedsContract).toBe(false);
    });

    it("detects contract exceedance", async () => {
      const adminCaller = createCaller(adminUser);
      const managerCaller = createCaller(managerUser);

      // Create small retainer
      const retainer = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: testProject.id,
        name: "Small Retainer",
        type: "HOURS",
        contractedHours: 5,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(retainer.id);

      await adminCaller.retainers.activate({ id: retainer.id });

      // Create and approve entry exceeding contract
      const entry = await adminCaller.timeEntries.create({
        consultantId: testConsultant.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-02-15",
        description: "Overage work",
        hours: 10,
        billingClassification: "Billable",
        billingRate: 150,
        currency: "USD",
      });
      createdIds.timeEntries.push(entry.id);

      await adminCaller.timeEntries.submit({ id: entry.id });
      await managerCaller.timeEntries.approve({ id: entry.id });

      // Check usage shows exceedance
      const usage = await adminCaller.retainers.usage({ id: retainer.id });

      expect(usage.approvedHours).toBe(10);
      expect(usage.remainingHours).toBe(-5); // 5 - 10
      expect(usage.exceedsContract).toBe(true);
    });

    it("only counts approved billable entries in usage", async () => {
      const adminCaller = createCaller(adminUser);

      const retainer = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: testProject.id,
        name: "Approved Only Test",
        type: "HOURS",
        contractedHours: 100,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(retainer.id);

      await adminCaller.retainers.activate({ id: retainer.id });

      // Create draft entry (should not count)
      const draftEntry = await adminCaller.timeEntries.create({
        consultantId: testConsultant.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-03-10",
        description: "Draft work",
        hours: 5,
        billingClassification: "Billable",
        billingRate: 150,
        currency: "USD",
      });
      createdIds.timeEntries.push(draftEntry.id);

      // Create non-billable entry (should not count)
      const nonBillable = await adminCaller.timeEntries.create({
        consultantId: testConsultant.id,
        clientId: testClient.id,
        projectId: testProject.id,
        workDate: "2026-03-11",
        description: "Admin work",
        hours: 3,
        billingClassification: "Non-billable",
      });
      createdIds.timeEntries.push(nonBillable.id);

      // Check usage - should be zero
      const usage = await adminCaller.retainers.usage({ id: retainer.id });

      expect(usage.approvedHours).toBe(0);
      expect(usage.remainingHours).toBe(100);
    });
  });

  describe("Authorization", () => {
    it("allows admin to manage retainers", async () => {
      const adminCaller = createCaller(adminUser);

      const retainer = await adminCaller.retainers.create({
        clientId: testClient.id,
        projectId: null,
        name: "Admin Test",
        type: "HOURS",
        contractedHours: 50,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(retainer.id);

      expect(retainer.id).toBeTruthy();
    });

    it("allows manager to manage retainers", async () => {
      const managerCaller = createCaller(managerUser);

      const retainer = await managerCaller.retainers.create({
        clientId: testClient.id,
        projectId: null,
        name: "Manager Test",
        type: "HOURS",
        contractedHours: 50,
        contractedAmount: null,
        currency: "USD",
        billingFrequency: "MONTHLY",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        rolloverAllowed: false,
        alertThresholdPercent: 80,
      });
      createdIds.retainers.push(retainer.id);

      expect(retainer.id).toBeTruthy();
    });

    it("prevents consultant from creating retainers", async () => {
      const consultantCaller = createCaller(consultantUser);

      await expect(
        consultantCaller.retainers.create({
          clientId: testClient.id,
          projectId: null,
          name: "Consultant Test",
          type: "HOURS",
          contractedHours: 50,
          contractedAmount: null,
          currency: "USD",
          billingFrequency: "MONTHLY",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          rolloverAllowed: false,
          alertThresholdPercent: 80,
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("allows Admin, Manager, and Finance to read retainer alerts while denying Consultants", async () => {
      for (const user of [adminUser, managerUser, financeUser]) {
        await expect(createCaller(user).retainers.alerts()).resolves.toBeDefined();
      }
      await expect(createCaller(consultantUser).retainers.alerts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("Validation", () => {
    it("rejects hour-based retainer without contracted hours", async () => {
      const adminCaller = createCaller(adminUser);

      await expect(
        adminCaller.retainers.create({
          clientId: testClient.id,
          projectId: null,
          name: "Invalid Hours",
          type: "HOURS",
          contractedHours: null,
          contractedAmount: null,
          currency: "USD",
          billingFrequency: "MONTHLY",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          rolloverAllowed: false,
          alertThresholdPercent: 80,
        })
      ).rejects.toThrow();
    });

    it("rejects amount-based retainer without contracted amount", async () => {
      const adminCaller = createCaller(adminUser);

      await expect(
        adminCaller.retainers.create({
          clientId: testClient.id,
          projectId: null,
          name: "Invalid Amount",
          type: "AMOUNT",
          contractedHours: null,
          contractedAmount: null,
          currency: "USD",
          billingFrequency: "MONTHLY",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          rolloverAllowed: false,
          alertThresholdPercent: 80,
        })
      ).rejects.toThrow();
    });

    it("rejects end date before start date", async () => {
      const adminCaller = createCaller(adminUser);

      await expect(
        adminCaller.retainers.create({
          clientId: testClient.id,
          projectId: null,
          name: "Invalid Dates",
          type: "HOURS",
          contractedHours: 100,
          contractedAmount: null,
          currency: "USD",
          billingFrequency: "MONTHLY",
          startDate: "2026-02-01",
          endDate: "2026-01-01", // Before start date
          rolloverAllowed: false,
          alertThresholdPercent: 80,
        })
      ).rejects.toThrow(/start date.*end date/i);
    });

    it("rejects invalid client reference", async () => {
      const adminCaller = createCaller(adminUser);

      await expect(
        adminCaller.retainers.create({
          clientId: new ObjectId().toHexString(), // Non-existent client
          projectId: null,
          name: "Invalid Client",
          type: "HOURS",
          contractedHours: 100,
          contractedAmount: null,
          currency: "USD",
          billingFrequency: "MONTHLY",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          rolloverAllowed: false,
          alertThresholdPercent: 80,
        })
      ).rejects.toThrow(/client.*not exist/i);
    });
  });
});
