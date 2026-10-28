import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  FileQuestion,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserCheck,
  XCircle,
} from "lucide-react";

export function PendingApprovalView() {
  const [, setLocation] = useLocation();
  const { user, refresh, logout } = useAuth();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const { data: request, isLoading, refetch } = trpc.joinRequests.myRequest.useQuery(undefined, {
    refetchInterval: 6000,
  });

  const { data: notifications = [] } = trpc.notifications.list.useQuery({ limit: 10 });

  const withdrawMutation = trpc.joinRequests.withdraw.useMutation({
    onSuccess: async () => {
      toast.success("Join request withdrawn successfully.");
      if (refresh) await refresh();
      setLocation("/onboarding");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to withdraw request.");
    },
  });

  const handleRefresh = async () => {
    toast.info("Checking membership status...");
    await refetch();
    if (refresh) {
      const res = await refresh();
      if (res?.membershipStatus === "active") {
        toast.success("Welcome aboard! Your membership has been approved.");
        setLocation("/");
      }
    }
  };

  const handleWithdraw = () => {
    if (!request?.id) return;
    withdrawMutation.mutate({ requestId: request.id });
  };

  const handleSignOut = async () => {
    if (logout) await logout();
    setLocation("/");
  };

  const isRejected = user?.membershipStatus === "rejected" || request?.status === "REJECTED";

  return (
    <div className="landing-container" style={{ minHeight: "100vh", padding: "40px 20px", background: "#F8FAFC" }}>
      {/* Top Bar */}
      <header
        style={{
          maxWidth: "880px",
          margin: "0 auto 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
              display: "grid",
              placeItems: "center",
              color: "#FFFFFF",
              fontWeight: 850,
              fontSize: "16px",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
            }}
          >
            N
          </div>
          <div>
            <h1 style={{ fontSize: "19px", fontWeight: 850, color: "#0F172A", margin: 0, letterSpacing: "0.02em" }}>
              NEXCORE
            </h1>
            <span style={{ fontSize: "11px", color: "#64748B", letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 650 }}>
              Workforce Operations Console
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={handleRefresh}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#FFFFFF",
              color: "#1E293B",
              border: "1px solid #CBD5E1",
              borderRadius: "8px",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={14} className={isLoading ? "spin" : ""} />
            <span>Check Status</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#FFFFFF",
              color: "#475569",
              border: "1px solid #CBD5E1",
              borderRadius: "8px",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
              cursor: "pointer",
            }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Card - Secondary Pure White Card */}
      <main style={{ maxWidth: "880px", margin: "0 auto" }}>
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "20px",
            border: "1px solid #E2E8F0",
            boxShadow: "0 20px 45px -10px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04)",
            padding: "42px 36px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Status Banner */}
          <div style={{ textAlign: "center", marginBottom: "34px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 18px",
                borderRadius: "9999px",
                background: isRejected ? "#FEF2F2" : "#FFFBEB",
                border: `1px solid ${isRejected ? "#FECACA" : "#FDE68A"}`,
                color: isRejected ? "#B91C1C" : "#B45309",
                fontWeight: 700,
                fontSize: "12px",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginBottom: "20px",
              }}
            >
              {isRejected ? <XCircle size={15} /> : <Clock size={15} />}
              <span>{isRejected ? "Membership Request Declined" : "Membership Pending Administrator Approval"}</span>
            </div>

            <h2 style={{ fontSize: "28px", fontWeight: 850, color: "#0F172A", marginBottom: "12px", letterSpacing: "-0.02em" }}>
              {isRejected
                ? "Your Join Request Was Declined"
                : `Awaiting Approval: ${request?.organizationName ?? "Organization"}`}
            </h2>

            <p style={{ color: "#475569", fontSize: "15px", maxWidth: "600px", margin: "0 auto", lineHeight: "1.6" }}>
              {isRejected
                ? "The organization administrator has reviewed and declined this membership request. You can join a different organization or register your own company below."
                : "Your request has been delivered to the organization administrator's persistent review console. Once approved, your operational dashboard, capacity reports, and project time logs will activate instantly."}
            </p>
          </div>

          {/* Details Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              marginBottom: "34px",
              background: "#F8FAFC",
              border: "1px solid #E2E8F0",
              borderRadius: "14px",
              padding: "20px 24px",
            }}
          >
            <div>
              <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                Applicant Name
              </span>
              <p style={{ color: "#0F172A", fontWeight: 700, fontSize: "15px", marginTop: "4px", margin: "4px 0 0" }}>
                {user?.name ?? "Employee"}
              </p>
            </div>

            <div>
              <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                Applicant Email
              </span>
              <p style={{ color: "#0F172A", fontWeight: 650, fontSize: "15px", marginTop: "4px", margin: "4px 0 0" }}>
                {user?.email ?? ""}
              </p>
            </div>

            <div>
              <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                Target Organization
              </span>
              <p style={{ color: "#2563EB", fontWeight: 800, fontSize: "15px", marginTop: "4px", margin: "4px 0 0" }}>
                {request?.organizationName ?? "Pending selection"}
              </p>
            </div>

            <div>
              <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>
                Requested Role
              </span>
              <p style={{ color: "#0F172A", fontWeight: 700, fontSize: "15px", marginTop: "4px", margin: "4px 0 0", textTransform: "capitalize" }}>
                {request?.requestedRole ?? "Consultant"}
              </p>
            </div>
          </div>

          {/* Rejection Reason if any */}
          {isRejected && request?.rejectionReason && (
            <div
              style={{
                marginBottom: "32px",
                padding: "16px 20px",
                borderRadius: "12px",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
              }}
            >
              <h4 style={{ fontSize: "13px", fontWeight: 700, marginBottom: "4px", color: "#B91C1C" }}>
                Reason Provided by Administrator:
              </h4>
              <p style={{ fontSize: "13px", lineHeight: "1.5", margin: 0 }}>{request.rejectionReason}</p>
            </div>
          )}

          {/* Workflow Steps Preview */}
          {!isRejected && (
            <div style={{ marginBottom: "34px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 750, color: "#475569", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Application Milestones
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                <div style={{ padding: "18px", borderRadius: "12px", background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                  <div style={{ color: "#2563EB", marginBottom: "8px" }}><CheckCircle2 size={20} /></div>
                  <strong style={{ display: "block", color: "#0F172A", fontSize: "14px", marginBottom: "4px" }}>1. Account Created</strong>
                  <span style={{ color: "#475569", fontSize: "12px" }}>Secure credentials and profile established.</span>
                </div>
                <div style={{ padding: "18px", borderRadius: "12px", background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  <div style={{ color: "#D97706", marginBottom: "8px" }}><Clock size={20} /></div>
                  <strong style={{ display: "block", color: "#0F172A", fontSize: "14px", marginBottom: "4px" }}>2. Admin Review</strong>
                  <span style={{ color: "#475569", fontSize: "12px" }}>Administrator notified via persistent alerts.</span>
                </div>
                <div style={{ padding: "18px", borderRadius: "12px", background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                  <div style={{ color: "#94A3B8", marginBottom: "8px" }}><UserCheck size={20} /></div>
                  <strong style={{ display: "block", color: "#64748B", fontSize: "14px", marginBottom: "4px" }}>3. Dashboard Access</strong>
                  <span style={{ color: "#64748B", fontSize: "12px" }}>Full access to projects and timesheets.</span>
                </div>
              </div>
            </div>
          )}

          {/* Recent Persistent Notifications */}
          {notifications.length > 0 && (
            <div style={{ marginBottom: "32px", borderTop: "1px solid #E2E8F0", paddingTop: "24px" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 750, color: "#64748B", marginBottom: "14px", textTransform: "uppercase" }}>
                Recent In-App Notifications
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {notifications.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "10px",
                      background: "#F8FAFC",
                      border: "1px solid #E2E8F0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <p style={{ color: "#0F172A", fontSize: "13px", fontWeight: 650, margin: 0 }}>{item.title}</p>
                      <p style={{ color: "#475569", fontSize: "12px", margin: "2px 0 0" }}>{item.message}</p>
                    </div>
                    <span style={{ fontSize: "11px", color: "#64748B" }}>
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid #E2E8F0",
              paddingTop: "24px",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            {isRejected ? (
              <div style={{ display: "flex", gap: "12px", width: "100%", justifyContent: "center" }}>
                <Link
                  href="/onboarding"
                  className="btn-auth-submit"
                  style={{ display: "inline-flex", padding: "11px 26px" }}
                >
                  <Compass size={16} style={{ marginRight: "8px" }} />
                  Choose Another Organization
                </Link>
              </div>
            ) : (
              <>
                <div style={{ fontSize: "13px", color: "#64748B" }}>
                  <span>Made a mistake or applied to the wrong company?</span>
                </div>

                <div>
                  {!confirmWithdraw ? (
                    <button
                      type="button"
                      onClick={() => setConfirmWithdraw(true)}
                      style={{
                        background: "#FFF1F2",
                        border: "1px solid #FECDD3",
                        color: "#E11D48",
                        padding: "8px 16px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: 650,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <Trash2 size={14} />
                      <span>Withdraw Request</span>
                    </button>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#E11D48", fontSize: "12px", fontWeight: 650 }}>Are you sure?</span>
                      <button
                        type="button"
                        onClick={handleWithdraw}
                        disabled={withdrawMutation.isPending}
                        style={{
                          background: "#E11D48",
                          border: "none",
                          color: "#FFFFFF",
                          padding: "7px 14px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {withdrawMutation.isPending ? "Withdrawing..." : "Yes, Withdraw"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmWithdraw(false)}
                        style={{
                          background: "#FFFFFF",
                          border: "1px solid #CBD5E1",
                          color: "#475569",
                          padding: "7px 12px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
