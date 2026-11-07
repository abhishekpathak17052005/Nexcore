import "dotenv/config";
import { ObjectId } from "mongodb";
import { requireMongoDb } from "./mongo";
import { hashPassword, normalizeEmail } from "./password";

const DEMO_MARKER = "nexcore-demo-v1";

async function seedNexcoreDemo() {
  const demoPassword = process.env.NEXCORE_DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 16) {
    throw new Error("Set NEXCORE_DEMO_PASSWORD to a private value with at least 16 characters before seeding.");
  }
  const db = await requireMongoDb();
  const organizations = db.collection("organizations");
  const organization = await organizations.findOne({ slug: "nexcore" });
  if (!organization) throw new Error('Organization with slug "nexcore" was not found.');

  const existing = await db.collection("users").findOne({
    organizationId: organization._id,
    demoSeed: DEMO_MARKER,
  });
  if (existing) {
    console.log(`NEXCORE demo data already exists (${DEMO_MARKER}); no changes made.`);
    return;
  }

  const now = new Date();
  const userSpecs = [
    ["demo.admin@nexcore.test", "Demo Admin", "admin"],
    ["demo.manager@nexcore.test", "Demo Manager", "manager"],
    ["demo.finance@nexcore.test", "Demo Finance", "finance"],
    ["demo.ava@nexcore.test", "Ava Morgan", "consultant"],
    ["demo.liam@nexcore.test", "Liam Patel", "consultant"],
    ["demo.sofia@nexcore.test", "Sofia Williams", "consultant"],
    ["demo.pending@nexcore.test", "Jordan Lee", "consultant"],
  ] as const;
  const users = new Map<string, ObjectId>();

  for (const [email, name, role] of userSpecs) {
    const id = new ObjectId();
    const { hash, salt } = hashPassword(demoPassword);
    await db.collection("users").insertOne({
      _id: id,
      openId: `demo_${id.toHexString()}`,
      name,
      email: normalizeEmail(email),
      passwordHash: hash,
      passwordSalt: salt,
      status: "active",
      loginMethod: "password",
      role,
      organizationId: organization._id,
      membershipStatus: email.includes("pending") ? "pending" : "active",
      consultantId: null,
      demoSeed: DEMO_MARKER,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    });
    users.set(email, id);
  }

  const adminId = users.get("demo.admin@nexcore.test")!;
  const managerId = users.get("demo.manager@nexcore.test")!;
  const financeId = users.get("demo.finance@nexcore.test")!;
  const consultantUsers = [
    ["demo.ava@nexcore.test", "Ava", "Morgan", "Digital Transformation", "Active", 40, 165, "USD"],
    ["demo.liam@nexcore.test", "Liam", "Patel", "Data & Analytics", "Active", 40, 145, "USD"],
    ["demo.sofia@nexcore.test", "Sofia", "Williams", "Change Management", "On leave", 32, 135, "EUR"],
  ] as const;
  const consultants = new Map<string, ObjectId>();

  for (const [email, firstName, lastName, role, employmentStatus, weeklyCapacityHours, billingRate, currency] of consultantUsers) {
    const id = new ObjectId();
    consultants.set(email, id);
    await db.collection("consultants").insertOne({
      _id: id,
      organizationId: organization._id,
      employeeCode: `DEMO-${firstName.slice(0, 2).toUpperCase()}`,
      firstName,
      lastName,
      email,
      role,
      department: role,
      employmentStatus,
      weeklyCapacityHours,
      billingRate,
      currency,
      startDate: "2025-01-15",
      createdAt: now,
      updatedAt: now,
      demoSeed: DEMO_MARKER,
    });
    await db.collection("users").updateOne(
      { _id: users.get(email) },
      { $set: { consultantId: id } },
    );
  }

  const clientSpecs = [
    ["DEMO-ACME", "Acme Retail Group", "Active", "USD"],
    ["DEMO-NOVA", "Nova Health Systems", "Active", "EUR"],
    ["DEMO-GREEN", "Greenline Energy", "Active", "GBP"],
    ["DEMO-ORBIT", "Orbit Financial", "Inactive", "USD"],
  ] as const;
  const clients = new Map<string, ObjectId>();
  for (const [clientCode, name, status, defaultCurrency] of clientSpecs) {
    const id = new ObjectId();
    clients.set(clientCode, id);
    await db.collection("clients").insertOne({
      _id: id,
      organizationId: organization._id,
      clientCode,
      name,
      status,
      defaultCurrency,
      createdAt: now,
      updatedAt: now,
      demoSeed: DEMO_MARKER,
    });
  }

  const projectSpecs = [
    ["DEMO-ACME", "ERP Modernization", "Active", "USD", "2025-01-01", "2026-12-31"],
    ["DEMO-ACME", "Operating Model Design", "On hold", "USD", "2025-04-01", "2026-09-30"],
    ["DEMO-NOVA", "Clinical Data Platform", "Active", "EUR", "2025-02-01", "2026-12-31"],
    ["DEMO-GREEN", "Sustainability Reporting", "Active", "GBP", "2025-06-01", "2026-11-30"],
    ["DEMO-ORBIT", "Finance Transformation", "Closed", "USD", "2024-01-01", "2025-12-31"],
  ] as const;
  const projects = new Map<string, ObjectId>();
  for (const [clientCode, name, status, billingCurrency, startDate, endDate] of projectSpecs) {
    const id = new ObjectId();
    projects.set(name, id);
    await db.collection("projects").insertOne({
      _id: id,
      organizationId: organization._id,
      clientId: clients.get(clientCode)!,
      name,
      status,
      billingCurrency,
      startDate,
      endDate,
      createdAt: now,
      updatedAt: now,
      demoSeed: DEMO_MARKER,
    });
  }

  const consultantIds = [...consultants.values()];
  const projectIds = [...projects.values()];
  const entries = [
    [consultantIds[0], clients.get("DEMO-ACME")!, projectIds[0], "ERP discovery workshop", 8, "Approved", "Billable", 165, "USD", "2026-10-06", managerId],
    [consultantIds[0], clients.get("DEMO-NOVA")!, projectIds[2], "Data governance assessment", 7.5, "Approved", "Billable", 165, "EUR", "2026-10-07", managerId],
    [consultantIds[1], clients.get("DEMO-ACME")!, projectIds[0], "Integration architecture", 6, "Submitted", "Billable", 145, "USD", "2026-10-08", null],
    [consultantIds[1], clients.get("DEMO-GREEN")!, projectIds[3], "Reporting requirements", 5, "Draft", "Non-billable", null, null, "2026-10-09", null],
    [consultantIds[2], clients.get("DEMO-NOVA")!, projectIds[2], "Change readiness interviews", 6, "Rejected", "Billable", 135, "EUR", "2026-10-10", managerId],
    [consultantIds[0], clients.get("DEMO-GREEN")!, projectIds[3], "Executive steering committee", 4, "Approved", "Billable", 165, "GBP", "2026-10-13", financeId],
  ] as const;

  for (const [consultantId, clientId, projectId, description, hours, status, billingClassification, billingRateSnapshot, currency, workDate, reviewer] of entries) {
    const id = new ObjectId();
    const submittedAt = status === "Draft" ? null : new Date(`${workDate}T17:00:00Z`);
    const reviewedAt = status === "Approved" || status === "Rejected" ? new Date(`${workDate}T18:00:00Z`) : null;
    await db.collection("timeEntries").insertOne({
      _id: id,
      organizationId: organization._id,
      consultantId,
      clientId,
      projectId,
      workDate,
      description,
      hours,
      billingClassification,
      status,
      billingRateSnapshot,
      currency,
      createdBy: users.get("demo.ava@nexcore.test")!,
      createdAt: now,
      updatedAt: now,
      submittedAt,
      reviewedAt,
      reviewedBy: reviewer,
      rejectionReason: status === "Rejected" ? "Please add the client workshop outcome before resubmitting." : null,
      demoSeed: DEMO_MARKER,
    });
    if (status !== "Draft") {
      await db.collection("approvalHistory").insertOne({
        _id: new ObjectId(),
        organizationId: organization._id,
        timeEntryId: id,
        previousStatus: "Draft",
        newStatus: status,
        actedBy: reviewer ?? managerId,
        rejectionReason: status === "Rejected" ? "Please add the client workshop outcome before resubmitting." : null,
        createdAt: reviewedAt ?? now,
        demoSeed: DEMO_MARKER,
      });
    }
  }

  const retainers = [
    ["Acme ERP Advisory", clients.get("DEMO-ACME")!, projectIds[0], "HOURS", 240, null, "USD", "QUARTERLY", "2026-01-01", "2026-12-31", "ACTIVE"],
    ["Nova Platform Support", clients.get("DEMO-NOVA")!, projectIds[2], "AMOUNT", null, 85000, "EUR", "ANNUALLY", "2026-01-01", "2026-12-31", "ACTIVE"],
    ["Greenline Discovery", clients.get("DEMO-GREEN")!, projectIds[3], "HOURS", 80, null, "GBP", "MONTHLY", "2026-10-01", "2026-12-31", "DRAFT"],
  ] as const;
  for (const [name, clientId, projectId, type, contractedHours, contractedAmount, currency, billingFrequency, startDate, endDate, status] of retainers) {
    await db.collection("retainers").insertOne({
      _id: new ObjectId(),
      organizationId: organization._id,
      clientId,
      projectId,
      name,
      type,
      contractedHours,
      contractedAmount,
      currency,
      billingFrequency,
      startDate,
      endDate,
      rolloverAllowed: true,
      alertThresholdPercent: 80,
      status,
      createdBy: adminId,
      createdAt: now,
      updatedAt: now,
      demoSeed: DEMO_MARKER,
    });
  }

  const pendingRequestId = new ObjectId();
  const pendingUserId = users.get("demo.pending@nexcore.test")!;
  await db.collection("organizationJoinRequests").insertOne({
    _id: pendingRequestId,
    organizationId: organization._id,
    userId: pendingUserId,
    userName: "Jordan Lee",
    userEmail: "demo.pending@nexcore.test",
    requestedRole: "consultant",
    status: "PENDING",
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    demoSeed: DEMO_MARKER,
  });
  await db.collection("notifications").insertOne({
    _id: new ObjectId(),
    recipientUserId: adminId,
    organizationId: organization._id,
    type: "JOIN_REQUEST_SUBMITTED",
    title: "New demo join request",
    message: "Jordan Lee requested access to NEXCORE as a consultant.",
    relatedRequestId: pendingRequestId,
    read: false,
    createdAt: now,
    readAt: null,
    demoSeed: DEMO_MARKER,
  });

  console.log("NEXCORE demo data created successfully.");
  console.log("Demo users: demo.admin@nexcore.test, demo.manager@nexcore.test, demo.finance@nexcore.test, demo.ava@nexcore.test, demo.liam@nexcore.test, demo.sofia@nexcore.test");
  console.log("Created: 7 users, 3 consultants, 4 clients, 5 projects, 6 time entries, 3 retainers, 1 pending join request, 1 notification.");
}

seedNexcoreDemo().catch((error) => {
  console.error("NEXCORE demo seed failed:", error);
  process.exitCode = 1;
});
