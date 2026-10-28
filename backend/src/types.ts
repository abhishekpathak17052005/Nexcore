import type { ObjectId } from "mongodb";

export type UserRole = "admin" | "manager" | "finance" | "consultant" | "user";
export type UserStatus = "active" | "disabled";
export type MembershipStatus = "active" | "pending" | "rejected" | "unassigned";
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
export type NotificationType = "JOIN_REQUEST_SUBMITTED" | "JOIN_REQUEST_APPROVED" | "JOIN_REQUEST_REJECTED" | "SYSTEM";

export interface User {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: UserRole;
  status?: UserStatus;
  organizationId?: string | null;
  membershipStatus?: MembershipStatus;
  consultantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export interface InsertUser {
  openId: string;
  name?: string | null;
  email?: string | null;
  passwordHash?: string | null;
  passwordSalt?: string | null;
  status?: UserStatus;
  organizationId?: string | null;
  membershipStatus?: MembershipStatus;
  loginMethod?: string | null;
  role?: UserRole;
  consultantId?: string | null;
  lastSignedIn?: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JoinRequest {
  id: string;
  organizationId: string;
  organizationName?: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedRole: UserRole;
  status: JoinRequestStatus;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationItem {
  id: string;
  recipientUserId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedRequestId?: string | null;
  read: boolean;
  createdAt: Date;
  readAt?: Date | null;
}

export interface MongoUserRecord extends Omit<User, "id"> {
  _id: ObjectId;
}
