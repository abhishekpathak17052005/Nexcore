import dns from "node:dns";
import { MongoClient, type Collection, type Db, type Document, ObjectId } from "mongodb";

// Node's c-ares resolver (used by dns.resolveSrv / dns.resolveTxt, which the
// MongoDB driver relies on for `mongodb+srv://` connection strings) reads the
// system's configured DNS servers directly. On some machines a VPN, ad-blocker,
// or DNS-proxy sets the system DNS to a loopback address (127.0.0.1 / ::1) where
// nothing is actually listening, causing every SRV/TXT lookup to fail with
// ECONNREFUSED. If a loopback server is detected, swap in working public
// resolvers (or the comma-separated DNS_SERVERS env override) so Atlas records
// resolve. This intentionally leaves healthy configurations untouched.
try {
  const servers = dns.getServers();
  const usesLoopback = servers.some((s) => s.startsWith("127.") || s === "::1");
  if (usesLoopback) {
    const fallback = process.env.DNS_SERVERS
      ? process.env.DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
      : ["8.8.8.8", "1.1.1.1"];
    if (fallback.length) dns.setServers(fallback);
  }
} catch {
  // Ignore — any connection failure is reported via checkMongoHealth() instead.
}

export type CurrencyCode = "USD" | "EUR" | "GBP";
export type EmploymentStatus = "Active" | "On leave" | "Inactive";
export type BillingClassification = "Billable" | "Non-billable";
export type TimeEntryStatus = "Draft" | "Submitted" | "Approved" | "Rejected";
export type UserRole = "admin" | "manager" | "finance" | "consultant" | "user";
export type UserStatus = "active" | "disabled";
export type MembershipStatus = "active" | "pending" | "rejected" | "unassigned";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
export type NotificationType = "JOIN_REQUEST_SUBMITTED" | "JOIN_REQUEST_APPROVED" | "JOIN_REQUEST_REJECTED" | "SYSTEM";

export interface MongoOrganization {
  _id: ObjectId;
  name: string;
  slug: string;
  description?: string | null;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoUser {
  _id: ObjectId;
  openId: string;
  name: string | null;
  email: string | null;
  passwordHash?: string | null;
  passwordSalt?: string | null;
  status?: UserStatus;
  organizationId?: ObjectId | null;
  membershipStatus?: MembershipStatus;
  loginMethod: string | null;
  role: UserRole;
  consultantId?: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export interface MongoJoinRequest {
  _id: ObjectId;
  organizationId: ObjectId;
  userId: ObjectId;
  userName: string;
  userEmail: string;
  requestedRole: UserRole;
  status: JoinRequestStatus;
  rejectionReason?: string | null;
  reviewedBy?: ObjectId | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MongoNotification {
  _id: ObjectId;
  recipientUserId: ObjectId;
  organizationId: ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedRequestId?: ObjectId | null;
  read: boolean;
  createdAt: Date;
  readAt?: Date | null;
}

export interface ConsultantDocument { _id: ObjectId; organizationId?: ObjectId | null; employeeCode: string; firstName: string; lastName: string; email: string; role: string; department: string; employmentStatus: EmploymentStatus; weeklyCapacityHours: number; billingRate: number; currency: CurrencyCode; startDate: string; createdAt: Date; updatedAt: Date; }
export interface ClientDocument { _id: ObjectId; organizationId?: ObjectId | null; clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode; createdAt: Date; updatedAt: Date; }
export interface ProjectDocument { _id: ObjectId; organizationId?: ObjectId | null; clientId: ObjectId; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate: string | null; endDate: string | null; createdAt: Date; updatedAt: Date; }
export interface TimeEntryDocument { _id: ObjectId; organizationId?: ObjectId | null; consultantId: ObjectId; clientId: ObjectId; projectId: ObjectId; workDate: string; description: string; hours: number; billingClassification: BillingClassification; status: TimeEntryStatus; billingRateSnapshot: number | null; currency: CurrencyCode | null; createdBy: ObjectId; createdAt: Date; updatedAt: Date; submittedAt: Date | null; reviewedAt: Date | null; reviewedBy: ObjectId | null; rejectionReason: string | null; }
export interface ApprovalHistoryDocument { _id: ObjectId; organizationId?: ObjectId | null; timeEntryId: ObjectId; previousStatus: TimeEntryStatus | null; newStatus: TimeEntryStatus; actedBy: ObjectId; rejectionReason: string | null; createdAt: Date; }

let client: MongoClient | null = null;
let database: Db | null = null;
let indexesReady: Promise<void> | null = null;

export async function getMongoDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;
  if (!client) {
    client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
    await client.connect();
    database = client.db(process.env.MONGODB_DB_NAME || "consultant_utilization_dashboard");
  }
  if (!database) throw new Error("MongoDB database handle was not initialized.");
  if (!indexesReady) indexesReady = ensureIndexes(database);
  await indexesReady;
  return database;
}

export async function requireMongoDb() {
  const db = await getMongoDb();
  if (!db) throw new Error("MONGODB_URI is not configured.");
  return db;
}

export async function getMongoClient() {
  await getMongoDb();
  return client;
}

async function ensureIndexes(db: Db) {
  try {
    await db.collection("users").dropIndex("consultantId_1");
  } catch {}
  await db.collection("users").updateMany({ consultantId: null }, { $unset: { consultantId: "" } });

  await Promise.all([
    db.collection<MongoOrganization>("organizations").createIndexes([{ key: { slug: 1 }, unique: true }, { key: { name: 1 } }]),
    db.collection<MongoJoinRequest>("organizationJoinRequests").createIndexes([{ key: { organizationId: 1, status: 1 } }, { key: { userId: 1, organizationId: 1 } }, { key: { createdAt: -1 } }]),
    db.collection<MongoNotification>("notifications").createIndexes([{ key: { recipientUserId: 1, read: 1, createdAt: -1 } }, { key: { organizationId: 1 } }]),
    db.collection<MongoUser>("users").createIndexes([
      { key: { openId: 1 }, unique: true },
      { key: { email: 1 }, unique: true, sparse: true },
      { key: { role: 1 } },
      { key: { consultantId: 1 }, unique: true, partialFilterExpression: { consultantId: { $type: "objectId" } } },
      { key: { organizationId: 1, membershipStatus: 1 } },
    ]),
    db.collection<ConsultantDocument>("consultants").createIndexes([{ key: { employeeCode: 1 }, unique: true }, { key: { email: 1 }, unique: true }, { key: { employmentStatus: 1 } }, { key: { organizationId: 1 } }]),
    db.collection<ClientDocument>("clients").createIndexes([{ key: { clientCode: 1 }, unique: true }, { key: { name: 1 } }, { key: { organizationId: 1 } }]),
    db.collection<ProjectDocument>("projects").createIndexes([{ key: { clientId: 1, name: 1 }, unique: true }, { key: { clientId: 1 } }, { key: { organizationId: 1 } }]),
    db.collection<TimeEntryDocument>("timeEntries").createIndexes([{ key: { consultantId: 1, workDate: 1 } }, { key: { status: 1 } }, { key: { projectId: 1, workDate: 1 } }, { key: { consultantId: 1, clientId: 1, projectId: 1, workDate: 1 } }, { key: { organizationId: 1 } }]),
    db.collection<ApprovalHistoryDocument>("timeEntryApprovalHistory").createIndexes([{ key: { timeEntryId: 1, createdAt: -1 } }, { key: { actedBy: 1 } }, { key: { organizationId: 1 } }]),
  ]);
}

export function objectId(value: string) {
  if (!ObjectId.isValid(value)) throw new Error("A valid MongoDB record id is required.");
  return new ObjectId(value);
}

export function collection<T extends Document>(db: Db, name: string): Collection<T> {
  return db.collection<T>(name);
}

export interface MongoHealthStatus {
  connected: boolean;
  latencyMs: number;
  database: string;
  topology: "replicaSet" | "standalone" | "unknown";
  transactionsSupported: boolean;
  error?: string;
}

export async function checkMongoHealth(): Promise<MongoHealthStatus> {
  const start = Date.now();
  try {
    const db = await requireMongoDb();
    await db.command({ ping: 1 });
    const latencyMs = Date.now() - start;

    let topology: "replicaSet" | "standalone" | "unknown" = "unknown";
    let transactionsSupported = false;
    try {
      const admin = db.admin();
      const status = await admin.serverStatus();
      if (status.repl) {
        topology = "replicaSet";
        transactionsSupported = true;
      } else {
        topology = "standalone";
        transactionsSupported = false;
      }
    } catch {
      topology = "standalone";
      transactionsSupported = false;
    }

    return {
      connected: true,
      latencyMs,
      database: db.databaseName,
      topology,
      transactionsSupported,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      database: process.env.MONGODB_DB_NAME || "consultant_utilization_dashboard",
      topology: "unknown",
      transactionsSupported: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
