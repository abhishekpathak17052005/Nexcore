import { useState } from "react";
import { User, Shield, Sliders, Database, UserCheck, AlertCircle, Check, CheckCircle2, Building2, UserPlus, X, Clock, Sparkles, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PanelHeader, StatusBadge } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import type { Consultant, ReportingPeriod, UserRole } from "@/types";
import { toast } from "sonner";

interface SettingsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
}

export default function Settings({ period, onPeriodChange, consultants }: SettingsProps) {
  const { user } = useAuth();
  const [prefCurrency, setPrefCurrency] = useState("USD");
  const [prefPeriod, setPrefPeriod] = useState<ReportingPeriod>(period);
  const [targetUtilization, setTargetUtilization] = useState(75);
  const [savedMsg, setSavedMsg] = useState(false);

  // Admin user management state
  const isAdmin = user?.role === "admin";
  const usersQuery = trpc.users.list.useQuery(undefined, { enabled: isAdmin });
  const setRoleMutation = trpc.users.setRole.useMutation();
  const setStatusMutation = trpc.users.setStatus.useMutation();
  const createUserMutation = trpc.users.create.useMutation();

  // Multi-tenant Organization & Join Requests State
  const orgQuery = trpc.organizations.current.useQuery(undefined, { enabled: !!user?.organizationId });
  const requestsQuery = trpc.joinRequests.list.useQuery(undefined, { enabled: isAdmin, refetchInterval: 8000 });
  const approveMutation = trpc.joinRequests.approve.useMutation({
    onSuccess: () => {
      toast.success("Join request approved successfully.");
      requestsQuery.refetch();
      usersQuery.refetch();
      setReviewRequestId(null);
    },
    onError: (err) => {
      toast.error(err.message || "Approval failed.");
    },
  });
  const rejectMutation = trpc.joinRequests.reject.useMutation({
    onSuccess: () => {
      toast.success("Join request declined.");
      requestsQuery.refetch();
      setRejectModalId(null);
      setRejectReason("");
    },
    onError: (err) => {
      toast.error(err.message || "Rejection failed.");
    },
  });

  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  const [reviewRole, setReviewRole] = useState<UserRole>("consultant");
  const [reviewConsultantId, setReviewConsultantId] = useState<string>("");
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [requestsTab, setRequestsTab] = useState<"pending" | "history">("pending");

  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<UserRole>("user");
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>("");
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSuccess, setRoleSuccess] = useState<string | null>(null);

  // New user provisioning state
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("consultant");
  const [newUserConsultantId, setNewUserConsultantId] = useState<string>("");

  const permissions = user?.role === "admin"
    ? ["consultants.read", "consultants.manage", "clients.read", "clients.manage", "projects.read", "projects.manage", "time.read", "time.write", "time.submit", "time.approve", "metrics.utilization", "metrics.financial", "users.manage"]
    : user?.role === "manager"
    ? ["consultants.read", "consultants.manage", "clients.read", "clients.manage", "projects.read", "projects.manage", "time.read", "time.write", "time.submit", "time.approve", "metrics.utilization"]
    : user?.role === "finance"
    ? ["consultants.read", "clients.read", "clients.manage", "projects.read", "projects.manage", "time.read", "metrics.utilization", "metrics.financial"]
    : user?.role === "consultant"
    ? ["consultants.read", "time.read", "time.write", "time.submit", "metrics.utilization"]
    : [];

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    onPeriodChange(prefPeriod);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2400);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleError(null);
    setRoleSuccess(null);
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword) {
      setRoleError("Name, email, and password are required.");
      return;
    }
    if (newUserPassword.length < 8) {
      setRoleError("Password must be at least 8 characters long.");
      return;
    }
    if (newUserRole === "consultant" && !newUserConsultantId) {
      setRoleError("A consultant role requires linking a consultant record.");
      return;
    }

    try {
      await createUserMutation.mutateAsync({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        password: newUserPassword,
        role: newUserRole,
        consultantId: newUserRole === "consultant" ? newUserConsultantId : null,
      });
      await usersQuery.refetch();
      setShowCreateUser(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("consultant");
      setNewUserConsultantId("");
      setRoleSuccess(`Account created successfully for ${newUserEmail}`);
      setTimeout(() => setRoleSuccess(null), 3000);
    } catch (err: unknown) {
      setRoleError(err instanceof Error ? err.message : "Failed to create user account.");
    }
  };

  const handleToggleStatus = async (targetUser: any) => {
    setRoleError(null);
    setRoleSuccess(null);
    if (targetUser.id === user?.id) {
      setRoleError("You cannot disable your own account.");
      return;
    }
    const newStatus = targetUser.status === "disabled" ? "active" : "disabled";
    try {
      await setStatusMutation.mutateAsync({
        userId: targetUser.id,
        status: newStatus,
      });
      await usersQuery.refetch();
      setRoleSuccess(`Account ${targetUser.email || targetUser.name} marked as ${newStatus}`);
      setTimeout(() => setRoleSuccess(null), 3000);
    } catch (err: unknown) {
      setRoleError(err instanceof Error ? err.message : "Failed to update account status.");
    }
  };

  const handleUpdateRole = async (targetUser: any) => {
    setRoleError(null);
    setRoleSuccess(null);
    if (targetUser.id === user?.id) {
      setRoleError("You cannot change your own administrator role (anti-lockout rule).");
      return;
    }
    if (selectedNewRole === "consultant" && !selectedConsultantId) {
      setRoleError("A consultant role requires selecting a matching consultant record.");
      return;
    }

    try {
      await setRoleMutation.mutateAsync({
        userId: targetUser.id,
        role: selectedNewRole,
        consultantId: selectedNewRole === "consultant" ? selectedConsultantId : null,
      });
      await usersQuery.refetch();
      setActionUserId(null);
      setRoleSuccess(`Role updated to ${selectedNewRole} for ${targetUser.name || targetUser.email || targetUser.openId}`);
      setTimeout(() => setRoleSuccess(null), 3000);
    } catch (err: unknown) {
      setRoleError(err instanceof Error ? err.message : "Failed to update user role.");
    }
  };

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange}>
      <div className="dashboard-page">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">Platform governance <span className="eyebrow-dot" /></p>
            <h1>Workspace Settings</h1>
            <p className="page-subtitle">
              Current user profile, role authorization, reporting preferences, and system deployment status.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
          {/* User Profile Card */}
          <article className="panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <User size={20} color="#2B6CB0" />
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Authenticated User Profile</h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "14px" }}>
              <div>
                <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Display Name</span>
                <strong>{user?.name || "Not provided"}</strong>
              </div>
              <div>
                <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Email Address</span>
                <span>{user?.email || "No email on record"}</span>
              </div>
              <div>
                <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Assigned Role</span>
                <span className="badge" style={{ background: "#E2E8F0", fontWeight: 700, textTransform: "uppercase" }}>
                  {user?.role || "unassigned"}
                </span>
              </div>
              <div>
                <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>User ID</span>
                <code style={{ fontSize: "12px" }}>{user?.id || "Anonymous"}</code>
              </div>
              {user?.consultantId && (
                <div>
                  <span style={{ color: "#718096", display: "block", fontSize: "12px" }}>Assigned Consultant Record</span>
                  <code style={{ fontSize: "12px", color: "#2B6CB0" }}>{user.consultantId}</code>
                </div>
              )}
            </div>
          </article>

          {/* Assigned Permissions Matrix */}
          <article className="panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Shield size={20} color="#2B6CB0" />
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Active Role Permissions</h2>
            </div>

            <p style={{ fontSize: "13px", color: "#718096", marginBottom: "12px" }}>
              Permissions granted by the server authorization middleware for role: <strong>{user?.role ?? "unassigned"}</strong>.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {permissions.map((perm) => (
                <span
                  key={perm}
                  style={{
                    background: "#EBF8FF",
                    color: "#2B6CB0",
                    border: "1px solid #BEE3F8",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                  }}
                >
                  ✓ {perm}
                </span>
              ))}
              {permissions.length === 0 && (
                <span style={{ color: "#A0AEC0", fontSize: "13px" }}>
                  No business permissions assigned to this user role.
                </span>
              )}
            </div>
          </article>
        </div>

        {/* Reporting Preferences & Deployment Status */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
          {/* Preferences */}
          <article className="panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Sliders size={20} color="#2B6CB0" />
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>Reporting Preferences</h2>
            </div>

            <form onSubmit={handleSavePreferences}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Default Period</label>
                <select
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                  value={prefPeriod}
                  onChange={(e) => setPrefPeriod(e.target.value as ReportingPeriod)}
                >
                  <option value="this-month">This month</option>
                  <option value="this-week">This week</option>
                  <option value="last-month">Last month</option>
                  <option value="this-quarter">This quarter</option>
                </select>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Target Utilization Threshold (%)</label>
                <input
                  type="number"
                  min="50"
                  max="100"
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                  value={targetUtilization}
                  onChange={(e) => setTargetUtilization(Number(e.target.value))}
                />
              </div>

              <button type="submit" className="button button-primary" style={{ marginTop: "8px" }}>
                Save Preferences
              </button>
              {savedMsg && (
                <span style={{ marginLeft: "12px", color: "#38A169", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Check size={14} /> Saved!
                </span>
              )}
            </form>
          </article>

          {/* Database & Runtime Deployment Status */}
          <article className="panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <Database size={20} color="#2B6CB0" />
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>System Deployment Status</h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #EDF2F7", paddingBottom: 6 }}>
                <span style={{ color: "#718096" }}>Platform Name</span>
                <strong style={{ color: "#0F9D91" }}>Nexcore Enterprise</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #EDF2F7", paddingBottom: 6 }}>
                <span style={{ color: "#718096" }}>Backend Runtime</span>
                <strong>Node.js / Express.js / tRPC</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #EDF2F7", paddingBottom: 6 }}>
                <span style={{ color: "#718096" }}>Frontend Framework</span>
                <strong>Next.js 16 App Router (Turbopack)</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #EDF2F7", paddingBottom: 6 }}>
                <span style={{ color: "#718096" }}>Database Engine</span>
                <strong>MongoDB v8.3.1 (Local)</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #EDF2F7", paddingBottom: 6 }}>
                <span style={{ color: "#718096" }}>Database Name</span>
                <code>consultant_utilization_dashboard</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #EDF2F7", paddingBottom: 6 }}>
                <span style={{ color: "#718096" }}>Multi-Document Transactions</span>
                <span style={{ color: "#D69E2E", fontWeight: 600 }}>Standalone (Replica Set required for atomic approvals)</span>
              </div>
            </div>
          </article>
        </div>

        {/* Organization Administration & Join Requests (Admin-only) */}
        {isAdmin && (
          <>
            {/* Organization Overview */}
            <article className="panel" style={{ padding: "24px", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(14, 165, 233, 0.15)", color: "#0284C7", display: "grid", placeItems: "center" }}>
                    <Building2 size={24} />
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                      Active Organization
                    </span>
                    <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", margin: "2px 0 0" }}>
                      {orgQuery.data?.name ?? "Nexcore Technologies"}
                    </h2>
                    <span style={{ fontSize: "12px", color: "#64748B" }}>
                      Identifier: <code>{orgQuery.data?.slug ?? "nexcore-tech"}</code>
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ padding: "6px 12px", borderRadius: "9999px", background: "rgba(16, 185, 129, 0.12)", color: "#059669", fontSize: "12px", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <Shield size={14} />
                    <span>Authorized Organization Admin</span>
                  </span>
                </div>
              </div>
            </article>

            {/* Join Requests Review Panel */}
            <article className="panel" style={{ marginBottom: "24px" }}>
              <PanelHeader
                eyebrow="Access Requests"
                title="Organization Join Requests"
                detail="Review, approve, or reject employee requests to join this organization."
              />

              {/* Subtabs */}
              <div style={{ display: "flex", gap: "8px", padding: "0 20px 16px", borderBottom: "1px solid #EDF2F7" }}>
                <button
                  type="button"
                  onClick={() => setRequestsTab("pending")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 700,
                    border: "none",
                    background: requestsTab === "pending" ? "#0284C7" : "#F1F5F9",
                    color: requestsTab === "pending" ? "#fff" : "#475569",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Clock size={14} />
                  <span>Pending Requests</span>
                  <span style={{ background: requestsTab === "pending" ? "rgba(255,255,255,0.25)" : "#CBD5E1", padding: "1px 6px", borderRadius: "9999px", fontSize: "11px" }}>
                    {(requestsQuery.data ?? []).filter((r) => r.status === "PENDING").length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRequestsTab("history")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    fontSize: "13px",
                    fontWeight: 700,
                    border: "none",
                    background: requestsTab === "history" ? "#0284C7" : "#F1F5F9",
                    color: requestsTab === "history" ? "#fff" : "#475569",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Review History</span>
                  <span style={{ background: requestsTab === "history" ? "rgba(255,255,255,0.25)" : "#CBD5E1", padding: "1px 6px", borderRadius: "9999px", fontSize: "11px" }}>
                    {(requestsQuery.data ?? []).filter((r) => r.status !== "PENDING").length}
                  </span>
                </button>
              </div>

              {/* Tab Content */}
              <div style={{ overflowX: "auto", padding: "16px 20px" }}>
                {requestsTab === "pending" ? (
                  <table className="data-table" style={{ width: "100%", fontSize: "13px" }}>
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Email</th>
                        <th>Requested Role</th>
                        <th>Submitted</th>
                        <th style={{ textAlign: "right" }}>Decision Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(requestsQuery.data ?? []).filter((r) => r.status === "PENDING").map((req) => (
                        <tr key={req.id}>
                          <td>
                            <strong>{req.userName}</strong>
                          </td>
                          <td>
                            <code style={{ fontSize: "12px", background: "#F8FAFC", padding: "2px 6px", borderRadius: "4px" }}>
                              {req.userEmail}
                            </code>
                          </td>
                          <td>
                            <span style={{ textTransform: "capitalize", fontWeight: 600, color: "#0284C7" }}>
                              {req.requestedRole}
                            </span>
                          </td>
                          <td style={{ color: "#64748B", fontSize: "12px" }}>
                            {new Date(req.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {reviewRequestId === req.id ? (
                              <div style={{ display: "inline-flex", gap: "8px", alignItems: "center", background: "#F8FAFC", padding: "6px 10px", borderRadius: "8px", border: "1px solid #E2E8F0" }}>
                                <select
                                  value={reviewRole}
                                  onChange={(e) => setReviewRole(e.target.value as any)}
                                  style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px", border: "1px solid #CBD5E0" }}
                                >
                                  <option value="consultant">Consultant</option>
                                  <option value="manager">Manager</option>
                                  <option value="finance">Finance</option>
                                  <option value="admin">Admin</option>
                                </select>

                                {reviewRole === "consultant" && (
                                  <select
                                    value={reviewConsultantId}
                                    onChange={(e) => setReviewConsultantId(e.target.value)}
                                    style={{ padding: "4px 8px", fontSize: "12px", borderRadius: "4px", border: "1px solid #CBD5E0" }}
                                  >
                                    <option value="">Link consultant record...</option>
                                    {consultants.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                )}

                                <button
                                  type="button"
                                  disabled={approveMutation.isPending}
                                  className="button button-primary"
                                  style={{ padding: "4px 10px", fontSize: "12px" }}
                                  onClick={() => {
                                    approveMutation.mutate({
                                      requestId: req.id,
                                      assignedRole: reviewRole,
                                      consultantId: reviewRole === "consultant" ? reviewConsultantId || null : null,
                                    });
                                  }}
                                >
                                  Confirm Approval
                                </button>
                                <button
                                  type="button"
                                  className="button button-quiet"
                                  style={{ padding: "4px 8px", fontSize: "12px" }}
                                  onClick={() => setReviewRequestId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                                <button
                                  type="button"
                                  className="button button-primary"
                                  style={{ padding: "4px 12px", fontSize: "12px", background: "#059669" }}
                                  onClick={() => {
                                    setReviewRequestId(req.id);
                                    setReviewRole(req.requestedRole || "consultant");
                                    setReviewConsultantId("");
                                  }}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="button button-quiet"
                                  style={{ padding: "4px 12px", fontSize: "12px", color: "#E11D48" }}
                                  onClick={() => setRejectModalId(req.id)}
                                >
                                  Decline
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(requestsQuery.data ?? []).filter((r) => r.status === "PENDING").length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", color: "#94A3B8", padding: "32px" }}>
                            No pending join requests for this organization. New applicant requests will appear here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="data-table" style={{ width: "100%", fontSize: "13px" }}>
                    <thead>
                      <tr>
                        <th>Applicant</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Reviewed At</th>
                        <th>Decision / Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(requestsQuery.data ?? []).filter((r) => r.status !== "PENDING").map((req) => (
                        <tr key={req.id}>
                          <td>
                            <strong>{req.userName}</strong>
                          </td>
                          <td>
                            <code style={{ fontSize: "12px", background: "#F8FAFC", padding: "2px 6px", borderRadius: "4px" }}>
                              {req.userEmail}
                            </code>
                          </td>
                          <td>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background:
                                  req.status === "APPROVED"
                                    ? "rgba(16, 185, 129, 0.15)"
                                    : req.status === "REJECTED"
                                    ? "rgba(244, 63, 94, 0.15)"
                                    : "#F1F5F9",
                                color:
                                  req.status === "APPROVED"
                                    ? "#059669"
                                    : req.status === "REJECTED"
                                    ? "#E11D48"
                                    : "#64748B",
                              }}
                            >
                              {req.status}
                            </span>
                          </td>
                          <td style={{ color: "#64748B", fontSize: "12px" }}>
                            {req.reviewedAt
                              ? new Date(req.reviewedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                              : "—"}
                          </td>
                          <td style={{ color: "#475569", fontSize: "12px" }}>
                            {req.status === "REJECTED"
                              ? req.rejectionReason || "No explicit reason specified"
                              : req.status === "APPROVED"
                              ? `Approved as ${req.requestedRole}`
                              : "Withdrawn by applicant"}
                          </td>
                        </tr>
                      ))}
                      {(requestsQuery.data ?? []).filter((r) => r.status !== "PENDING").length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: "center", color: "#94A3B8", padding: "32px" }}>
                            No prior join requests recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </article>

            {/* Reject Modal */}
            {rejectModalId && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(15, 23, 42, 0.7)",
                  backdropFilter: "blur(4px)",
                  display: "grid",
                  placeItems: "center",
                  zIndex: 9999,
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: "16px",
                    maxWidth: "460px",
                    width: "100%",
                    padding: "24px",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0F172A" }}>
                      Decline Join Request
                    </h3>
                    <button
                      type="button"
                      onClick={() => setRejectModalId(null)}
                      style={{ background: "transparent", border: "none", cursor: "pointer", color: "#94A3B8" }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <p style={{ fontSize: "13px", color: "#64748B", lineHeight: "1.5", marginBottom: "16px" }}>
                    Please provide an optional reason for declining this request. The applicant will receive a persistent in-app notification.
                  </p>

                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Position already filled, role credentials not verified..."
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "13px",
                      marginBottom: "20px",
                      resize: "vertical",
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => setRejectModalId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={rejectMutation.isPending}
                      className="button button-primary"
                      style={{ background: "#E11D48" }}
                      onClick={() => {
                        rejectMutation.mutate({
                          requestId: rejectModalId,
                          reason: rejectReason.trim() || undefined,
                        });
                      }}
                    >
                      {rejectMutation.isPending ? "Declining..." : "Decline Request"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Administrative User Role Management (Admin-only) */}
        {isAdmin && (
          <article className="panel">
            <PanelHeader
              eyebrow="Administrative Control"
              title="User & Role Management"
              detail="Assign enterprise access roles (Admin, Manager, Finance, Consultant, Unassigned)"
            />

            {roleError && (
              <div style={{ margin: "0 20px 16px 20px", background: "#FFF5F5", color: "#C53030", padding: "12px", borderRadius: 4, fontSize: "13px" }}>
                {roleError}
              </div>
            )}
            {roleSuccess && (
              <div style={{ margin: "0 20px 16px 20px", background: "#F0FFF4", color: "#22543D", padding: "12px", borderRadius: 4, fontSize: "13px" }}>
                {roleSuccess}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px 16px 20px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Authorized User Accounts</h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#718096" }}>
                  Manage account access, enterprise roles, and account active/disabled states.
                </p>
              </div>
              <button
                className="button button-primary"
                onClick={() => setShowCreateUser(true)}
                style={{ display: "inline-flex", gap: "6px", alignItems: "center", fontSize: "12px", padding: "6px 14px" }}
              >
                + Provision New User
              </button>
            </div>

            {/* Create User Form Drawer/Panel */}
            {showCreateUser && (
              <div style={{ margin: "0 20px 20px 20px", padding: "18px", border: "1px solid #CBD5E0", borderRadius: "8px", background: "#F7FAFC" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <strong style={{ fontSize: "14px", color: "#2D3748" }}>Provision User Account</strong>
                  <button className="button button-quiet" style={{ padding: "2px 8px" }} onClick={() => setShowCreateUser(false)}>✕ Cancel</button>
                </div>
                <form onSubmit={handleCreateUser} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#4A5568", marginBottom: "4px" }}>Full Name</label>
                    <input
                      type="text"
                      style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: 4, border: "1px solid #CBD5E0" }}
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Jane Doe"
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#4A5568", marginBottom: "4px" }}>Email</label>
                    <input
                      type="email"
                      style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: 4, border: "1px solid #CBD5E0" }}
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="jane@company.com"
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#4A5568", marginBottom: "4px" }}>Password (min 8 chars)</label>
                    <input
                      type="password"
                      style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: 4, border: "1px solid #CBD5E0" }}
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#4A5568", marginBottom: "4px" }}>Assigned Role</label>
                    <select
                      style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: 4, border: "1px solid #CBD5E0", background: "#fff" }}
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    >
                      <option value="admin">admin</option>
                      <option value="manager">manager</option>
                      <option value="finance">finance</option>
                      <option value="consultant">consultant</option>
                      <option value="user">user (unassigned)</option>
                    </select>
                  </div>
                  {newUserRole === "consultant" && (
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#4A5568", marginBottom: "4px" }}>Consultant Record</label>
                      <select
                        style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: 4, border: "1px solid #CBD5E0", background: "#fff" }}
                        value={newUserConsultantId}
                        onChange={(e) => setNewUserConsultantId(e.target.value)}
                        required
                      >
                        <option value="">Select consultant...</option>
                        {consultants.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={createUserMutation.isPending}
                      style={{ padding: "6px 16px", fontSize: "13px" }}
                    >
                      {createUserMutation.isPending ? "Creating..." : "Save User"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Current Role</th>
                    <th>Status</th>
                    <th>Linked Consultant</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(usersQuery.data ?? []).map((u) => {
                    const isSelf = u.id === user?.id;
                    const isEditing = actionUserId === u.id;
                    const userStatus = u.status ?? "active";

                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name || "Anonymous User"}</strong>
                          <div style={{ fontSize: "11px", color: "#718096" }}>{u.openId}</div>
                        </td>
                        <td>{u.email || "—"}</td>
                        <td>
                          <span className="badge" style={{ textTransform: "uppercase" }}>{u.role}</span>
                          {isSelf && <span style={{ marginLeft: 6, fontSize: "11px", color: "#718096" }}>(You)</span>}
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              background: userStatus === "active" ? "#DEF7EC" : "#FDE8E8",
                              color: userStatus === "active" ? "#03543F" : "#9B1C1C",
                            }}
                          >
                            {userStatus}
                          </span>
                        </td>
                        <td>
                          {u.consultantId ? (
                            consultants.find((c) => c.id === u.consultantId)?.name ?? u.consultantId
                          ) : (
                            <span style={{ color: "#A0AEC0" }}>None</span>
                          )}
                        </td>
                        <td>
                          {isSelf ? (
                            <span style={{ fontSize: "12px", color: "#A0AEC0" }}>Role locked (Anti-lockout)</span>
                          ) : isEditing ? (
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <select
                                style={{ padding: "4px 8px", fontSize: "12px", borderRadius: 4, border: "1px solid #CBD5E0" }}
                                value={selectedNewRole}
                                onChange={(e) => setSelectedNewRole(e.target.value as UserRole)}
                              >
                                <option value="admin">admin</option>
                                <option value="manager">manager</option>
                                <option value="finance">finance</option>
                                <option value="consultant">consultant</option>
                                <option value="user">user</option>
                              </select>

                              {selectedNewRole === "consultant" && (
                                <select
                                  style={{ padding: "4px 8px", fontSize: "12px", borderRadius: 4, border: "1px solid #CBD5E0" }}
                                  value={selectedConsultantId}
                                  onChange={(e) => setSelectedConsultantId(e.target.value)}
                                >
                                  <option value="">Select consultant...</option>
                                  {consultants.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              )}

                              <button className="button button-primary" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => handleUpdateRole(u)}>
                                Save
                              </button>
                              <button className="button button-quiet" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => setActionUserId(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <button
                                className="button button-quiet"
                                style={{ padding: "4px 10px", fontSize: "12px" }}
                                onClick={() => {
                                  setActionUserId(u.id);
                                  setSelectedNewRole(u.role);
                                  setSelectedConsultantId(u.consultantId ?? "");
                                }}
                              >
                                Change Role
                              </button>
                              <button
                                className="button button-quiet"
                                style={{
                                  padding: "4px 10px",
                                  fontSize: "12px",
                                  color: userStatus === "active" ? "#C53030" : "#22543D",
                                }}
                                onClick={() => handleToggleStatus(u)}
                              >
                                {userStatus === "active" ? "Disable" : "Enable"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(usersQuery.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", color: "#A0AEC0", padding: "20px" }}>
                        No user accounts recorded in database yet. Click &quot;Provision New User&quot; to add an account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        )}
      </div>
    </AppShell>
  );
}
