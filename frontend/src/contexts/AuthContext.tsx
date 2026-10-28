import { createContext, useContext } from "react";

export type ClientRole = "admin" | "manager" | "finance" | "consultant" | "user";
export type ClientPermission =
  | "consultants.read" | "consultants.manage" | "clients.read" | "clients.manage" | "projects.read" | "projects.manage"
  | "time.read" | "time.write" | "time.submit" | "time.approve" | "metrics.utilization" | "metrics.financial" | "users.manage";

const permissions: Record<ClientRole, readonly ClientPermission[]> = {
  admin: ["consultants.read", "consultants.manage", "clients.read", "clients.manage", "projects.read", "projects.manage", "time.read", "time.write", "time.submit", "time.approve", "metrics.utilization", "metrics.financial", "users.manage"],
  manager: ["consultants.read", "consultants.manage", "clients.read", "clients.manage", "projects.read", "projects.manage", "time.read", "time.write", "time.submit", "time.approve", "metrics.utilization"],
  finance: ["consultants.read", "clients.read", "clients.manage", "projects.read", "projects.manage", "time.read", "metrics.utilization", "metrics.financial"],
  consultant: ["consultants.read", "time.read", "time.write", "time.submit", "metrics.utilization"],
  user: [],
};

export type MembershipStatus = "active" | "pending" | "rejected" | "unassigned";

export interface AuthUser {
  id: string;
  openId?: string;
  name: string | null;
  email: string | null;
  role: ClientRole;
  status?: "active" | "disabled";
  membershipStatus?: MembershipStatus;
  organizationId?: string | null;
  consultantId: string | null;
}

const AuthContext = createContext<{
  user: AuthUser | null;
  loading: boolean;
  refresh?: () => Promise<any>;
  logout?: () => Promise<void>;
}>({ user: null, loading: true });

export const AuthProvider = AuthContext.Provider;

export function useAuth() {
  const value = useContext(AuthContext);
  const isActive = Boolean(
    value.user &&
    (!value.user.membershipStatus || value.user.membershipStatus === "active") &&
    value.user.status !== "disabled"
  );
  return {
    ...value,
    isActive,
    can: (permission: ClientPermission) => Boolean(isActive && value.user && permissions[value.user.role]?.includes(permission)),
  };
}
