import { TRPCError } from "@trpc/server";
import type { Db, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { collection, requireMongoDb, type RetainerDocument, type RetainerType, type RetainerStatus, type BillingFrequency, type CurrencyCode, type TimeEntryDocument } from "./mongo";
import type { User } from "./types";
import { assertOrganizationScope, assertPermission, orgFilter } from "./authorization";
import { canViewFinancialData, redactFinancialValues } from "./financialAccess";

// ================== Type Conversions ==================

function id(value: ObjectId): string {
  return value.toHexString();
}

export function recordId(value: string): ObjectId {
  if (!ObjectId.isValid(value)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A valid record identifier is required." });
  }
  return new ObjectId(value);
}

// ================== Domain Models ==================

export interface Retainer {
  id: string;
  organizationId: string | null;
  clientId: string;
  projectId: string | null;
  name: string;
  type: RetainerType;
  contractedHours: number | null;
  contractedAmount: number | null;
  currency: CurrencyCode;
  billingFrequency: BillingFrequency;
  startDate: string;
  endDate: string;
  rolloverAllowed: boolean;
  alertThresholdPercent: number;
  status: RetainerStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetainerInput {
  clientId: string;
  projectId?: string | null;
  name: string;
  type: RetainerType;
  contractedHours?: number | null;
  contractedAmount?: number | null;
  currency: CurrencyCode;
  billingFrequency: BillingFrequency;
  startDate: string;
  endDate: string;
  rolloverAllowed: boolean;
  alertThresholdPercent: number;
}

export interface RetainerUsage {
  retainerId: string;
  approvedHours: number;
  approvedAmount: number | null;
  remainingHours: number | null;
  remainingAmount: number | null;
  utilizationPercent: number | null;
  exceedsContract: boolean | null;
}

// ================== Document Conversion ==================

function toRetainer(doc: RetainerDocument, actor: User): Retainer {
  return redactFinancialValues({
    id: id(doc._id),
    organizationId: doc.organizationId ? id(doc.organizationId) : null,
    clientId: id(doc.clientId),
    projectId: doc.projectId ? id(doc.projectId) : null,
    name: doc.name,
    type: doc.type,
    contractedHours: doc.contractedHours,
    contractedAmount: doc.contractedAmount,
    currency: doc.currency,
    billingFrequency: doc.billingFrequency,
    startDate: doc.startDate,
    endDate: doc.endDate,
    rolloverAllowed: doc.rolloverAllowed,
    alertThresholdPercent: doc.alertThresholdPercent,
    status: doc.status,
    createdBy: id(doc.createdBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }, actor, ["contractedAmount"] as const);
}

// ================== Validation ==================

function validateRetainerInput(input: RetainerInput, isUpdate: boolean = false) {
  const errors: string[] = [];

  // Name validation
  if (!input.name.trim()) {
    errors.push("Contract name is required.");
  } else if (input.name.length > 200) {
    errors.push("Contract name must not exceed 200 characters.");
  }

  // Date validation
  if (!input.startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("Start date must be in YYYY-MM-DD format.");
  }
  if (!input.endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("End date must be in YYYY-MM-DD format.");
  }
  if (input.startDate && input.endDate && input.startDate > input.endDate) {
    errors.push("Start date must not be later than end date.");
  }

  // Type-specific validation
  if (input.type === "HOURS") {
    if (input.contractedHours == null || input.contractedHours <= 0) {
      errors.push("Hour-based retainers must have a positive contracted hours value.");
    }
    if (input.contractedHours != null && input.contractedHours > 10000) {
      errors.push("Contracted hours must not exceed 10,000 hours.");
    }
  } else if (input.type === "AMOUNT") {
    if (input.contractedAmount == null || input.contractedAmount <= 0) {
      errors.push("Amount-based retainers must have a positive contracted amount.");
    }
    if (input.contractedAmount != null && input.contractedAmount > 100000000) {
      errors.push("Contracted amount must not exceed 100,000,000.");
    }
  }

  // Alert threshold validation
  if (input.alertThresholdPercent < 0 || input.alertThresholdPercent > 100) {
    errors.push("Alert threshold must be between 0 and 100 percent.");
  }

  if (errors.length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: errors.join(" ") });
  }
}

async function validateClientAndProject(db: Db, input: RetainerInput, actor: User) {
  // Validate client exists and belongs to organization
  const client = await db.collection("clients").findOne({
    _id: recordId(input.clientId),
    ...orgFilter(actor),
  });

  if (!client) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The selected client does not exist or does not belong to your organization."
    });
  }

  // Validate project if provided
  if (input.projectId) {
    const project = await db.collection("projects").findOne({
      _id: recordId(input.projectId),
      clientId: recordId(input.clientId),
      ...orgFilter(actor),
    });

    if (!project) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The selected project does not exist, does not belong to this client, or is not in your organization."
      });
    }
  }
}

// ================== CRUD Operations ==================

export async function listRetainers(actor: User): Promise<Retainer[]> {
  assertPermission(actor, "clients.read"); // Retainers are client-related
  const db = await requireMongoDb();

  const retainers = await collection<RetainerDocument>(db, "retainers")
    .find({ ...orgFilter(actor) })
    .sort({ createdAt: -1 })
    .toArray();

  return retainers.map((retainer) => toRetainer(retainer, actor));
}

export async function getRetainer(value: string, actor: User): Promise<Retainer> {
  assertPermission(actor, "clients.read");
  const db = await requireMongoDb();

  const doc = await collection<RetainerDocument>(db, "retainers").findOne({
    _id: recordId(value),
    ...orgFilter(actor),
  });

  if (!doc) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Retainer agreement not found." });
  }

  assertOrganizationScope(actor, doc.organizationId ? id(doc.organizationId) : null);
  return toRetainer(doc, actor);
}

export async function createRetainer(input: RetainerInput, actor: User): Promise<Retainer> {
  assertPermission(actor, "clients.manage"); // Require manage permission for creation
  validateRetainerInput(input);

  const db = await requireMongoDb();
  await validateClientAndProject(db, input, actor);

  const now = new Date();
  const actorId = recordId(actor.id);
  const orgId = actor.organizationId ? recordId(actor.organizationId) : null;

  const doc: RetainerDocument = {
    _id: new ObjectId(),
    organizationId: orgId,
    clientId: recordId(input.clientId),
    projectId: input.projectId ? recordId(input.projectId) : null,
    name: input.name.trim(),
    type: input.type,
    contractedHours: input.type === "HOURS" ? input.contractedHours! : null,
    contractedAmount: input.type === "AMOUNT" ? input.contractedAmount! : null,
    currency: input.currency,
    billingFrequency: input.billingFrequency,
    startDate: input.startDate,
    endDate: input.endDate,
    rolloverAllowed: input.rolloverAllowed,
    alertThresholdPercent: input.alertThresholdPercent,
    status: "DRAFT",
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  };

  await collection<RetainerDocument>(db, "retainers").insertOne(doc);
  return toRetainer(doc, actor);
}

export async function updateRetainer(value: string, input: RetainerInput, actor: User): Promise<Retainer> {
  assertPermission(actor, "clients.manage");
  validateRetainerInput(input, true);

  const db = await requireMongoDb();
  const key = recordId(value);

  // Load existing retainer
  const existing = await collection<RetainerDocument>(db, "retainers").findOne({
    _id: key,
    ...orgFilter(actor),
  });

  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Retainer agreement not found." });
  }

  assertOrganizationScope(actor, existing.organizationId ? id(existing.organizationId) : null);

  // Cannot update terminated retainers
  if (existing.status === "TERMINATED") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot update a terminated retainer agreement."
    });
  }

  await validateClientAndProject(db, input, actor);

  const now = new Date();

  await collection<RetainerDocument>(db, "retainers").updateOne(
    { _id: key },
    {
      $set: {
        clientId: recordId(input.clientId),
        projectId: input.projectId ? recordId(input.projectId) : null,
        name: input.name.trim(),
        type: input.type,
        contractedHours: input.type === "HOURS" ? input.contractedHours! : null,
        contractedAmount: input.type === "AMOUNT" ? input.contractedAmount! : null,
        currency: input.currency,
        billingFrequency: input.billingFrequency,
        startDate: input.startDate,
        endDate: input.endDate,
        rolloverAllowed: input.rolloverAllowed,
        alertThresholdPercent: input.alertThresholdPercent,
        updatedAt: now,
      },
    }
  );

  const updated = await collection<RetainerDocument>(db, "retainers").findOne({ _id: key });
  if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to retrieve updated retainer." });

  return toRetainer(updated, actor);
}

export async function activateRetainer(value: string, actor: User): Promise<Retainer> {
  assertPermission(actor, "clients.manage");
  const db = await requireMongoDb();
  const key = recordId(value);

  const existing = await collection<RetainerDocument>(db, "retainers").findOne({
    _id: key,
    ...orgFilter(actor),
  });

  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Retainer agreement not found." });
  }

  assertOrganizationScope(actor, existing.organizationId ? id(existing.organizationId) : null);

  if (existing.status !== "DRAFT") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot activate a retainer with status ${existing.status}.`
    });
  }

  const now = new Date();

  await collection<RetainerDocument>(db, "retainers").updateOne(
    { _id: key },
    { $set: { status: "ACTIVE", updatedAt: now } }
  );

  const updated = await collection<RetainerDocument>(db, "retainers").findOne({ _id: key });
  if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to retrieve activated retainer." });

  return toRetainer(updated, actor);
}

export async function terminateRetainer(value: string, actor: User): Promise<Retainer> {
  assertPermission(actor, "clients.manage");
  const db = await requireMongoDb();
  const key = recordId(value);

  const existing = await collection<RetainerDocument>(db, "retainers").findOne({
    _id: key,
    ...orgFilter(actor),
  });

  if (!existing) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Retainer agreement not found." });
  }

  assertOrganizationScope(actor, existing.organizationId ? id(existing.organizationId) : null);

  if (existing.status === "TERMINATED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Retainer is already terminated." });
  }

  const now = new Date();

  await collection<RetainerDocument>(db, "retainers").updateOne(
    { _id: key },
    { $set: { status: "TERMINATED", updatedAt: now } }
  );

  const updated = await collection<RetainerDocument>(db, "retainers").findOne({ _id: key });
  if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to retrieve terminated retainer." });

  return toRetainer(updated, actor);
}

// ================== Usage Calculation ==================

async function calculateRetainerUsage(value: string, actor: User): Promise<RetainerUsage> {
  assertPermission(actor, "clients.read");
  const db = await requireMongoDb();

  const document = await collection<RetainerDocument>(db, "retainers").findOne({
    _id: recordId(value),
    ...orgFilter(actor),
  });
  if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "Retainer agreement not found." });
  assertOrganizationScope(actor, document.organizationId ? id(document.organizationId) : null);
  // Internal alert/usage calculation needs the contract amount; API responses are
  // redacted separately before they leave this module.
  const retainer = toRetainer(document, { ...actor, role: "admin" });
  const retainerKey = recordId(value);

  // Build filter for approved billable hours within contract period
  const filter: Filter<TimeEntryDocument> = {
    ...orgFilter(actor),
    clientId: recordId(retainer.clientId),
    status: "Approved",
    billingClassification: "Billable",
    workDate: {
      $gte: retainer.startDate,
      $lte: retainer.endDate,
    },
  };

  // Filter by project if retainer is project-specific
  if (retainer.projectId) {
    filter.projectId = recordId(retainer.projectId);
  }

  const entries = await collection<TimeEntryDocument>(db, "timeEntries")
    .find(filter)
    .toArray();

  // Calculate approved hours and amount
  let approvedHours = 0;
  let approvedAmount = 0;

  for (const entry of entries) {
    approvedHours += entry.hours;
    if (entry.billingRateSnapshot != null) {
      approvedAmount += entry.hours * entry.billingRateSnapshot;
    }
  }

  // Round to 2 decimal places
  approvedHours = Math.round(approvedHours * 100) / 100;
  approvedAmount = Math.round(approvedAmount * 100) / 100;

  // Calculate remaining based on retainer type
  let remainingHours: number | null = null;
  let remainingAmount: number | null = null;
  let utilizationPercent = 0;
  let exceedsContract = false;

  if (retainer.type === "HOURS" && retainer.contractedHours != null) {
    remainingHours = Math.round((retainer.contractedHours - approvedHours) * 100) / 100;
    utilizationPercent = Math.round((approvedHours / retainer.contractedHours) * 100 * 100) / 100;
    exceedsContract = approvedHours > retainer.contractedHours;
  } else if (retainer.type === "AMOUNT" && retainer.contractedAmount != null) {
    remainingAmount = Math.round((retainer.contractedAmount - approvedAmount) * 100) / 100;
    utilizationPercent = Math.round((approvedAmount / retainer.contractedAmount) * 100 * 100) / 100;
    exceedsContract = approvedAmount > retainer.contractedAmount;
  }

  return {
    retainerId: retainer.id,
    approvedHours,
    approvedAmount,
    remainingHours,
    remainingAmount,
    utilizationPercent,
    exceedsContract,
  };
}

export async function getRetainerUsage(value: string, actor: User): Promise<RetainerUsage> {
  const usage = await calculateRetainerUsage(value, actor);
  const retainer = await getRetainer(value, actor);
  return redactFinancialValues(usage, actor, retainer.type === "AMOUNT"
    ? ["approvedAmount", "remainingAmount", "utilizationPercent", "exceedsContract"] as const
    : ["approvedAmount", "remainingAmount"] as const);
}

// ================== Alert Generation ==================

export interface RetainerAlert {
  retainerId: string;
  retainerName: string;
  type: "THRESHOLD" | "EXPIRING" | "EXPIRED" | "EXCEEDED";
  message: string;
  severity: "warning" | "critical";
}

export async function getRetainerAlerts(actor: User): Promise<RetainerAlert[]> {
  assertPermission(actor, "clients.read");
  const db = await requireMongoDb();

  const retainers = await listRetainers(actor);
  const alerts: RetainerAlert[] = [];
  const today = new Date().toISOString().split("T")[0];

  for (const retainer of retainers) {
    if (retainer.status !== "ACTIVE") continue;

    try {
      const usage = await calculateRetainerUsage(retainer.id, actor);

      // Threshold alert
      if ((retainer.type === "HOURS" || canViewFinancialData(actor)) && usage.utilizationPercent != null && usage.utilizationPercent >= retainer.alertThresholdPercent && usage.exceedsContract === false) {
        alerts.push({
          retainerId: retainer.id,
          retainerName: retainer.name,
          type: "THRESHOLD",
          message: canViewFinancialData(actor)
            ? `Retainer "${retainer.name}" has reached ${usage.utilizationPercent.toFixed(1)}% utilization (threshold: ${retainer.alertThresholdPercent}%).`
            : `Retainer "${retainer.name}" has reached its configured utilization threshold.`,
          severity: "warning",
        });
      }

      // Exceeded alert
      if ((retainer.type === "HOURS" || canViewFinancialData(actor)) && usage.exceedsContract === true) {
        const overageMsg = retainer.type === "HOURS"
          ? `${Math.abs(usage.remainingHours!).toFixed(1)} hours over contract`
          : canViewFinancialData(actor)
            ? `${retainer.currency} ${Math.abs(usage.remainingAmount!).toFixed(2)} over budget`
            : "over the contracted amount";

        alerts.push({
          retainerId: retainer.id,
          retainerName: retainer.name,
          type: "EXCEEDED",
          message: `Retainer "${retainer.name}" has exceeded its contracted limit (${overageMsg}).`,
          severity: "critical",
        });
      }

      // Expiring soon (within 30 days)
      const daysUntilExpiry = Math.floor((new Date(retainer.endDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
        alerts.push({
          retainerId: retainer.id,
          retainerName: retainer.name,
          type: "EXPIRING",
          message: `Retainer "${retainer.name}" expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"} (${retainer.endDate}).`,
          severity: "warning",
        });
      }

      // Expired
      if (retainer.endDate < today) {
        alerts.push({
          retainerId: retainer.id,
          retainerName: retainer.name,
          type: "EXPIRED",
          message: `Retainer "${retainer.name}" expired on ${retainer.endDate}.`,
          severity: "critical",
        });
      }
    } catch (error) {
      // Skip this retainer if usage calculation fails
      console.error(`Failed to calculate usage for retainer ${retainer.id}:`, error);
    }
  }

  return alerts;
}
