import {
  collection,
  getMongoDb,
  objectId,
  type MongoUser,
  type MongoOrganization,
  type MongoJoinRequest,
  type MongoNotification,
} from "./mongo";
import type {
  InsertUser,
  User,
  UserRole,
  UserStatus,
  MembershipStatus,
  JoinRequestStatus,
  NotificationType,
  Organization,
  JoinRequest,
  NotificationItem,
} from "./types";
import { ENV } from "./_core/env";
import { hashPassword, normalizeEmail } from "./password";
import { ObjectId, type Filter } from "mongodb";

export async function getDb() {
  return getMongoDb();
}

function toUser(record: MongoUser): User {
  return {
    id: record._id.toHexString(),
    openId: record.openId,
    name: record.name,
    email: record.email,
    loginMethod: record.loginMethod,
    role: record.role,
    status: record.status ?? "active",
    organizationId: record.organizationId ? record.organizationId.toHexString() : null,
    membershipStatus: record.membershipStatus ?? (record.organizationId ? "active" : "unassigned"),
    consultantId: record.consultantId?.toHexString() ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSignedIn: record.lastSignedIn,
  };
}

function toOrganization(record: MongoOrganization): Organization {
  return {
    id: record._id.toHexString(),
    name: record.name,
    slug: record.slug,
    description: record.description ?? null,
    createdBy: record.createdBy.toHexString(),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toJoinRequest(record: MongoJoinRequest, orgName?: string): JoinRequest {
  return {
    id: record._id.toHexString(),
    organizationId: record.organizationId.toHexString(),
    organizationName: orgName,
    userId: record.userId.toHexString(),
    userName: record.userName,
    userEmail: record.userEmail,
    requestedRole: record.requestedRole,
    status: record.status,
    rejectionReason: record.rejectionReason ?? null,
    reviewedBy: record.reviewedBy ? record.reviewedBy.toHexString() : null,
    reviewedAt: record.reviewedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toNotification(record: MongoNotification): NotificationItem {
  return {
    id: record._id.toHexString(),
    recipientUserId: record.recipientUserId.toHexString(),
    organizationId: record.organizationId.toHexString(),
    type: record.type,
    title: record.title,
    message: record.message,
    relatedRequestId: record.relatedRequestId ? record.relatedRequestId.toHexString() : null,
    read: record.read,
    createdAt: record.createdAt,
    readAt: record.readAt ?? null,
  };
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");
  const now = new Date();
  const isOwner = Boolean(ENV.ownerOpenId && user.openId === ENV.ownerOpenId);
  const role = user.role ?? (isOwner ? "admin" : "user");
  const consultantId = user.consultantId === undefined ? undefined : user.consultantId === null ? null : objectId(user.consultantId);
  const organizationId = user.organizationId === undefined ? undefined : user.organizationId === null ? null : objectId(user.organizationId);
  await collection<MongoUser>(db, "users").updateOne(
    { openId: user.openId },
    {
      $set: {
        ...(user.name !== undefined ? { name: user.name } : {}),
        ...(user.email !== undefined ? { email: user.email ? normalizeEmail(user.email) : null } : {}),
        ...(user.loginMethod !== undefined ? { loginMethod: user.loginMethod } : {}),
        ...(user.passwordHash !== undefined ? { passwordHash: user.passwordHash } : {}),
        ...(user.passwordSalt !== undefined ? { passwordSalt: user.passwordSalt } : {}),
        ...(user.status !== undefined ? { status: user.status } : {}),
        ...(organizationId !== undefined ? { organizationId } : {}),
        ...(user.membershipStatus !== undefined ? { membershipStatus: user.membershipStatus } : {}),
        ...(consultantId !== undefined ? { consultantId } : {}),
        ...(isOwner ? { role: "admin" as const } : {}),
        lastSignedIn: user.lastSignedIn ?? now,
        updatedAt: now,
      },
      $setOnInsert: {
        openId: user.openId,
        role,
        status: user.status ?? "active",
        organizationId: organizationId ?? null,
        membershipStatus: user.membershipStatus ?? (organizationId ? "active" : "unassigned"),
        consultantId: consultantId ?? null,
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getMongoDb();
  if (!db) return undefined;
  const record = await collection<MongoUser>(db, "users").findOne({ openId });
  return record ? toUser(record) : undefined;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const db = await getMongoDb();
  if (!db) return undefined;
  try {
    const record = await collection<MongoUser>(db, "users").findOne({ _id: objectId(id) });
    return record ? toUser(record) : undefined;
  } catch {
    return undefined;
  }
}

export async function getAuthUserByEmail(email: string): Promise<MongoUser | undefined> {
  const db = await getMongoDb();
  if (!db) return undefined;
  const normalized = normalizeEmail(email);
  const record = await collection<MongoUser>(db, "users").findOne({ email: normalized });
  return record ?? undefined;
}

export async function countAdmins(organizationId?: string): Promise<number> {
  const db = await getMongoDb();
  if (!db) return 0;
  const filter: Filter<MongoUser> = { role: "admin" };
  if (organizationId) {
    filter.organizationId = objectId(organizationId);
  }
  return collection<MongoUser>(db, "users").countDocuments(filter);
}

export async function createPasswordUser(params: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  organizationId?: string | null;
  membershipStatus?: MembershipStatus;
  consultantId?: string | null;
}): Promise<User> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");

  const normalized = normalizeEmail(params.email);
  const existing = await collection<MongoUser>(db, "users").findOne({ email: normalized });
  if (existing) {
    throw new Error("A user with this email address already exists.");
  }

  const { hash, salt } = hashPassword(params.password);
  const now = new Date();
  const userId = new ObjectId();
  const openId = `local_${userId.toHexString()}`;

  const assignedConsultantId = params.consultantId ? objectId(params.consultantId) : null;
  const assignedOrgId = params.organizationId ? objectId(params.organizationId) : null;

  const newUser: MongoUser = {
    _id: userId,
    openId,
    name: params.name.trim(),
    email: normalized,
    passwordHash: hash,
    passwordSalt: salt,
    status: "active",
    organizationId: assignedOrgId,
    membershipStatus: params.membershipStatus ?? (assignedOrgId ? "active" : "unassigned"),
    loginMethod: "password",
    role: params.role,
    ...(assignedConsultantId ? { consultantId: assignedConsultantId } : {}),
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };

  await collection<MongoUser>(db, "users").insertOne(newUser);
  return toUser(newUser);
}

export async function listUsers(organizationId?: string): Promise<User[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const filter: Filter<MongoUser> = {};
  if (organizationId) {
    filter.organizationId = objectId(organizationId);
  }
  const records = await collection<MongoUser>(db, "users").find(filter).sort({ createdAt: -1 }).toArray();
  return records.map(toUser);
}

export async function setUserRole(targetUserId: string, role: UserRole, consultantId?: string | null): Promise<User> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");
  const targetId = objectId(targetUserId);
  const assignedConsultantId = consultantId === undefined ? undefined : consultantId === null ? null : objectId(consultantId);
  const result = await collection<MongoUser>(db, "users").findOneAndUpdate(
    { _id: targetId },
    { $set: { role, ...(assignedConsultantId !== undefined ? { consultantId: assignedConsultantId } : {}), updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("User not found");
  return toUser(result);
}

export async function setUserStatus(targetUserId: string, status: UserStatus): Promise<User> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");
  const targetId = objectId(targetUserId);
  const result = await collection<MongoUser>(db, "users").findOneAndUpdate(
    { _id: targetId },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw new Error("User not found");
  return toUser(result);
}

/* ========================================================================= */
/* MULTI-TENANT: ORGANIZATIONS                                               */
/* ========================================================================= */

export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createOrganization(params: {
  name: string;
  slug: string;
  description?: string | null;
  creatorUserId: string;
}): Promise<Organization> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");

  const slug = normalizeSlug(params.slug);
  if (!slug || slug.length < 2) {
    throw new Error("Organization slug must be at least 2 characters long.");
  }

  const existing = await collection<MongoOrganization>(db, "organizations").findOne({ slug });
  if (existing) {
    throw new Error(`An organization with the identifier "${slug}" already exists.`);
  }

  const now = new Date();
  const orgId = new ObjectId();
  const creatorId = objectId(params.creatorUserId);

  const doc: MongoOrganization = {
    _id: orgId,
    name: params.name.trim(),
    slug,
    description: params.description?.trim() || null,
    createdBy: creatorId,
    createdAt: now,
    updatedAt: now,
  };

  await collection<MongoOrganization>(db, "organizations").insertOne(doc);

  // Bind creator user to the organization as an active Admin
  await collection<MongoUser>(db, "users").updateOne(
    { _id: creatorId },
    {
      $set: {
        organizationId: orgId,
        membershipStatus: "active",
        role: "admin",
        updatedAt: now,
      },
    },
  );

  return toOrganization(doc);
}

export async function getOrganizationById(id: string): Promise<Organization | undefined> {
  const db = await getMongoDb();
  if (!db) return undefined;
  try {
    const doc = await collection<MongoOrganization>(db, "organizations").findOne({ _id: objectId(id) });
    return doc ? toOrganization(doc) : undefined;
  } catch {
    return undefined;
  }
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  const db = await getMongoDb();
  if (!db) return undefined;
  const normalized = normalizeSlug(slug);
  const doc = await collection<MongoOrganization>(db, "organizations").findOne({ slug: normalized });
  return doc ? toOrganization(doc) : undefined;
}

/**
 * Public safe organization discovery: returns ONLY safe public metadata (id, name, slug)
 * Never leaks private emails, employee lists, or financial data.
 */
export async function searchOrganizations(query: string, limit = 20): Promise<Array<{ id: string; name: string; slug: string }>> {
  const db = await getMongoDb();
  if (!db) return [];
  const q = query.trim();
  const filter: Filter<MongoOrganization> = q
    ? {
      $or: [
        { name: { $regex: q, $options: "i" } },
        { slug: { $regex: normalizeSlug(q), $options: "i" } },
      ],
    }
    : {};

  const docs = await collection<MongoOrganization>(db, "organizations")
    .find(filter, { projection: { _id: 1, name: 1, slug: 1 } })
    .limit(limit)
    .sort({ name: 1 })
    .toArray();

  return docs.map(d => ({
    id: d._id.toHexString(),
    name: d.name,
    slug: d.slug,
  }));
}

/* ========================================================================= */
/* MULTI-TENANT: JOIN REQUESTS                                               */
/* ========================================================================= */

export async function createJoinRequest(params: {
  organizationId: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedRole?: UserRole;
}): Promise<JoinRequest> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");

  const orgKey = objectId(params.organizationId);
  const userKey = objectId(params.userId);

  const org = await collection<MongoOrganization>(db, "organizations").findOne({ _id: orgKey });
  if (!org) {
    throw new Error("The selected organization does not exist.");
  }

  // Prevent duplicate active pending requests for same user and organization
  const existingPending = await collection<MongoJoinRequest>(db, "organizationJoinRequests").findOne({
    organizationId: orgKey,
    userId: userKey,
    status: "PENDING",
  });
  if (existingPending) {
    throw new Error("You already have an active pending join request for this organization.");
  }

  const now = new Date();
  const requestId = new ObjectId();
  const role: UserRole = params.requestedRole || "consultant";

  const requestDoc: MongoJoinRequest = {
    _id: requestId,
    organizationId: orgKey,
    userId: userKey,
    userName: params.userName.trim(),
    userEmail: normalizeEmail(params.userEmail),
    requestedRole: role,
    status: "PENDING",
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await collection<MongoJoinRequest>(db, "organizationJoinRequests").insertOne(requestDoc);

  // Set user state to pending membership in this organization
  await collection<MongoUser>(db, "users").updateOne(
    { _id: userKey },
    {
      $set: {
        organizationId: orgKey,
        membershipStatus: "pending",
        role: "user", // Stays unprivileged until approved
        updatedAt: now,
      },
    },
  );

  // Notify organization administrators
  const admins = await collection<MongoUser>(db, "users")
    .find({ organizationId: orgKey, role: "admin", status: "active" })
    .toArray();

  for (const admin of admins) {
    await createNotification({
      recipientUserId: admin._id,
      organizationId: orgKey,
      type: "JOIN_REQUEST_SUBMITTED",
      title: "New Organization Join Request",
      message: `${params.userName} (${params.userEmail}) requested to join as ${role}.`,
      relatedRequestId: requestId,
    });
  }

  return toJoinRequest(requestDoc, org.name);
}

export async function getActiveJoinRequestForUser(userId: string): Promise<JoinRequest | undefined> {
  const db = await getMongoDb();
  if (!db) return undefined;
  const userKey = objectId(userId);
  const doc = await collection<MongoJoinRequest>(db, "organizationJoinRequests")
    .find({ userId: userKey })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  if (!doc) return undefined;

  const org = await collection<MongoOrganization>(db, "organizations").findOne({ _id: doc.organizationId });
  return toJoinRequest(doc, org?.name);
}

export async function listJoinRequests(organizationId: string, status?: JoinRequestStatus): Promise<JoinRequest[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const orgKey = objectId(organizationId);
  const filter: Filter<MongoJoinRequest> = { organizationId: orgKey };
  if (status) filter.status = status;

  const org = await collection<MongoOrganization>(db, "organizations").findOne({ _id: orgKey });
  const docs = await collection<MongoJoinRequest>(db, "organizationJoinRequests")
    .find(filter)
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map(d => toJoinRequest(d, org?.name));
}

export async function approveJoinRequest(params: {
  requestId: string;
  reviewerAdminId: string;
  assignedRole: UserRole;
  consultantId?: string | null;
}): Promise<JoinRequest> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");

  const reqKey = objectId(params.requestId);
  const reviewerKey = objectId(params.reviewerAdminId);

  // Verify reviewer is an admin
  const reviewer = await collection<MongoUser>(db, "users").findOne({ _id: reviewerKey });
  if (!reviewer || reviewer.role !== "admin" || !reviewer.organizationId) {
    throw new Error("Only an authorized organization administrator can approve join requests.");
  }

  // Load and atomically verify request is still PENDING for the admin's organization
  const now = new Date();
  const request = await collection<MongoJoinRequest>(db, "organizationJoinRequests").findOne({
    _id: reqKey,
    organizationId: reviewer.organizationId,
  });

  if (!request) {
    throw new Error("Join request not found or does not belong to your organization.");
  }
  if (request.status !== "PENDING") {
    throw new Error(`Cannot approve request: current status is ${request.status}.`);
  }

  const assignedConsultantId = params.consultantId ? objectId(params.consultantId) : null;

  // Update join request
  await collection<MongoJoinRequest>(db, "organizationJoinRequests").updateOne(
    { _id: reqKey, status: "PENDING" },
    {
      $set: {
        status: "APPROVED",
        reviewedBy: reviewerKey,
        reviewedAt: now,
        updatedAt: now,
      },
    },
  );

  // Activate member account
  await collection<MongoUser>(db, "users").updateOne(
    { _id: request.userId },
    {
      $set: {
        organizationId: request.organizationId,
        membershipStatus: "active",
        role: params.assignedRole,
        consultantId: assignedConsultantId,
        updatedAt: now,
      },
    },
  );

  const org = await collection<MongoOrganization>(db, "organizations").findOne({ _id: request.organizationId });

  // Persistent notification for employee
  await createNotification({
    recipientUserId: request.userId,
    organizationId: request.organizationId,
    type: "JOIN_REQUEST_APPROVED",
    title: "Organization Membership Approved",
    message: `Your request to join ${org?.name ?? "the organization"} has been approved with role: ${params.assignedRole}.`,
    relatedRequestId: reqKey,
  });

  const updated = await collection<MongoJoinRequest>(db, "organizationJoinRequests").findOne({ _id: reqKey });
  return toJoinRequest(updated!, org?.name);
}

export async function rejectJoinRequest(params: {
  requestId: string;
  reviewerAdminId: string;
  reason?: string | null;
}): Promise<JoinRequest> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");

  const reqKey = objectId(params.requestId);
  const reviewerKey = objectId(params.reviewerAdminId);

  const reviewer = await collection<MongoUser>(db, "users").findOne({ _id: reviewerKey });
  if (!reviewer || reviewer.role !== "admin" || !reviewer.organizationId) {
    throw new Error("Only an authorized organization administrator can reject join requests.");
  }

  const request = await collection<MongoJoinRequest>(db, "organizationJoinRequests").findOne({
    _id: reqKey,
    organizationId: reviewer.organizationId,
  });

  if (!request) {
    throw new Error("Join request not found or does not belong to your organization.");
  }
  if (request.status !== "PENDING") {
    throw new Error(`Cannot reject request: current status is ${request.status}.`);
  }

  const now = new Date();
  const reason = params.reason?.trim() || null;

  await collection<MongoJoinRequest>(db, "organizationJoinRequests").updateOne(
    { _id: reqKey, status: "PENDING" },
    {
      $set: {
        status: "REJECTED",
        rejectionReason: reason,
        reviewedBy: reviewerKey,
        reviewedAt: now,
        updatedAt: now,
      },
    },
  );

  // Set user membership to rejected
  await collection<MongoUser>(db, "users").updateOne(
    { _id: request.userId },
    {
      $set: {
        membershipStatus: "rejected",
        updatedAt: now,
      },
    },
  );

  const org = await collection<MongoOrganization>(db, "organizations").findOne({ _id: request.organizationId });

  // Persistent notification for employee
  await createNotification({
    recipientUserId: request.userId,
    organizationId: request.organizationId,
    type: "JOIN_REQUEST_REJECTED",
    title: "Organization Request Declined",
    message: reason
      ? `Your request to join ${org?.name ?? "the organization"} was declined. Reason: ${reason}`
      : `Your request to join ${org?.name ?? "the organization"} was declined by the administrator.`,
    relatedRequestId: reqKey,
  });

  const updated = await collection<MongoJoinRequest>(db, "organizationJoinRequests").findOne({ _id: reqKey });
  return toJoinRequest(updated!, org?.name);
}

export async function withdrawJoinRequest(params: {
  requestId: string;
  userId: string;
}): Promise<JoinRequest> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");


  const reqKey = objectId(params.requestId);
  const userKey = objectId(params.userId);

  const request = await collection<MongoJoinRequest>(db, "organizationJoinRequests").findOne({
    _id: reqKey,
    userId: userKey,
  });

  if (!request) {
    throw new Error("Join request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error(`Cannot withdraw request with status: ${request.status}.`);
  }

  const now = new Date();
  await collection<MongoJoinRequest>(db, "organizationJoinRequests").updateOne(
    { _id: reqKey, status: "PENDING" },
    {
      $set: {
        status: "WITHDRAWN",
        updatedAt: now,
      },
    },
  );

  // Reset user to unassigned
  await collection<MongoUser>(db, "users").updateOne(
    { _id: userKey },
    {
      $set: {
        organizationId: null,
        membershipStatus: "unassigned",
        updatedAt: now,
      },
    },
  );

  const org = await collection<MongoOrganization>(db, "organizations").findOne({ _id: request.organizationId });
  const updated = await collection<MongoJoinRequest>(db, "organizationJoinRequests").findOne({ _id: reqKey });
  return toJoinRequest(updated!, org?.name);
}

/* ========================================================================= */
/* MULTI-TENANT: PERSISTENT IN-APP NOTIFICATIONS                             */
/* ========================================================================= */

export async function createNotification(params: {
  recipientUserId: ObjectId;
  organizationId: ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  relatedRequestId?: ObjectId | null;
}): Promise<NotificationItem> {
  const db = await getMongoDb();
  if (!db) throw new Error("MongoDB is not available");

  const now = new Date();
  const doc: MongoNotification = {
    _id: new ObjectId(),
    recipientUserId: params.recipientUserId,
    organizationId: params.organizationId,
    type: params.type,
    title: params.title.trim(),
    message: params.message.trim(),
    relatedRequestId: params.relatedRequestId ?? null,
    read: false,
    createdAt: now,
    readAt: null,
  };

  await collection<MongoNotification>(db, "notifications").insertOne(doc);
  return toNotification(doc);
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationItem[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const userKey = objectId(userId);

  const docs = await collection<MongoNotification>(db, "notifications")
    .find({ recipientUserId: userKey })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toNotification);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const db = await getMongoDb();
  if (!db) return 0;
  return collection<MongoNotification>(db, "notifications").countDocuments({
    recipientUserId: objectId(userId),
    read: false,
  });
}

export async function markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await collection<MongoNotification>(db, "notifications").updateOne(
    { _id: objectId(notificationId), recipientUserId: objectId(userId) },
    { $set: { read: true, readAt: new Date() } },
  );
  return result.modifiedCount > 0;
}

export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const db = await getMongoDb();
  if (!db) return 0;
  const result = await collection<MongoNotification>(db, "notifications").updateMany(
    { recipientUserId: objectId(userId), read: false },
    { $set: { read: true, readAt: new Date() } },
  );
  return result.modifiedCount;
}
