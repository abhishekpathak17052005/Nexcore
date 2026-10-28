import { TRPCError } from "@trpc/server";
import { ObjectId, type Filter } from "mongodb";
import { collection, getMongoClient, requireMongoDb, objectId, type ApprovalHistoryDocument, type ClientDocument, type ConsultantDocument, type ProjectDocument, type TimeEntryDocument } from "./mongo";
import { assertNotSelfApproval, assertRecordScope, assertOrganizationScope, hasPermission } from "./authorization";
import type { User } from "./types";

export type { BillingClassification, CurrencyCode, EmploymentStatus, TimeEntryStatus } from "./mongo";
import type { BillingClassification, CurrencyCode, EmploymentStatus, TimeEntryStatus } from "./mongo";

const transitions: Record<TimeEntryStatus, TimeEntryStatus[]> = { Draft: ["Submitted"], Submitted: ["Approved", "Rejected"], Approved: [], Rejected: ["Draft"] };

function recordId(value: string) { try { return objectId(value); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "A valid record id is required." }); } }
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()); }
function trim(value: string) { return value.trim(); }
function id(value: ObjectId) { return value.toHexString(); }
function date(value: Date | null | undefined) { return value?.toISOString() ?? null; }
function toConsultant(row: ConsultantDocument) { const capacity = Number(row.weeklyCapacityHours); return { id: id(row._id), employeeCode: row.employeeCode, firstName: row.firstName, lastName: row.lastName, email: row.email, name: `${row.firstName} ${row.lastName}`, initials: `${row.firstName[0] ?? "?"}${row.lastName[0] ?? "?"}`.toUpperCase(), role: row.role, department: row.department, employmentStatus: row.employmentStatus, weeklyCapacityHours: capacity, billingRate: Number(row.billingRate), currency: row.currency, startDate: row.startDate, assignedProjects: [], createdAt: date(row.createdAt) ?? "", updatedAt: date(row.updatedAt) ?? "", availableHours: capacity * 4, billableHours: 0, nonBillableHours: 0, utilization: 0, revenue: 0, status: "Watch" as const, color: "#0F9D91" }; }
function toClient(row: ClientDocument) { return { id: id(row._id), clientCode: row.clientCode, name: row.name, status: row.status, defaultCurrency: row.defaultCurrency, createdAt: date(row.createdAt) ?? "", updatedAt: date(row.updatedAt) ?? "" }; }
function toProject(row: ProjectDocument) { return { id: id(row._id), clientId: id(row.clientId), name: row.name, status: row.status, billingCurrency: row.billingCurrency, startDate: row.startDate, endDate: row.endDate, createdAt: date(row.createdAt) ?? "", updatedAt: date(row.updatedAt) ?? "" }; }
function assertEntryScope(actor: User, row: TimeEntryDocument) {
  assertRecordScope(actor, id(row.consultantId));
  assertOrganizationScope(actor, row.organizationId ? id(row.organizationId) : null);
}

function orgFilter(actor?: User): Filter<any> {
  if (actor?.organizationId) {
    return { organizationId: recordId(actor.organizationId) };
  }
  return {};
}

function consultantScope(actor: User): Filter<ConsultantDocument> {
  if (actor.role !== "consultant") return {};
  if (!actor.consultantId) throw new TRPCError({ code: "FORBIDDEN", message: "Your account is not assigned to a consultant record." });
  return { _id: recordId(actor.consultantId) };
}

function assertReferenceScope(actor: User) {
  if (actor.role === "consultant") throw new TRPCError({ code: "FORBIDDEN", message: "Your account is not assigned to a project scope." });
}

function toTimeEntry(row: TimeEntryDocument) { return { id: id(row._id), consultantId: id(row.consultantId), clientId: id(row.clientId), projectId: id(row.projectId), workDate: row.workDate, description: row.description, hours: Number(row.hours), billingClassification: row.billingClassification, status: row.status, billingRateSnapshot: row.billingRateSnapshot == null ? null : Number(row.billingRateSnapshot), currency: row.currency, createdAt: date(row.createdAt) ?? "", updatedAt: date(row.updatedAt) ?? "", submittedAt: date(row.submittedAt), reviewedAt: date(row.reviewedAt), reviewedBy: row.reviewedBy ? id(row.reviewedBy) : null, rejectionReason: row.rejectionReason }; }

export interface ConsultantInput { employeeCode: string; firstName: string; lastName: string; email: string; role: string; department: string; employmentStatus: EmploymentStatus; weeklyCapacityHours: number; billingRate: number; currency: CurrencyCode; startDate: string; }
export interface ClientInput { clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode; }
export interface ProjectInput { clientId: string; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate?: string | null; endDate?: string | null; }
export interface TimeEntryInput { consultantId: string; clientId: string; projectId: string; workDate: string; description: string; hours: number; billingClassification: BillingClassification; billingRate?: number | null; currency?: CurrencyCode | null; }

function validateConsultant(input: ConsultantInput) { if (!trim(input.employeeCode) || !trim(input.firstName) || !trim(input.lastName) || !trim(input.email) || !trim(input.role) || !trim(input.department)) throw new TRPCError({ code: "BAD_REQUEST", message: "Consultant identity and organizational fields are required." }); if (!Number.isFinite(input.weeklyCapacityHours) || input.weeklyCapacityHours <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Weekly capacity must be greater than zero." }); if (!Number.isFinite(input.billingRate) || input.billingRate < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Billing rate must be non-negative." }); if (!validDate(input.startDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must be valid." }); }
function validateEntry(input: TimeEntryInput) { if (!validDate(input.workDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "Work date must be valid." }); if (!trim(input.description)) throw new TRPCError({ code: "BAD_REQUEST", message: "Description is required." }); if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) throw new TRPCError({ code: "BAD_REQUEST", message: "Hours must be greater than zero and no more than 24 per entry." }); if (input.billingRate != null && (!Number.isFinite(input.billingRate) || input.billingRate < 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Billing rate must be non-negative." }); }
function mongoError(error: unknown, fallback: string): never { if (error instanceof TRPCError) throw error; const message = String(error); if (message.includes("E11000")) throw new TRPCError({ code: "CONFLICT", message: "The record conflicts with an existing unique business record." }); throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: fallback }); }

export async function listConsultants(actor: User) { const db = await requireMongoDb(); return (await collection<ConsultantDocument>(db, "consultants").find({ ...consultantScope(actor), ...orgFilter(actor) }).sort({ lastName: 1, firstName: 1 }).toArray()).map(toConsultant); }
export async function getConsultant(value: string, actor: User) { const db = await requireMongoDb(); const row = await collection<ConsultantDocument>(db, "consultants").findOne({ _id: recordId(value) }); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Consultant not found." }); assertRecordScope(actor, value); assertOrganizationScope(actor, row.organizationId ? id(row.organizationId) : null); return toConsultant(row); }
export async function createConsultant(input: ConsultantInput, actor?: User) { validateConsultant(input); const db = await requireMongoDb(); const now = new Date(); const orgId = actor?.organizationId ? recordId(actor.organizationId) : null; try { const result = await collection<ConsultantDocument>(db, "consultants").insertOne({ _id: new ObjectId(), organizationId: orgId, ...input, employeeCode: trim(input.employeeCode), firstName: trim(input.firstName), lastName: trim(input.lastName), email: trim(input.email), role: trim(input.role), department: trim(input.department), createdAt: now, updatedAt: now }); return getConsultant(id(result.insertedId), actor ?? ({ role: "admin", consultantId: null } as User)); } catch (error) { return mongoError(error, "Consultant could not be created."); } }
export async function updateConsultant(value: string, input: ConsultantInput, actor?: User) { validateConsultant(input); const db = await requireMongoDb(); const key = recordId(value); const current = await collection<ConsultantDocument>(db, "consultants").findOne({ _id: key }); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Consultant not found." }); if (actor) assertOrganizationScope(actor, current.organizationId ? id(current.organizationId) : null); try { const result = await collection<ConsultantDocument>(db, "consultants").updateOne({ _id: key }, { $set: { ...input, employeeCode: trim(input.employeeCode), firstName: trim(input.firstName), lastName: trim(input.lastName), email: trim(input.email), role: trim(input.role), department: trim(input.department), updatedAt: new Date() } }); if (!result.matchedCount) throw new TRPCError({ code: "NOT_FOUND", message: "Consultant not found." }); return getConsultant(value, actor ?? ({ role: "admin", consultantId: null } as User)); } catch (error) { return mongoError(error, "Consultant could not be updated."); } }
export async function deactivateConsultant(value: string, actor?: User) { const db = await requireMongoDb(); const key = recordId(value); const current = await collection<ConsultantDocument>(db, "consultants").findOne({ _id: key }); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Consultant not found." }); if (actor) assertOrganizationScope(actor, current.organizationId ? id(current.organizationId) : null); const result = await collection<ConsultantDocument>(db, "consultants").updateOne({ _id: key }, { $set: { employmentStatus: "Inactive", updatedAt: new Date() } }); if (!result.matchedCount) throw new TRPCError({ code: "NOT_FOUND", message: "Consultant not found." }); return getConsultant(value, actor ?? ({ role: "admin", consultantId: null } as User)); }

export async function listClients(actor: User) { assertReferenceScope(actor); const db = await requireMongoDb(); return (await collection<ClientDocument>(db, "clients").find({ ...orgFilter(actor) }).sort({ name: 1 }).toArray()).map(toClient); }
export async function getClient(value: string, actor: User) { assertReferenceScope(actor); const db = await requireMongoDb(); const row = await collection<ClientDocument>(db, "clients").findOne({ _id: recordId(value) }); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." }); assertOrganizationScope(actor, row.organizationId ? id(row.organizationId) : null); return toClient(row); }
export async function createClient(input: ClientInput, actor?: User) { if (!trim(input.clientCode) || !trim(input.name)) throw new TRPCError({ code: "BAD_REQUEST", message: "Client code and name are required." }); const db = await requireMongoDb(); const now = new Date(); const orgId = actor?.organizationId ? recordId(actor.organizationId) : null; try { const result = await collection<ClientDocument>(db, "clients").insertOne({ _id: new ObjectId(), organizationId: orgId, ...input, clientCode: trim(input.clientCode), name: trim(input.name), createdAt: now, updatedAt: now }); return getClient(id(result.insertedId), actor ?? ({ role: "admin", consultantId: null } as User)); } catch (error) { return mongoError(error, "Client could not be created."); } }
export async function updateClient(value: string, input: ClientInput, actor?: User) { if (!trim(input.clientCode) || !trim(input.name)) throw new TRPCError({ code: "BAD_REQUEST", message: "Client code and name are required." }); const db = await requireMongoDb(); const key = recordId(value); const current = await collection<ClientDocument>(db, "clients").findOne({ _id: key }); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." }); if (actor) assertOrganizationScope(actor, current.organizationId ? id(current.organizationId) : null); try { const result = await collection<ClientDocument>(db, "clients").updateOne({ _id: key }, { $set: { ...input, clientCode: trim(input.clientCode), name: trim(input.name), updatedAt: new Date() } }); if (!result.matchedCount) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found." }); return getClient(value, actor ?? ({ role: "admin", consultantId: null } as User)); } catch (error) { return mongoError(error, "Client could not be updated."); } }

export async function listProjects(actor: User) { assertReferenceScope(actor); const db = await requireMongoDb(); return (await collection<ProjectDocument>(db, "projects").find({ ...orgFilter(actor) }).sort({ name: 1 }).toArray()).map(toProject); }
export async function getProject(value: string, actor: User) { assertReferenceScope(actor); const db = await requireMongoDb(); const row = await collection<ProjectDocument>(db, "projects").findOne({ _id: recordId(value) }); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." }); assertOrganizationScope(actor, row.organizationId ? id(row.organizationId) : null); return toProject(row); }
function validateProject(input: ProjectInput) { if (!trim(input.name)) throw new TRPCError({ code: "BAD_REQUEST", message: "Project name is required." }); if (input.startDate && !validDate(input.startDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "Project start date must be valid." }); if (input.endDate && !validDate(input.endDate)) throw new TRPCError({ code: "BAD_REQUEST", message: "Project end date must be valid." }); }
async function assertProjectClient(db: Awaited<ReturnType<typeof requireMongoDb>>, input: ProjectInput) { const client = await collection<ClientDocument>(db, "clients").findOne({ _id: recordId(input.clientId) }); if (!client) throw new TRPCError({ code: "BAD_REQUEST", message: "Project client does not exist." }); return client; }
export async function createProject(input: ProjectInput, actor?: User) { validateProject(input); const db = await requireMongoDb(); await assertProjectClient(db, input); const now = new Date(); const orgId = actor?.organizationId ? recordId(actor.organizationId) : null; try { const result = await collection<ProjectDocument>(db, "projects").insertOne({ _id: new ObjectId(), organizationId: orgId, ...input, clientId: recordId(input.clientId), name: trim(input.name), startDate: input.startDate ?? null, endDate: input.endDate ?? null, createdAt: now, updatedAt: now }); return getProject(id(result.insertedId), actor ?? ({ role: "admin", consultantId: null } as User)); } catch (error) { return mongoError(error, "Project could not be created."); } }
export async function updateProject(value: string, input: ProjectInput, actor?: User) { validateProject(input); const db = await requireMongoDb(); await assertProjectClient(db, input); const key = recordId(value); const current = await collection<ProjectDocument>(db, "projects").findOne({ _id: key }); if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." }); if (actor) assertOrganizationScope(actor, current.organizationId ? id(current.organizationId) : null); try { const result = await collection<ProjectDocument>(db, "projects").updateOne({ _id: key }, { $set: { ...input, clientId: recordId(input.clientId), name: trim(input.name), startDate: input.startDate ?? null, endDate: input.endDate ?? null, updatedAt: new Date() } }); if (!result.matchedCount) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found." }); return getProject(value, actor ?? ({ role: "admin", consultantId: null } as User)); } catch (error) { return mongoError(error, "Project could not be updated."); } }

async function resolveContext(db: Awaited<ReturnType<typeof requireMongoDb>>, input: TimeEntryInput) { const consultantId = recordId(input.consultantId); const clientId = recordId(input.clientId); const projectId = recordId(input.projectId); const [consultant, client, project] = await Promise.all([collection<ConsultantDocument>(db, "consultants").findOne({ _id: consultantId }), collection<ClientDocument>(db, "clients").findOne({ _id: clientId }), collection<ProjectDocument>(db, "projects").findOne({ _id: projectId })]); if (!consultant || !client || !project) throw new TRPCError({ code: "BAD_REQUEST", message: "Consultant, client, and project relationships must be valid." }); if (!project.clientId.equals(clientId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Project must belong to the selected client." }); return { consultantId, clientId, projectId, consultant, client, project }; }
function duplicateFilter(input: TimeEntryInput, exclude?: ObjectId): Filter<TimeEntryDocument> { return { ...(exclude ? { _id: { $ne: exclude } } : {}), consultantId: recordId(input.consultantId), clientId: recordId(input.clientId), projectId: recordId(input.projectId), workDate: input.workDate, description: trim(input.description), hours: input.hours, billingClassification: input.billingClassification }; }

export async function listTimeEntries(input: { consultantId?: string; clientId?: string; projectId?: string; billingClassification?: BillingClassification; status?: TimeEntryStatus; from?: string; to?: string; query?: string; page: number; pageSize: number }, actor: User) { const db = await requireMongoDb(); const filter: Filter<TimeEntryDocument> = { ...orgFilter(actor) }; if (input.consultantId) { assertRecordScope(actor, input.consultantId); filter.consultantId = recordId(input.consultantId); } else if (actor.role === "consultant") { if (!actor.consultantId) throw new TRPCError({ code: "FORBIDDEN", message: "Your account is not assigned to a consultant record." }); filter.consultantId = recordId(actor.consultantId); } if (input.clientId) filter.clientId = recordId(input.clientId); if (input.projectId) filter.projectId = recordId(input.projectId); if (input.billingClassification) filter.billingClassification = input.billingClassification; if (input.status) filter.status = input.status; if (input.from || input.to) filter.workDate = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lte: input.to } : {}) }; if (input.query?.trim()) filter.description = { $regex: input.query.trim(), $options: "i" }; const entries = collection<TimeEntryDocument>(db, "timeEntries"); const [rows, total] = await Promise.all([entries.find(filter).sort({ workDate: -1, _id: -1 }).skip((input.page - 1) * input.pageSize).limit(input.pageSize).toArray(), entries.countDocuments(filter)]); return { items: rows.map(toTimeEntry), total, page: input.page, pageSize: input.pageSize }; }
export async function getTimeEntry(value: string, actor: User) { const db = await requireMongoDb(); const row = await collection<TimeEntryDocument>(db, "timeEntries").findOne({ _id: recordId(value) }); if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found." }); assertEntryScope(actor, row); return toTimeEntry(row); }

export async function createTimeEntry(input: TimeEntryInput, actor: User) {
  validateEntry(input);
  assertRecordScope(actor, input.consultantId);
  const db = await requireMongoDb();
  const context = await resolveContext(db, input);
  const currency = input.billingClassification === "Billable" ? input.currency ?? context.project.billingCurrency : null;
  const isPrivileged = hasPermission(actor.role, "consultants.manage") || hasPermission(actor.role, "metrics.financial");
  const rate = input.billingClassification === "Billable"
    ? (isPrivileged && input.billingRate != null ? input.billingRate : context.consultant.billingRate)
    : null;
  if (input.billingClassification === "Billable" && currency !== context.project.billingCurrency) throw new TRPCError({ code: "BAD_REQUEST", message: "Currency must match the project's billing currency." });
  if (await collection<TimeEntryDocument>(db, "timeEntries").findOne(duplicateFilter(input))) throw new TRPCError({ code: "CONFLICT", message: "An identical time entry already exists." });
  const now = new Date();
  try {
    const result = await collection<TimeEntryDocument>(db, "timeEntries").insertOne({
      _id: new ObjectId(),
      organizationId: actor.organizationId ? recordId(actor.organizationId) : null,
      consultantId: context.consultantId,
      clientId: context.clientId,
      projectId: context.projectId,
      workDate: input.workDate,
      description: trim(input.description),
      hours: input.hours,
      billingClassification: input.billingClassification,
      status: "Draft",
      billingRateSnapshot: rate,
      currency,
      createdBy: recordId(actor.id),
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    });
    return getTimeEntry(id(result.insertedId), actor);
  } catch (error) {
    return mongoError(error, "Time entry could not be created.");
  }
}

export async function updateTimeEntry(value: string, input: TimeEntryInput, actor: User) {
  validateEntry(input);
  assertRecordScope(actor, input.consultantId);
  const db = await requireMongoDb();
  const key = recordId(value);
  const current = await collection<TimeEntryDocument>(db, "timeEntries").findOne({ _id: key });
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found." });
  assertEntryScope(actor, current);
  if (current.status !== "Draft" && current.status !== "Rejected") throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft or rejected time entries can be edited." });
  const context = await resolveContext(db, input);
  if (await collection<TimeEntryDocument>(db, "timeEntries").findOne(duplicateFilter(input, key))) throw new TRPCError({ code: "CONFLICT", message: "An identical time entry already exists." });
  const currency = input.billingClassification === "Billable" ? current.currency ?? input.currency ?? context.project.billingCurrency : null;
  const isPrivileged = hasPermission(actor.role, "consultants.manage") || hasPermission(actor.role, "metrics.financial");
  const rate = input.billingClassification === "Billable"
    ? current.billingRateSnapshot ?? (isPrivileged && input.billingRate != null ? input.billingRate : context.consultant.billingRate)
    : null;
  if (input.billingClassification === "Billable" && currency !== context.project.billingCurrency) throw new TRPCError({ code: "BAD_REQUEST", message: "Currency must match the project's billing currency." });
  await collection<TimeEntryDocument>(db, "timeEntries").updateOne(
    { _id: key, status: current.status },
    {
      $set: {
        consultantId: context.consultantId,
        clientId: context.clientId,
        projectId: context.projectId,
        workDate: input.workDate,
        description: trim(input.description),
        hours: input.hours,
        billingClassification: input.billingClassification,
        billingRateSnapshot: rate,
        currency,
        updatedAt: new Date(),
      },
    }
  );
  return getTimeEntry(value, actor);
}

let isReplicaSetDeployment: boolean | null = null;
async function checkReplicaSet(mongoClient: { db: () => { admin: () => { serverStatus: () => Promise<{ repl?: unknown }> } } }): Promise<boolean> {
  if (isReplicaSetDeployment !== null) return isReplicaSetDeployment;
  try {
    const admin = mongoClient.db().admin();
    const status = await admin.serverStatus();
    isReplicaSetDeployment = Boolean(status.repl);
  } catch {
    isReplicaSetDeployment = false;
  }
  return isReplicaSetDeployment;
}

export async function transitionTimeEntry(value: string, nextStatus: TimeEntryStatus, actor: User, rejectionReason?: string) {
  const db = await requireMongoDb();
  const mongoClient = await getMongoClient();
  if (!mongoClient) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "MongoDB is required for atomic approval history." });
  const key = recordId(value);
  const actorId = recordId(actor.id);
  const useReplicaSetTransactions = await checkReplicaSet(mongoClient);

  if (!useReplicaSetTransactions && (process.env.REQUIRE_REPLICA_SET_TRANSACTIONS === "true" || (process.env.NODE_ENV === "production" && process.env.ALLOW_STANDALONE_IN_PROD !== "true"))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Production deployment requires a MongoDB replica set for multi-document transaction atomicity.",
    });
  }

  if (useReplicaSetTransactions) {
    const session = mongoClient.startSession();
    try {
      let output: ReturnType<typeof toTimeEntry> | null = null;
      await session.withTransaction(async () => {
        const entries = collection<TimeEntryDocument>(db, "timeEntries");
        const current = await entries.findOne({ _id: key }, { session });
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found." });
        assertEntryScope(actor, current);
        if (nextStatus === "Approved" || nextStatus === "Rejected") {
          if (actor.id === current.createdBy.toHexString()) {
            assertNotSelfApproval(actor, current.createdBy.toHexString());
          }
          if (actor.consultantId && current.consultantId && actor.consultantId === current.consultantId.toHexString()) {
            throw new TRPCError({ code: "FORBIDDEN", message: "You cannot approve or reject your own time entry." });
          }
        }
        if (!transitions[current.status].includes(nextStatus)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot move an entry from ${current.status} to ${nextStatus}.` });
        }
        if (nextStatus === "Rejected" && !rejectionReason?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A rejection reason is required." });
        }
        const now = new Date();
        const updateResult = await entries.updateOne(
          { _id: key, status: current.status },
          {
            $set: {
              status: nextStatus,
              updatedAt: now,
              submittedAt: nextStatus === "Submitted" ? now : nextStatus === "Draft" ? null : current.submittedAt,
              reviewedAt: nextStatus === "Approved" || nextStatus === "Rejected" ? now : nextStatus === "Draft" ? null : current.reviewedAt,
              reviewedBy: nextStatus === "Approved" || nextStatus === "Rejected" ? actorId : nextStatus === "Draft" ? null : current.reviewedBy,
              rejectionReason: nextStatus === "Rejected" ? trim(rejectionReason ?? "") : nextStatus === "Draft" ? null : current.rejectionReason,
            },
          },
          { session }
        );
        if (updateResult.matchedCount === 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Concurrent modification detected. The time entry status has changed." });
        }
        await collection<ApprovalHistoryDocument>(db, "timeEntryApprovalHistory").insertOne(
          {
            _id: new ObjectId(),
            timeEntryId: key,
            previousStatus: current.status,
            newStatus: nextStatus,
            actedBy: actorId,
            rejectionReason: nextStatus === "Rejected" ? trim(rejectionReason ?? "") : null,
            createdAt: now,
          },
          { session }
        );
        const updated = await entries.findOne({ _id: key }, { session });
        output = updated ? toTimeEntry(updated) : null;
      });
      if (!output) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Approval transition did not return the updated record." });
      return output;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      return mongoError(error, "Approval transition failed and was rolled back.");
    } finally {
      await session.endSession();
    }
  } else {
    // Standalone deployment with optimistic locking and compensating rollback
    const entries = collection<TimeEntryDocument>(db, "timeEntries");
    const current = await entries.findOne({ _id: key });
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found." });
    assertEntryScope(actor, current);
    if (nextStatus === "Approved" || nextStatus === "Rejected") {
      if (actor.id === current.createdBy.toHexString()) {
        assertNotSelfApproval(actor, current.createdBy.toHexString());
      }
      if (actor.consultantId && current.consultantId && actor.consultantId === current.consultantId.toHexString()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You cannot approve or reject your own time entry." });
      }
    }
    if (!transitions[current.status].includes(nextStatus)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot move an entry from ${current.status} to ${nextStatus}.` });
    }
    if (nextStatus === "Rejected" && !rejectionReason?.trim()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A rejection reason is required." });
    }
    const now = new Date();
    const updateResult = await entries.updateOne(
      { _id: key, status: current.status },
      {
        $set: {
          status: nextStatus,
          updatedAt: now,
          submittedAt: nextStatus === "Submitted" ? now : nextStatus === "Draft" ? null : current.submittedAt,
          reviewedAt: nextStatus === "Approved" || nextStatus === "Rejected" ? now : nextStatus === "Draft" ? null : current.reviewedAt,
          reviewedBy: nextStatus === "Approved" || nextStatus === "Rejected" ? actorId : nextStatus === "Draft" ? null : current.reviewedBy,
          rejectionReason: nextStatus === "Rejected" ? trim(rejectionReason ?? "") : nextStatus === "Draft" ? null : current.rejectionReason,
        },
      }
    );
    if (updateResult.matchedCount === 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Concurrent modification detected. The time entry status has changed." });
    }

    try {
      await collection<ApprovalHistoryDocument>(db, "timeEntryApprovalHistory").insertOne({
        _id: new ObjectId(),
        timeEntryId: key,
        previousStatus: current.status,
        newStatus: nextStatus,
        actedBy: actorId,
        rejectionReason: nextStatus === "Rejected" ? trim(rejectionReason ?? "") : null,
        createdAt: now,
      });
    } catch (auditError) {
      // Compensating rollback for standalone mode: restore original status and timestamp
      await entries.updateOne(
        { _id: key, status: nextStatus },
        {
          $set: {
            status: current.status,
            updatedAt: current.updatedAt,
            submittedAt: current.submittedAt,
            reviewedAt: current.reviewedAt,
            reviewedBy: current.reviewedBy,
            rejectionReason: current.rejectionReason,
          },
        }
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Audit history write failed. State transition was rolled back.",
        cause: auditError,
      });
    }

    const updated = await entries.findOne({ _id: key });
    if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Approval transition did not return the updated record." });
    return toTimeEntry(updated);
  }
}

export async function timeEntryMetrics(
  input: { from?: string; to?: string; consultantId?: string; clientId?: string; projectId?: string },
  actor: User
) {
  const db = await requireMongoDb();
  const filter: Filter<TimeEntryDocument> = { status: { $in: ["Submitted", "Approved"] }, ...orgFilter(actor) };
  if (input.from || input.to) filter.workDate = { ...(input.from ? { $gte: input.from } : {}), ...(input.to ? { $lte: input.to } : {}) };
  if (input.consultantId) {
    assertRecordScope(actor, input.consultantId);
    filter.consultantId = recordId(input.consultantId);
  } else if (actor.role === "consultant") {
    if (!actor.consultantId) throw new TRPCError({ code: "FORBIDDEN", message: "Your account is not assigned to a consultant record." });
    filter.consultantId = recordId(actor.consultantId);
  }
  if (input.clientId) filter.clientId = recordId(input.clientId);
  if (input.projectId) filter.projectId = recordId(input.projectId);

  const rows = await collection<TimeEntryDocument>(db, "timeEntries").find(filter).toArray();
  const result = {
    billableHours: 0,
    nonBillableHours: 0,
    approvedBillableHours: 0,
    approvedNonBillableHours: 0,
    pendingApproval: 0,
    estimatedRevenueByCurrency: {} as Partial<Record<CurrencyCode, number>>,
    approvedEstimatedRevenueByCurrency: {} as Partial<Record<CurrencyCode, number>>,
  };

  for (const row of rows) {
    const isApproved = row.status === "Approved";
    if (row.billingClassification === "Billable") {
      result.billableHours += row.hours;
      if (isApproved) result.approvedBillableHours += row.hours;
      if (row.currency && row.billingRateSnapshot != null) {
        const rev = row.hours * row.billingRateSnapshot;
        result.estimatedRevenueByCurrency[row.currency] = (result.estimatedRevenueByCurrency[row.currency] ?? 0) + rev;
        if (isApproved) {
          result.approvedEstimatedRevenueByCurrency[row.currency] = (result.approvedEstimatedRevenueByCurrency[row.currency] ?? 0) + rev;
        }
      }
    } else {
      result.nonBillableHours += row.hours;
      if (isApproved) result.approvedNonBillableHours += row.hours;
    }
    if (row.status === "Submitted") result.pendingApproval += 1;
  }

  // Round currency totals to 2 decimal places
  for (const curr of Object.keys(result.estimatedRevenueByCurrency) as CurrencyCode[]) {
    if (result.estimatedRevenueByCurrency[curr]) {
      result.estimatedRevenueByCurrency[curr] = Math.round(result.estimatedRevenueByCurrency[curr]! * 100) / 100;
    }
    if (result.approvedEstimatedRevenueByCurrency[curr]) {
      result.approvedEstimatedRevenueByCurrency[curr] = Math.round(result.approvedEstimatedRevenueByCurrency[curr]! * 100) / 100;
    }
  }

  if (!hasPermission(actor.role, "metrics.financial")) {
    result.estimatedRevenueByCurrency = {};
    result.approvedEstimatedRevenueByCurrency = {};
  }
  return result;
}
export async function listApprovalHistory(value: string, actor: User) { const db = await requireMongoDb(); const entry = await collection<TimeEntryDocument>(db, "timeEntries").findOne({ _id: recordId(value) }); if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found." }); assertEntryScope(actor, entry); const rows = await collection<ApprovalHistoryDocument>(db, "timeEntryApprovalHistory").find({ timeEntryId: recordId(value) }).sort({ createdAt: -1 }).toArray(); return rows.map((row) => ({ id: id(row._id), timeEntryId: id(row.timeEntryId), previousStatus: row.previousStatus, newStatus: row.newStatus, actedBy: id(row.actedBy), rejectionReason: row.rejectionReason, createdAt: date(row.createdAt) ?? "" })); }
