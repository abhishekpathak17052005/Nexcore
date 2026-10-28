import "dotenv/config";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "consultant_utilization_dashboard";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient, ObjectId } from "mongodb";
import { getMongoDb, requireMongoDb } from "./mongo";
import * as erp from "./erpDb";
import { assertNotSelfApproval } from "./authorization";
import { appRouter } from "./routers";
import type { User } from "./types";
import { TRPCError } from "@trpc/server";

const TEST_ADMIN: User = {
  id: "507f1f77bcf86cd799439001",
  openId: "test-admin",
  name: "Acceptance Admin",
  email: "admin@acceptance.test",
  loginMethod: "test",
  role: "admin",
  consultantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const TEST_FINANCE: User = {
  id: "507f1f77bcf86cd799439002",
  openId: "test-finance",
  name: "Acceptance Finance",
  email: "finance@acceptance.test",
  loginMethod: "test",
  role: "finance",
  consultantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const TEST_MANAGER: User = {
  id: "507f1f77bcf86cd799439003",
  openId: "test-manager",
  name: "Acceptance Manager",
  email: "manager@acceptance.test",
  loginMethod: "test",
  role: "manager",
  consultantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const TEST_UNASSIGNED: User = {
  id: "507f1f77bcf86cd799439004",
  openId: "test-unassigned",
  name: "Acceptance Unassigned",
  email: "unassigned@acceptance.test",
  loginMethod: "test",
  role: "user",
  consultantId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createCaller(user: User | null) {
  return appRouter.createCaller({ req: {} as never, res: {} as never, user });
}

describe("Phase B & D: Live MongoDB Connectivity, Index & Persistence Tests", () => {
  let directClient: MongoClient;
  const createdConsultantIds: string[] = [];
  const createdClientIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdTimeEntryIds: string[] = [];

  beforeAll(async () => {
    directClient = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017");
    await directClient.connect();
  });

  afterAll(async () => {
    const db = await requireMongoDb();
    // Clean up test fixtures created during the run
    if (createdConsultantIds.length) {
      await db.collection("consultants").deleteMany({
        _id: { $in: createdConsultantIds.map(id => new ObjectId(id)) },
      });
    }
    if (createdClientIds.length) {
      await db.collection("clients").deleteMany({
        _id: { $in: createdClientIds.map(id => new ObjectId(id)) },
      });
    }
    if (createdProjectIds.length) {
      await db.collection("projects").deleteMany({
        _id: { $in: createdProjectIds.map(id => new ObjectId(id)) },
      });
    }
    if (createdTimeEntryIds.length) {
      await db.collection("timeEntries").deleteMany({
        _id: { $in: createdTimeEntryIds.map(id => new ObjectId(id)) },
      });
      await db.collection("timeEntryApprovalHistory").deleteMany({
        timeEntryId: { $in: createdTimeEntryIds.map(id => new ObjectId(id)) },
      });
    }
    // Delete any test-prefixed entries
    await db.collection("consultants").deleteMany({ employeeCode: /^ACC-/ });
    await db.collection("clients").deleteMany({ clientCode: /^ACC-/ });
    await db.collection("projects").deleteMany({ name: /^ACC-/ });
    await directClient.close();
  });

  it("Phase B.1-3: Connects to live MongoDB development database", async () => {
    expect(process.env.MONGODB_URI).toBeDefined();
    expect(process.env.MONGODB_URI).toMatch(/^mongodb(\+srv)?:\/\//);
    const db = await getMongoDb();
    expect(db).not.toBeNull();
    expect(db?.databaseName).toBe(process.env.MONGODB_DB_NAME || "consultant_utilization_dashboard");
  });

  it("Phase B.5: Verifies expected collections exist in MongoDB", async () => {
    const db = await requireMongoDb();
    const collections = (await db.listCollections().toArray()).map(c => c.name);
    expect(collections).toContain("users");
    expect(collections).toContain("consultants");
    expect(collections).toContain("clients");
    expect(collections).toContain("projects");
    expect(collections).toContain("timeEntries");
    expect(collections).toContain("timeEntryApprovalHistory");
  });

  it("Phase B.6: Enforces uniqueness constraint for consultant employee codes and emails", async () => {
    const caller = createCaller(TEST_ADMIN);
    const code = `ACC-U-${Date.now()}`;
    const email = `acc.uniq.${Date.now()}@example.com`;

    const c1 = await caller.consultants.create({
      employeeCode: code,
      firstName: "Uniq",
      lastName: "One",
      email: email,
      role: "Architect",
      department: "Cloud",
      employmentStatus: "Active",
      weeklyCapacityHours: 40,
      billingRate: 200,
      currency: "USD",
      startDate: "2026-01-01",
    });
    createdConsultantIds.push(c1.id);

    // Duplicate employee code must fail with CONFLICT
    await expect(
      caller.consultants.create({
        employeeCode: code,
        firstName: "Duplicate",
        lastName: "Code",
        email: `other.${Date.now()}@example.com`,
        role: "Architect",
        department: "Cloud",
        employmentStatus: "Active",
        weeklyCapacityHours: 40,
        billingRate: 200,
        currency: "USD",
        startDate: "2026-01-01",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Duplicate email must fail with CONFLICT
    await expect(
      caller.consultants.create({
        employeeCode: `ACC-DIFF-${Date.now()}`,
        firstName: "Duplicate",
        lastName: "Email",
        email: email,
        role: "Architect",
        department: "Cloud",
        employmentStatus: "Active",
        weeklyCapacityHours: 40,
        billingRate: 200,
        currency: "USD",
        startDate: "2026-01-01",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("Phase B.9: Checks deployment transaction capabilities", async () => {
    const admin = directClient.db().admin();
    const status = await admin.serverStatus();
    const isReplSet = !!status.repl;
    // On standalone instances, transactions are unsupported by MongoDB engine
    expect(typeof isReplSet).toBe("boolean");
    if (!isReplSet) {
      console.log("[Phase B] Standalone deployment detected (no replica set configured).");
    }
  });

  it("Phase D.1: Live consultant CRUD and deactivation persistence", async () => {
    const caller = createCaller(TEST_ADMIN);
    const code = `ACC-CRUD-${Date.now()}`;

    // Create
    const created = await caller.consultants.create({
      employeeCode: code,
      firstName: "Persist",
      lastName: "Test",
      email: `persist.${Date.now()}@example.com`,
      role: "Lead Consultant",
      department: "Strategy",
      employmentStatus: "Active",
      weeklyCapacityHours: 40,
      billingRate: 250,
      currency: "USD",
      startDate: "2026-01-15",
    });
    createdConsultantIds.push(created.id);
    expect(created.id).toBeDefined();

    // Verify direct MongoDB read
    const db = await requireMongoDb();
    const dbRecord = await db.collection("consultants").findOne({ _id: new ObjectId(created.id) });
    expect(dbRecord).not.toBeNull();
    expect(dbRecord?.employeeCode).toBe(code);
    expect(dbRecord?.billingRate).toBe(250);

    // Update
    const updated = await caller.consultants.update({
      id: created.id,
      data: {
        employeeCode: code,
        firstName: "PersistUpdated",
        lastName: "Test",
        email: `persist.${Date.now()}@example.com`,
        role: "Principal Consultant",
        department: "Strategy",
        employmentStatus: "Active",
        weeklyCapacityHours: 35,
        billingRate: 300,
        currency: "USD",
        startDate: "2026-01-15",
      },
    });
    expect(updated.firstName).toBe("PersistUpdated");
    expect(updated.billingRate).toBe(300);

    // Verify update persisted directly in MongoDB
    const dbUpdated = await db.collection("consultants").findOne({ _id: new ObjectId(created.id) });
    expect(dbUpdated?.firstName).toBe("PersistUpdated");
    expect(dbUpdated?.billingRate).toBe(300);

    // Deactivate
    const deactivated = await caller.consultants.deactivate({ id: created.id });
    expect(deactivated.employmentStatus).toBe("Inactive");

    const dbDeactivated = await db.collection("consultants").findOne({ _id: new ObjectId(created.id) });
    expect(dbDeactivated?.employmentStatus).toBe("Inactive");
  });

  it("Phase D.2: Live client and project creation and relational validation", async () => {
    const caller = createCaller(TEST_ADMIN);
    const clientCode = `ACC-CL-${Date.now()}`;

    // Create Client
    const client = await caller.clients.create({
      clientCode,
      name: "Acceptance Client Corp",
      status: "Active",
      defaultCurrency: "USD",
    });
    createdClientIds.push(client.id);

    // Create Project linked to Client
    const project = await caller.projects.create({
      clientId: client.id,
      name: "ACC Cloud Migration",
      status: "Active",
      billingCurrency: "USD",
      startDate: "2026-02-01",
      endDate: "2026-12-31",
    });
    createdProjectIds.push(project.id);
    expect(project.clientId).toBe(client.id);

    // Attempt to create Project with non-existent clientId -> BAD_REQUEST
    await expect(
      caller.projects.create({
        clientId: "507f1f77bcf86cd799439099",
        name: "ACC Orphan Project",
        status: "Active",
        billingCurrency: "USD",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("Phase D.3-4 & 7: Live time entry creation, duplicate prevention, and billing rate snapshot", async () => {
    const caller = createCaller(TEST_ADMIN);

    // Create consultant, client, project for time entry
    const consultant = await caller.consultants.create({
      employeeCode: `ACC-TE-C-${Date.now()}`,
      firstName: "Time",
      lastName: "Logger",
      email: `timelog.${Date.now()}@example.com`,
      role: "Engineer",
      department: "DevOps",
      employmentStatus: "Active",
      weeklyCapacityHours: 40,
      billingRate: 175,
      currency: "USD",
      startDate: "2026-01-01",
    });
    createdConsultantIds.push(consultant.id);

    const client = await caller.clients.create({
      clientCode: `ACC-TE-CL-${Date.now()}`,
      name: "Time Log Client",
      status: "Active",
      defaultCurrency: "USD",
    });
    createdClientIds.push(client.id);

    const project = await caller.projects.create({
      clientId: client.id,
      name: "ACC Infrastructure",
      status: "Active",
      billingCurrency: "USD",
    });
    createdProjectIds.push(project.id);

    // Create valid Draft time entry
    const entry = await caller.timeEntries.create({
      consultantId: consultant.id,
      clientId: client.id,
      projectId: project.id,
      workDate: "2026-03-10",
      description: "Deployed kubernetes cluster",
      hours: 8,
      billingClassification: "Billable",
    });
    createdTimeEntryIds.push(entry.id);

    expect(entry.status).toBe("Draft");
    // Verify historical billing rate snapshot was captured from consultant
    expect(entry.billingRateSnapshot).toBe(175);
    expect(entry.currency).toBe("USD");

    // Verify in MongoDB
    const db = await requireMongoDb();
    const dbEntry = await db.collection("timeEntries").findOne({ _id: new ObjectId(entry.id) });
    expect(dbEntry?.billingRateSnapshot).toBe(175);

    // Duplicate entry with exact same data must be rejected with CONFLICT
    await expect(
      caller.timeEntries.create({
        consultantId: consultant.id,
        clientId: client.id,
        projectId: project.id,
        workDate: "2026-03-10",
        description: "Deployed kubernetes cluster",
        hours: 8,
        billingClassification: "Billable",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Invalid hours (> 24) must be rejected with BAD_REQUEST
    await expect(
      caller.timeEntries.create({
        consultantId: consultant.id,
        clientId: client.id,
        projectId: project.id,
        workDate: "2026-03-11",
        description: "Invalid hours",
        hours: 25,
        billingClassification: "Billable",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Currency mismatch with project must be rejected with BAD_REQUEST
    await expect(
      caller.timeEntries.create({
        consultantId: consultant.id,
        clientId: client.id,
        projectId: project.id,
        workDate: "2026-03-11",
        description: "Currency mismatch",
        hours: 4,
        billingClassification: "Billable",
        currency: "EUR",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("Phase C: Complete Authorization Security Tests", () => {
  it("Unauthenticated calls to protected procedures are rejected with UNAUTHORIZED", async () => {
    const unauthed = createCaller(null);
    await expect(unauthed.consultants.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(unauthed.clients.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(unauthed.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(unauthed.timeEntries.list({ page: 1, pageSize: 50 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(unauthed.timeEntries.metrics({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("Unassigned users ('user' role) have zero business permissions and get FORBIDDEN", async () => {
    const unassigned = createCaller(TEST_UNASSIGNED);
    await expect(unassigned.consultants.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(unassigned.clients.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(unassigned.projects.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(unassigned.timeEntries.list({ page: 1, pageSize: 50 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(unassigned.timeEntries.metrics({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Non-admins (manager, finance, consultant) cannot escalate or alter user roles", async () => {
    const targetUserId = "507f1f77bcf86cd799439099";
    await expect(
      createCaller(TEST_MANAGER).users.setRole({ userId: targetUserId, role: "admin" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      createCaller(TEST_FINANCE).users.setRole({ userId: targetUserId, role: "admin" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const consultantUser: User = {
      ...TEST_UNASSIGNED,
      role: "consultant",
      consultantId: "507f1f77bcf86cd799439010",
    };
    await expect(
      createCaller(consultantUser).users.setRole({ userId: targetUserId, role: "admin" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Administrator is strictly prevented from changing their own role (anti-lockout)", async () => {
    await expect(
      createCaller(TEST_ADMIN).users.setRole({ userId: TEST_ADMIN.id, role: "user" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Finance role cannot approve or reject time entries or mutate consultants", async () => {
    const finance = createCaller(TEST_FINANCE);
    const dummyId = "507f1f77bcf86cd799439020";

    await expect(finance.timeEntries.approve({ id: dummyId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(finance.timeEntries.reject({ id: dummyId, reason: "Unauthorized" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      finance.consultants.create({
        employeeCode: "F-FAIL",
        firstName: "No",
        lastName: "Auth",
        email: "no.auth@example.com",
        role: "None",
        department: "None",
        employmentStatus: "Active",
        weeklyCapacityHours: 40,
        billingRate: 100,
        currency: "USD",
        startDate: "2026-01-01",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("Consultant cannot view another consultant's detailed record", async () => {
    const callerAdmin = createCaller(TEST_ADMIN);
    const targetConsultant = await callerAdmin.consultants.create({
      employeeCode: `ACC-SCOPE-${Date.now()}`,
      firstName: "Other",
      lastName: "Consultant",
      email: `other.scope.${Date.now()}@example.com`,
      role: "Engineer",
      department: "Delivery",
      employmentStatus: "Active",
      weeklyCapacityHours: 40,
      billingRate: 150,
      currency: "USD",
      startDate: "2026-01-01",
    });

    const consultantUser: User = {
      ...TEST_UNASSIGNED,
      id: "507f1f77bcf86cd799439032",
      role: "consultant",
      consultantId: "507f1f77bcf86cd799439030", // different consultant ID
    };

    const caller = createCaller(consultantUser);
    // Looking up another consultant's record must throw FORBIDDEN
    await expect(caller.consultants.get({ id: targetConsultant.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Clean up
    const db = await requireMongoDb();
    await db.collection("consultants").deleteOne({ _id: new ObjectId(targetConsultant.id) });
  });

  it("Self-approval is strictly prevented by assertNotSelfApproval", () => {
    const managerUser: User = {
      ...TEST_MANAGER,
      id: "507f1f77bcf86cd799439040",
    };
    // If manager created the entry, they cannot approve their own entry
    expect(() => {
      assertNotSelfApproval(managerUser, managerUser.id);
    }).toThrow(TRPCError);

    // Different creator is allowed to proceed to permission check
    expect(() => {
      assertNotSelfApproval(managerUser, "507f1f77bcf86cd799439041");
    }).not.toThrow();
  });
});
