import { TRPCError } from "@trpc/server";
import type { User } from "./types";

export type Role = "admin" | "manager" | "finance" | "consultant" | "user";
export type Permission =
  | "consultants.read"
  | "consultants.manage"
  | "clients.read"
  | "clients.manage"
  | "projects.read"
  | "projects.manage"
  | "time.read"
  | "time.write"
  | "time.submit"
  | "time.approve"
  | "metrics.utilization"
  | "metrics.financial"
  | "users.manage";

const rolePermissions: Record<Role, readonly Permission[]> = {
  admin: [
    "consultants.read", "consultants.manage", "clients.read", "clients.manage", "projects.read", "projects.manage",
    "time.read", "time.write", "time.submit", "time.approve", "metrics.utilization", "metrics.financial", "users.manage",
  ],
  manager: [
    "consultants.read", "consultants.manage", "clients.read", "clients.manage", "projects.read", "projects.manage",
    "time.read", "time.write", "time.submit", "time.approve", "metrics.utilization",
  ],
  finance: [
    "consultants.read", "clients.read", "clients.manage", "projects.read", "projects.manage", "time.read",
    "metrics.utilization", "metrics.financial",
  ],
  consultant: ["consultants.read", "time.read", "time.write", "time.submit", "metrics.utilization"],
  user: [],
};

export function hasPermission(role: Role | undefined, permission: Permission) {
  return role ? rolePermissions[role]?.includes(permission) ?? false : false;
}

export function permissionsFor(role: Role | undefined) {
  return role ? [...(rolePermissions[role] ?? [])] : [];
}

export function assertActiveOrganizationMember(user: User) {
  if (user.status === "disabled") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your account is disabled. Contact administrator." });
  }
  if (user.membershipStatus === "pending") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your organization membership is pending administrator approval.",
    });
  }
  if (user.membershipStatus === "rejected") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your organization membership request was rejected.",
    });
  }
  if (user.membershipStatus === "unassigned") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must join or create an organization to access this resource.",
    });
  }
}

export function assertPermission(user: User, permission: Permission) {
  assertActiveOrganizationMember(user);
  if (!hasPermission(user.role, permission)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to perform this action." });
  }
}

export function assertOrganizationScope(user: User, resourceOrgId: string | null | undefined) {
  assertActiveOrganizationMember(user);
  if (resourceOrgId && user.organizationId && user.organizationId !== resourceOrgId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Cross-organization data access is strictly prohibited." });
  }
}

export function assertRecordScope(user: User, consultantId: string | undefined) {
  assertActiveOrganizationMember(user);
  if (user.role === "admin" || user.role === "manager" || user.role === "finance") return;
  if (user.role === "consultant") {
    if (!user.consultantId || !consultantId || user.consultantId !== consultantId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "This record is outside your permitted scope." });
    }
    return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to access this record." });
}

export function assertNotSelfApproval(user: User, createdBy: string) {
  if (user.id === createdBy) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot approve or reject your own time entry." });
  }
}

export function isSupportedRole(value: unknown): value is Role {
  return value === "admin" || value === "manager" || value === "finance" || value === "consultant" || value === "user";
}
