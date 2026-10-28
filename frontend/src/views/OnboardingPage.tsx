import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  FileCheck2,
  Globe2,
  Hash,
  Loader2,
  LogOut,
  PlusCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

export function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { user, refresh, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"join" | "create">("join");

  // Join Form State
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [requestedRole, setRequestedRole] = useState<"consultant" | "manager" | "finance">("consultant");

  // Create Form State
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setCreateName(val);
    if (!slugManuallyEdited) {
      const generated = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setCreateSlug(generated);
    }
  };

  // Safe discovery query
  const { data: searchResults = [], isLoading: searchLoading } = trpc.organizations.search.useQuery(
    { query: debouncedQuery, limit: 10 },
    { enabled: activeTab === "join" }
  );

  // Submit Join Request Mutation
  const joinMutation = trpc.joinRequests.submit.useMutation({
    onSuccess: async () => {
      toast.success("Join request submitted successfully!");
      if (refresh) await refresh();
      setLocation("/");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit join request.");
    },
  });

  // Create Organization Mutation
  const createOrgMutation = trpc.organizations.create.useMutation({
    onSuccess: async (org) => {
      toast.success(`Organization "${org.name}" established! You are now the Organization Admin.`);
      if (refresh) await refresh();
      setLocation("/");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create organization.");
    },
  });

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) {
      toast.error("Please search and select an organization first.");
      return;
    }
    joinMutation.mutate({
      organizationId: selectedOrg.id,
      requestedRole,
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) {
      toast.error("Organization name is required.");
      return;
    }
    if (!createSlug.trim()) {
      toast.error("Organization identifier (slug) is required.");
      return;
    }
    createOrgMutation.mutate({
      name: createName.trim(),
      slug: createSlug.trim(),
      description: createDesc.trim() || undefined,
    });
  };

  const handleSignOut = async () => {
    if (logout) await logout();
    setLocation("/");
  };

  return (
    <div className="landing-container" style={{ minHeight: "100vh", padding: "40px 20px", background: "#F8FAFC" }}>
      {/* Top Header */}
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
            <h1 style={{ fontSize: "19px", fontWeight: 850, color: "#0F172A", margin: 0 }}>NEXCORE</h1>
            <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 650 }}>
              Organization Onboarding & Discovery
            </span>
          </div>
        </div>

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
            color: "#334155",
            border: "1px solid #CBD5E1",
            borderRadius: "8px",
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
            cursor: "pointer",
          }}
        >
          <LogOut size={14} />
          <span>Sign Out</span>
        </button>
      </header>

      {/* Main Container - Secondary Pure White Card */}
      <main style={{ maxWidth: "880px", margin: "0 auto" }}>
        <div
          style={{
            background: "#FFFFFF",
            borderRadius: "20px",
            border: "1px solid #E2E8F0",
            boxShadow: "0 20px 45px -10px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04)",
            padding: "38px",
          }}
        >
          {/* Welcome User Header */}
          <div style={{ textAlign: "center", marginBottom: "30px" }}>
            <span
              style={{
                display: "inline-block",
                padding: "5px 14px",
                borderRadius: "9999px",
                background: "#EFF6FF",
                color: "#1D4ED8",
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                marginBottom: "12px",
                letterSpacing: "0.05em",
                border: "1px solid #BFDBFE",
              }}
            >
              Step 2 of 2: Organization Workspace
            </span>
            <h2 style={{ fontSize: "28px", fontWeight: 850, color: "#0F172A", marginBottom: "8px" }}>
              Welcome, {user?.name || "Team Member"}
            </h2>
            <p style={{ color: "#475569", fontSize: "15px", maxWidth: "560px", margin: "0 auto", lineHeight: "1.6" }}>
              To access consultant timesheets, capacity metrics, and revenue analytics, please select an existing organization to join or establish a new one.
            </p>
          </div>

          {/* Tab Selector */}
          <div
            style={{
              display: "flex",
              background: "#F1F5F9",
              padding: "5px",
              borderRadius: "12px",
              maxWidth: "480px",
              margin: "0 auto 34px",
              border: "1px solid #E2E8F0",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("join")}
              style={{
                flex: 1,
                padding: "10px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "join" ? "#FFFFFF" : "transparent",
                color: activeTab === "join" ? "#2563EB" : "#64748B",
                boxShadow: activeTab === "join" ? "0 2px 6px rgba(15, 23, 42, 0.08)" : "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              <Compass size={16} />
              <span>Join an Organization</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("create")}
              style={{
                flex: 1,
                padding: "10px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeTab === "create" ? "#FFFFFF" : "transparent",
                color: activeTab === "create" ? "#2563EB" : "#64748B",
                boxShadow: activeTab === "create" ? "0 2px 6px rgba(15, 23, 42, 0.08)" : "none",
                fontWeight: 700,
                fontSize: "14px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              <PlusCircle size={16} />
              <span>Create an Organization</span>
            </button>
          </div>

          {/* TAB 1: JOIN AN ORGANIZATION */}
          {activeTab === "join" && (
            <div style={{ maxWidth: "600px", margin: "0 auto" }}>
              <form onSubmit={handleJoinSubmit}>
                {/* Search Input */}
                <div style={{ marginBottom: "22px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                    Search for your company or organization
                  </label>
                  <div style={{ position: "relative" }}>
                    <Search
                      size={18}
                      style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#64748B" }}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Type organization name or identifier (e.g. Nexcore, Acme)..."
                      style={{
                        paddingLeft: "42px",
                        paddingRight: "14px",
                        paddingTop: "12px",
                        paddingBottom: "12px",
                        width: "100%",
                        background: "#F8FAFC",
                        border: "1px solid #CBD5E1",
                        borderRadius: "10px",
                        color: "#0F172A",
                        fontSize: "14px",
                        outline: "none",
                      }}
                    />
                    {searchLoading && (
                      <Loader2
                        size={16}
                        className="spin"
                        style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", color: "#2563EB" }}
                      />
                    )}
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748B", marginTop: "6px", display: "block" }}>
                    Safe discovery: search verifies publicly registered companies without exposing private employee lists or internal financials.
                  </span>
                </div>

                {/* Search Results Autocomplete List */}
                {searchResults.length > 0 && !selectedOrg && (
                  <div
                    style={{
                      background: "#FFFFFF",
                      border: "1px solid #CBD5E1",
                      borderRadius: "12px",
                      boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.1)",
                      overflow: "hidden",
                      marginBottom: "22px",
                    }}
                  >
                    <div style={{ padding: "10px 14px", background: "#F8FAFC", fontSize: "11px", fontWeight: 700, color: "#64748B", textTransform: "uppercase", borderBottom: "1px solid #E2E8F0" }}>
                      Discovered Organizations ({searchResults.length})
                    </div>
                    {searchResults.map((org) => (
                      <div
                        key={org.id}
                        onClick={() => setSelectedOrg(org)}
                        style={{
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          borderBottom: "1px solid #F1F5F9",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#EFF6FF", color: "#2563EB", display: "grid", placeItems: "center" }}>
                            <Building2 size={16} />
                          </div>
                          <div>
                            <strong style={{ display: "block", color: "#0F172A", fontSize: "14px" }}>{org.name}</strong>
                            <span style={{ color: "#64748B", fontSize: "12px" }}>slug: {org.slug}</span>
                          </div>
                        </div>
                        <span
                          style={{
                            padding: "4px 10px",
                            fontSize: "12px",
                            fontWeight: 700,
                            borderRadius: "6px",
                            background: "#EFF6FF",
                            color: "#2563EB",
                          }}
                        >
                          Select
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Organization Confirmation Card */}
                {selectedOrg && (
                  <div
                    style={{
                      padding: "16px 20px",
                      borderRadius: "12px",
                      background: "#EFF6FF",
                      border: "1px solid #BFDBFE",
                      marginBottom: "24px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: "#DBEAFE", display: "grid", placeItems: "center", color: "#1D4ED8" }}>
                        <Building2 size={20} />
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", color: "#2563EB", fontWeight: 700, textTransform: "uppercase" }}>
                          Selected Organization
                        </span>
                        <h4 style={{ color: "#0F172A", fontSize: "16px", fontWeight: 800, margin: 0 }}>
                          {selectedOrg.name}
                        </h4>
                        <span style={{ fontSize: "12px", color: "#64748B" }}>Identifier: {selectedOrg.slug}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedOrg(null)}
                      style={{
                        background: "#FFFFFF",
                        border: "1px solid #CBD5E1",
                        color: "#475569",
                        padding: "6px 12px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Change
                    </button>
                  </div>
                )}

                {/* Requested Role Selector */}
                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                    Requested Role in Organization
                  </label>
                  <select
                    value={requestedRole}
                    onChange={(e) => setRequestedRole(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: "#F8FAFC",
                      color: "#0F172A",
                      border: "1px solid #CBD5E1",
                      borderRadius: "10px",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    <option value="consultant">Consultant — Track billable hours and review assigned projects</option>
                    <option value="manager">Manager — Manage consultants, approve timesheets, and monitor capacity</option>
                    <option value="finance">Finance — Financial analytics, billable revenue snapshots, and retainers</option>
                  </select>
                  <span style={{ fontSize: "12px", color: "#64748B", marginTop: "6px", display: "block" }}>
                    Your organization administrator will review and authorize your final role assignment.
                  </span>
                </div>

                {/* Submit Join Request Button */}
                <button
                  type="submit"
                  disabled={!selectedOrg || joinMutation.isPending}
                  className="btn-auth-submit"
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    opacity: !selectedOrg ? 0.6 : 1,
                    fontSize: "15px",
                    padding: "13px",
                  }}
                >
                  {joinMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Request to Join {selectedOrg ? selectedOrg.name : "Organization"}</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: CREATE AN ORGANIZATION */}
          {activeTab === "create" && (
            <div style={{ maxWidth: "600px", margin: "0 auto" }}>
              <form onSubmit={handleCreateSubmit}>
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                    Company / Organization Name
                  </label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Apex Strategic Advisory, Nexcore Partners"
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: "#F8FAFC",
                      color: "#0F172A",
                      border: "1px solid #CBD5E1",
                      borderRadius: "10px",
                      fontSize: "14px",
                    }}
                    required
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                    Organization Identifier (Slug)
                  </label>
                  <div style={{ position: "relative" }}>
                    <Hash
                      size={18}
                      style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#64748B" }}
                    />
                    <input
                      type="text"
                      value={createSlug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""));
                      }}
                      placeholder="e.g. apex-strategic-advisory"
                      style={{
                        width: "100%",
                        paddingLeft: "42px",
                        paddingRight: "14px",
                        paddingTop: "12px",
                        paddingBottom: "12px",
                        background: "#F8FAFC",
                        color: "#0F172A",
                        border: "1px solid #CBD5E1",
                        borderRadius: "10px",
                        fontSize: "14px",
                      }}
                      required
                    />
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748B", marginTop: "6px", display: "block" }}>
                    Used for workspace discovery and multi-tenant separation.
                  </span>
                </div>

                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#334155", marginBottom: "8px" }}>
                    Company Description (Optional)
                  </label>
                  <textarea
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="Brief description of your consulting practice and core services..."
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      background: "#F8FAFC",
                      color: "#0F172A",
                      border: "1px solid #CBD5E1",
                      borderRadius: "10px",
                      fontSize: "14px",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    background: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    marginBottom: "24px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <ShieldCheck size={24} style={{ color: "#059669", flexShrink: 0 }} />
                  <p style={{ margin: 0, fontSize: "13px", color: "#065F46", lineHeight: "1.5" }}>
                    As creator, you will automatically be established as the <strong>Organization Administrator</strong> with full governance, team management, and billing authority.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={createOrgMutation.isPending}
                  className="btn-auth-submit"
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "15px", padding: "13px" }}
                >
                  {createOrgMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      <span>Establishing Organization...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Create Organization & Become Admin</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
