import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { requireMongoDb, collection, type TimeEntryDocument } from "./mongo";
import * as erp from "./erpDb";
import type { User } from "./types";

describe("consultant time-entry reference choices", () => {
  const dbPromise = requireMongoDb();
  const organizationId = new ObjectId().toHexString();
  const admin: User = { id: new ObjectId().toHexString(), openId: "reference-admin", name: "Reference Admin", email: "reference-admin@test.invalid", loginMethod: "test", role: "admin", organizationId, membershipStatus: "active", consultantId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  let consultant: { id: string; email: string } | undefined;
  let client: { id: string } | undefined;
  let project: { id: string } | undefined;
  let consultantId: string | undefined;
  let entryId: string | undefined;

  afterAll(async () => {
    const db = await dbPromise;
    if (entryId) await collection<TimeEntryDocument>(db, "timeEntries").deleteOne({ _id: new ObjectId(entryId) });
    if (consultant) await collection(db, "consultants").deleteOne({ _id: new ObjectId(consultant.id) });
    if (project) await collection(db, "projects").deleteOne({ _id: new ObjectId(project.id) });
    if (client) await collection(db, "clients").deleteOne({ _id: new ObjectId(client.id) });
  });

  it("returns client and project metadata only alongside the consultant's own entry list", async () => {
    client = await erp.createClient({ clientCode: `REF-${Date.now()}`, name: "History Scoped Client", status: "Active", defaultCurrency: "USD" }, admin);
    project = await erp.createProject({ clientId: client.id, name: "History Scoped Project", status: "Active", billingCurrency: "USD" }, admin);
    consultant = await erp.createConsultant({ employeeCode: `REF-${Date.now()}`, firstName: "History", lastName: "Consultant", email: `history-${Date.now()}@test.invalid`, role: "Consultant", department: "Delivery", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 200, currency: "USD", startDate: "2026-01-01" }, admin);
    consultantId = consultant.id;
    const actor: User = { id: new ObjectId().toHexString(), openId: "history-consultant", name: "History Consultant", email: consultant.email, loginMethod: "test", role: "consultant", organizationId, membershipStatus: "active", consultantId, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

    const created = await erp.createTimeEntry({ consultantId, clientId: client.id, projectId: project.id, workDate: "2026-11-07", description: "Historical reference source", hours: 1, billingClassification: "Non-billable" }, actor);
    entryId = created.id;
    const result = await erp.listTimeEntries({ page: 1, pageSize: 100 }, actor);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      clientId: client.id,
      projectId: project.id,
      billingRateSnapshot: null,
      clientReference: { id: client.id, name: "History Scoped Client", status: "Active", defaultCurrency: "USD" },
      projectReference: { id: project.id, clientId: client.id, name: "History Scoped Project", status: "Active", billingCurrency: "USD" },
    });
  });
});
