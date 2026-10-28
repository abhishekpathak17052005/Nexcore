import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import {
  ShieldCheck,
  Clock,
  Gauge,
  FileBarChart2,
  Users,
  CheckCircle2,
  Lock,
  ArrowRight,
  Sparkles,
  Building,
  Building2,
  KeyRound,
  AlertCircle,
  Loader2,
  LogIn,
  UserCheck,
  UserPlus,
  Compass,
  Search,
  Hash,
} from "lucide-react";

interface LandingPageProps {
  onSignInSuccess?: () => void;
}

export default function LandingPage({ onSignInSuccess }: LandingPageProps) {
  const [, setLocation] = useLocation();
  const { user, refresh } = useAuth();

  // Dialog / Modal state
  const [authMode, setAuthMode] = useState<"none" | "login" | "setup" | "registerOrg" | "employeeSignup">("none");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminName, setAdminName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Register Org State
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgDesc, setOrgDesc] = useState("");

  // Employee Signup State
  const [employeeName, setEmployeeName] = useState("");
  const [searchOrgQuery, setSearchOrgQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [requestedRole, setRequestedRole] = useState<"consultant" | "manager" | "finance">("consultant");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchOrgQuery.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchOrgQuery]);

  const canSetupQuery = trpc.auth.canSetupAdmin.useQuery();
  const { data: searchOrgs = [], isLoading: searchLoading } = trpc.organizations.search.useQuery(
    { query: debouncedSearch, limit: 5 },
    { enabled: authMode === "employeeSignup" }
  );

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      setErrorMessage(null);
      setAuthMode("none");
      if (refresh) await refresh();
      if (onSignInSuccess) onSignInSuccess();
      setLocation("/");
    },
    onError: (error) => {
      setErrorMessage(error.message || "Invalid credentials. Please verify your email and password.");
    },
  });

  const setupAdminMutation = trpc.auth.setupAdmin.useMutation({
    onSuccess: async () => {
      setErrorMessage(null);
      setAuthMode("none");
      if (refresh) await refresh();
      if (onSignInSuccess) onSignInSuccess();
      setLocation("/");
    },
    onError: (error) => {
      setErrorMessage(error.message || "Failed to initialize administrator account.");
    },
  });

  const registerOrgMutation = trpc.auth.registerOrganization.useMutation({
    onSuccess: async () => {
      setErrorMessage(null);
      setAuthMode("none");
      if (refresh) await refresh();
      if (onSignInSuccess) onSignInSuccess();
      setLocation("/");
    },
    onError: (error) => {
      setErrorMessage(error.message || "Failed to register organization.");
    },
  });

  const employeeSignupMutation = trpc.auth.signup.useMutation({
    onSuccess: async () => {
      setErrorMessage(null);
      setAuthMode("none");
      if (refresh) await refresh();
      if (onSignInSuccess) onSignInSuccess();
      setLocation("/");
    },
    onError: (error) => {
      setErrorMessage(error.message || "Failed to create employee account.");
    },
  });

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email.trim() || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }
    await loginMutation.mutateAsync({ email: email.trim(), password });
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!adminName.trim() || !email.trim() || !password) {
      setErrorMessage("Please fill in all administrator setup fields.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    await setupAdminMutation.mutateAsync({
      name: adminName.trim(),
      email: email.trim(),
      password,
    });
  };

  const handleRegisterOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!orgName.trim() || !orgSlug.trim() || !adminName.trim() || !email.trim() || !password) {
      setErrorMessage("Please fill in all organization and administrator details.");
      return;
    }
    await registerOrgMutation.mutateAsync({
      organizationName: orgName.trim(),
      organizationSlug: orgSlug.trim(),
      description: orgDesc.trim() || undefined,
      adminName: adminName.trim(),
      adminEmail: email.trim(),
      password,
    });
  };

  const handleEmployeeSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!employeeName.trim() || !email.trim() || !password) {
      setErrorMessage("Please enter your name, email, and password.");
      return;
    }
    await employeeSignupMutation.mutateAsync({
      name: employeeName.trim(),
      email: email.trim(),
      password,
      organizationId: selectedOrg?.id,
      requestedRole,
    });
  };

  return (
    <div className="landing-container">
      {/* Top Navigation */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <div className="landing-brand">
            <span className="brand-badge">
              <span className="brand-dot" />
            </span>
            <div className="brand-titles">
              <span className="brand-name">NEXCORE</span>
              <span className="brand-tagline">Consultant Operations & Analytics</span>
            </div>
          </div>

          <nav className="landing-nav-actions">
            {user ? (
              <Link href="/" className="btn-primary-glow">
                Go to Dashboard
                <ArrowRight size={16} />
              </Link>
            ) : (
              <>
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    setAuthMode("registerOrg");
                  }}
                  className="btn-ghost-cyan"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Building2 size={15} />
                  <span>Create Organization</span>
                </button>
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    setAuthMode("employeeSignup");
                  }}
                  className="btn-ghost-cyan"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Compass size={15} />
                  <span>Join as Employee</span>
                </button>
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    setAuthMode("login");
                  }}
                  className="btn-primary-glow"
                >
                  <LogIn size={16} />
                  Sign In
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-content">
          <div className="hero-pill">
            <Sparkles size={14} className="text-blue-600" />
            <span>Consultant Operations Platform</span>
          </div>

          <h1 className="hero-headline">
            Manage Resources. <br />
            <span className="headline-gradient">Maximize Performance.</span>
          </h1>

          <p className="hero-subtext" style={{ textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
            Track consultant utilization, manage approvals, and monitor estimated revenue—all in one place.
          </p>

          <div className="hero-cta-group">
            {user ? (
              <Link href="/" className="btn-hero-primary">
                Return to Executive Workspace
                <ArrowRight size={18} />
              </Link>
            ) : (
              <>
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    setAuthMode("registerOrg");
                  }}
                  className="btn-hero-primary"
                >
                  Create an Organization
                  <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => {
                    setErrorMessage(null);
                    setAuthMode("employeeSignup");
                  }}
                  className="btn-hero-secondary"
                >
                  <Compass size={18} />
                  Join a Team
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Interactive-Feeling Executive Operations Preview (Secondary Pure White Surface) */}
        <div
          style={{
            width: "100%",
            maxWidth: "1060px",
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: "20px",
            boxShadow: "0 20px 45px -10px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.05)",
            padding: "24px 28px",
            margin: "0 auto 36px",
            textAlign: "left",
          }}
        >
          {/* Header of preview card */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #F1F5F9", paddingBottom: "16px", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#EFF6FF", border: "1px solid #DBEAFE", display: "grid", placeItems: "center", color: "#2563EB", fontWeight: 800, fontSize: "14px" }}>
                NX
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#0F172A" }}>Apex Horizon Practice • Executive Operations Console</h4>
                <span style={{ fontSize: "12px", color: "#64748B" }}>Active reporting window: <strong>Current Period (Q4 2026)</strong></span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 650, color: "#10B981", background: "#ECFDF5", border: "1px solid #A7F3D0", padding: "4px 10px", borderRadius: "9999px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10B981" }} />
                All Systems Synced
              </span>
              <span style={{ fontSize: "12px", color: "#64748B", background: "#F8FAFC", border: "1px solid #E2E8F0", padding: "4px 10px", borderRadius: "8px" }}>
                Multi-Tenant Scoped
              </span>
            </div>
          </div>

          {/* Metric Chips Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px" }}>
              <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Billable Utilization</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                <strong style={{ fontSize: "22px", fontWeight: 850, color: "#0F172A" }}>94.2%</strong>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#10B981" }}>+4.1% vs target</span>
              </div>
            </div>
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px" }}>
              <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Period Logged Hours</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                <strong style={{ fontSize: "22px", fontWeight: 850, color: "#0F172A" }}>480.0h</strong>
                <span style={{ fontSize: "11px", color: "#64748B" }}>of 510h capacity</span>
              </div>
            </div>
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px" }}>
              <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Estimated Revenue</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                <strong style={{ fontSize: "22px", fontWeight: 850, color: "#2563EB" }}>$142,850</strong>
                <span style={{ fontSize: "11px", color: "#64748B" }}>USD blended</span>
              </div>
            </div>
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px 16px" }}>
              <span style={{ fontSize: "11px", color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Approval Governance</span>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "4px" }}>
                <strong style={{ fontSize: "22px", fontWeight: 850, color: "#10B981" }}>100%</strong>
                <span style={{ fontSize: "11px", color: "#64748B" }}>0 unreviewed</span>
              </div>
            </div>
          </div>

          {/* Sample Active Consultants Table */}
          <div style={{ border: "1px solid #E2E8F0", borderRadius: "12px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", textAlign: "left" }}>
                  <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Consultant Practitioner</th>
                  <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Role & Practice</th>
                  <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Logged / Target</th>
                  <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Rate Lock</th>
                  <th style={{ padding: "10px 14px", fontWeight: 700, color: "#475569" }}>Governance Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0F172A" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#DBEAFE", color: "#1D4ED8", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 800 }}>MV</div>
                      <span>Marcus Vance</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>Principal Cloud Architect</td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 700, color: "#0F172A" }}>38.5h / 40.0h</span>
                      <span style={{ fontSize: "11px", color: "#10B981", fontWeight: 700 }}>96%</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", fontWeight: 650, color: "#0F172A" }}>$185/hr <small style={{ color: "#64748B" }}>USD</small></td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "6px", background: "#ECFDF5", color: "#059669", fontSize: "11px", fontWeight: 700 }}>
                      <CheckCircle2 size={12} /> Approved
                    </span>
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0F172A" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#F3E8FF", color: "#7E22CE", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 800 }}>ER</div>
                      <span>Elena Rostova</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>Lead Strategy Director</td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 700, color: "#0F172A" }}>40.0h / 40.0h</span>
                      <span style={{ fontSize: "11px", color: "#10B981", fontWeight: 700 }}>100%</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", fontWeight: 650, color: "#0F172A" }}>€195/hr <small style={{ color: "#64748B" }}>EUR</small></td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "6px", background: "#ECFDF5", color: "#059669", fontSize: "11px", fontWeight: 700 }}>
                      <CheckCircle2 size={12} /> Approved
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0F172A" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#FEF3C7", color: "#B45309", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: 800 }}>DC</div>
                      <span>David Cho</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#475569" }}>Data Systems Consultant</td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 700, color: "#0F172A" }}>32.0h / 36.0h</span>
                      <span style={{ fontSize: "11px", color: "#3B82F6", fontWeight: 700 }}>89%</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", fontWeight: 650, color: "#0F172A" }}>$160/hr <small style={{ color: "#64748B" }}>USD</small></td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "6px", background: "#EFF6FF", color: "#2563EB", fontSize: "11px", fontWeight: 700 }}>
                      <Clock size={12} /> In Review
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Hero Architectural Highlights (Secondary Pure White Cards) */}
        <div className="hero-stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrap"><Users size={22} /></div>
            <div className="stat-info">
              <h3>Capacity Planning</h3>
              <p>Dynamic business-day calendar calculations & workload forecasting</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrap"><Clock size={22} /></div>
            <div className="stat-info">
              <h3>Precision Tracking</h3>
              <p>Granular project tracking with strict self-approval prevention</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrap"><Gauge size={22} /></div>
            <div className="stat-info">
              <h3>Utilization Insights</h3>
              <p>Target vs. billable variance monitoring across practice departments</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon-wrap"><FileBarChart2 size={22} /></div>
            <div className="stat-info">
              <h3>Multi-Currency Billing</h3>
              <p>Historical rate snapshots in USD, EUR, and GBP with zero drift</p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Pillars */}
      <section className="landing-features">
        <div className="section-head">
          <span className="section-eyebrow">Enterprise Core Capabilities</span>
          <h2>Engineered for High-Performance Consulting Operations</h2>
          <p>Built from the ground up for strict financial integrity and organizational accountability.</p>
        </div>

        <div className="features-grid">
          <div className="feature-box">
            <div className="feature-icon"><Building2 size={24} /></div>
            <h3>Multi-Tenant Architecture</h3>
            <p>
              Strict isolation of clients, projects, consultants, and revenue metrics across discrete organizations with zero cross-tenant data leaks.
            </p>
            <ul className="feature-list">
              <li><CheckCircle2 size={16} /> Safe organization discovery search</li>
              <li><CheckCircle2 size={16} /> Admin join request review & approval</li>
              <li><CheckCircle2 size={16} /> Persistent in-app notifications</li>
            </ul>
          </div>

          <div className="feature-box">
            <div className="feature-icon"><Users size={24} /></div>
            <h3>Consultant Management</h3>
            <p>
              Maintain accurate practitioner profiles, departmental assignments, weekly capacity hours,
              and base billing rates with complete revision history.
            </p>
            <ul className="feature-list">
              <li><CheckCircle2 size={16} /> Departmental capacity mapping</li>
              <li><CheckCircle2 size={16} /> Active and leave status tracking</li>
              <li><CheckCircle2 size={16} /> Scoped consultant portal views</li>
            </ul>
          </div>

          <div className="feature-box">
            <div className="feature-icon"><Clock size={24} /></div>
            <h3>Time Tracking & Workflow</h3>
            <p>
              Complete draft-to-approval lifecycle with optimistic concurrency, audit logging,
              and independent verification.
            </p>
            <ul className="feature-list">
              <li><CheckCircle2 size={16} /> Strict self-approval prevention</li>
              <li><CheckCircle2 size={16} /> Duplicate entry defense</li>
              <li><CheckCircle2 size={16} /> Rejection audit trail & reasons</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Auth Modal Overlay */}
      {authMode !== "none" && (
        <div className="auth-modal-overlay">
          <div className="auth-modal-card" style={{ maxWidth: authMode === "registerOrg" ? "520px" : "480px" }}>
            <div className="auth-modal-head">
              <div className="auth-modal-title">
                {authMode === "login" && (
                  <>
                    <Lock size={20} className="text-blue-600" />
                    <h3>NEXCORE Sign In</h3>
                  </>
                )}
                {authMode === "registerOrg" && (
                  <>
                    <Building2 size={20} className="text-blue-600" />
                    <h3>Create Organization & Admin</h3>
                  </>
                )}
                {authMode === "employeeSignup" && (
                  <>
                    <Compass size={20} className="text-blue-600" />
                    <h3>Employee Account & Join Request</h3>
                  </>
                )}
                {authMode === "setup" && (
                  <>
                    <ShieldCheck size={20} className="text-blue-600" />
                    <h3>System Bootstrap Admin</h3>
                  </>
                )}
              </div>
              <button
                type="button"
                className="auth-modal-close"
                onClick={() => setAuthMode("none")}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>

            {errorMessage && (
              <div className="auth-error-banner">
                <AlertCircle size={16} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* LOGIN FORM */}
            {authMode === "login" && (
              <form onSubmit={handleLoginSubmit} className="auth-form">
                <div className="form-field">
                  <label htmlFor="login-email">Work Email</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    autoComplete="email"
                    required
                    disabled={loginMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    disabled={loginMutation.isPending}
                  />
                </div>

                <button type="submit" className="btn-auth-submit" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <LogIn size={16} />
                      Sign In
                    </>
                  )}
                </button>

                <div className="auth-switch-note" style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <button type="button" onClick={() => { setErrorMessage(null); setAuthMode("registerOrg"); }}>
                    Create Organization
                  </button>
                  <button type="button" onClick={() => { setErrorMessage(null); setAuthMode("employeeSignup"); }}>
                    Join as Employee
                  </button>
                </div>
              </form>
            )}

            {/* REGISTER ORGANIZATION FORM */}
            {authMode === "registerOrg" && (
              <form onSubmit={handleRegisterOrgSubmit} className="auth-form">
                <div className="form-field">
                  <label>Company / Organization Name</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => {
                      setOrgName(e.target.value);
                      setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
                    }}
                    placeholder="e.g. Acme Advisory Corp"
                    required
                    disabled={registerOrgMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label>Organization Identifier (Slug)</label>
                  <input
                    type="text"
                    value={orgSlug}
                    onChange={(e) => setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""))}
                    placeholder="acme-advisory-corp"
                    required
                    disabled={registerOrgMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label>Administrator Full Name</label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Alice Administrator"
                    required
                    disabled={registerOrgMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label>Administrator Work Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alice@acme.com"
                    required
                    disabled={registerOrgMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label>Secure Password (min 8 chars)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    disabled={registerOrgMutation.isPending}
                  />
                </div>

                <button type="submit" className="btn-auth-submit" disabled={registerOrgMutation.isPending}>
                  {registerOrgMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Creating Organization...
                    </>
                  ) : (
                    <>
                      <Building2 size={16} />
                      Establish Organization & Sign In
                    </>
                  )}
                </button>

                <div className="auth-switch-note">
                  <span>Already have an account?</span>
                  <button type="button" onClick={() => { setErrorMessage(null); setAuthMode("login"); }}>
                    Sign In
                  </button>
                </div>
              </form>
            )}

            {/* EMPLOYEE SIGNUP FORM */}
            {authMode === "employeeSignup" && (
              <form onSubmit={handleEmployeeSignupSubmit} className="auth-form">
                <div className="form-field">
                  <label>Employee Full Name</label>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Edward Employee"
                    required
                    disabled={employeeSignupMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label>Work Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="edward@company.com"
                    required
                    disabled={employeeSignupMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label>Password (min 8 chars)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    disabled={employeeSignupMutation.isPending}
                  />
                </div>

                {/* Organization Discovery Search */}
                <div className="form-field">
                  <label>Organization to Join (Optional)</label>
                  <input
                    type="text"
                    value={searchOrgQuery}
                    onChange={(e) => setSearchOrgQuery(e.target.value)}
                    placeholder="Search organization name..."
                    disabled={employeeSignupMutation.isPending}
                  />

                  {searchOrgs.length > 0 && !selectedOrg && (
                    <div style={{ marginTop: "6px", background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: "10px", boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.1)", overflow: "hidden" }}>
                      {searchOrgs.map((org) => (
                        <div
                          key={org.id}
                          onClick={() => setSelectedOrg(org)}
                          style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", borderBottom: "1px solid #F1F5F9", transition: "background 0.15s ease" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                        >
                          <div>
                            <strong style={{ fontSize: "14px", color: "#0F172A", display: "block" }}>{org.name}</strong>
                            <span style={{ fontSize: "12px", color: "#64748B" }}>{org.slug}</span>
                          </div>
                          <span style={{ fontSize: "12px", color: "#2563EB", fontWeight: 700, padding: "3px 8px", borderRadius: "6px", background: "#EFF6FF" }}>Select</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedOrg && (
                    <div style={{ marginTop: "8px", padding: "10px 14px", borderRadius: "8px", background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: "12px", color: "#1D4ED8", fontWeight: 700 }}>Selected: {selectedOrg.name}</span>
                        <small style={{ display: "block", color: "#3B82F6", fontSize: "11px" }}>{selectedOrg.slug}</small>
                      </div>
                      <button type="button" onClick={() => setSelectedOrg(null)} style={{ background: "#FFFFFF", border: "1px solid #BFDBFE", borderRadius: "6px", color: "#64748B", cursor: "pointer", fontSize: "11px", fontWeight: 600, padding: "4px 8px" }}>
                        Change
                      </button>
                    </div>
                  )}
                </div>

                {selectedOrg && (
                  <div className="form-field">
                    <label>Requested Role</label>
                    <select
                      value={requestedRole}
                      onChange={(e) => setRequestedRole(e.target.value as any)}
                      style={{ width: "100%", padding: "11px 14px", background: "#F8FAFC", color: "#0F172A", border: "1px solid #CBD5E1", borderRadius: "8px", fontSize: "14px" }}
                    >
                      <option value="consultant">Consultant</option>
                      <option value="manager">Manager</option>
                      <option value="finance">Finance</option>
                    </select>
                  </div>
                )}

                <button type="submit" className="btn-auth-submit" disabled={employeeSignupMutation.isPending}>
                  {employeeSignupMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <Compass size={16} />
                      Sign Up & Submit Join Request
                    </>
                  )}
                </button>

                <div className="auth-switch-note">
                  <span>Already registered?</span>
                  <button type="button" onClick={() => { setErrorMessage(null); setAuthMode("login"); }}>
                    Sign In
                  </button>
                </div>
              </form>
            )}

            {/* SETUP ADMIN FALLBACK */}
            {authMode === "setup" && (
              <form onSubmit={handleSetupSubmit} className="auth-form">
                <div className="form-field">
                  <label htmlFor="admin-name">Administrator Name</label>
                  <input
                    id="admin-name"
                    type="text"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Lead Administrator"
                    required
                    disabled={setupAdminMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="admin-email">Work Email</label>
                  <input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    autoComplete="email"
                    required
                    disabled={setupAdminMutation.isPending}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="admin-password">Password (min 8 chars)</label>
                  <input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    minLength={8}
                    disabled={setupAdminMutation.isPending}
                  />
                </div>

                <button type="submit" className="btn-auth-submit" disabled={setupAdminMutation.isPending}>
                  {setupAdminMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <UserCheck size={16} />
                      Complete Admin Setup
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
