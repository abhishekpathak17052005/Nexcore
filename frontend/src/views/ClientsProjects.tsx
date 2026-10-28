import { useMemo, useState } from "react";
import { Plus, Search, Filter, Building2, Briefcase, Calendar, Edit2, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PanelHeader, StatusBadge } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import type { Client, Project, ReportingPeriod, CurrencyCode } from "@/types";
import { backendErrorMessage, type BackendStatus } from "@/lib/backendService";

interface ClientsProjectsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  clients: Client[];
  projects: Project[];
  backendStatus: BackendStatus;
  onCreateClient: (data: { clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode }) => Promise<void>;
  onUpdateClient: (id: string, data: { clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode }) => Promise<void>;
  onCreateProject: (data: { clientId: string; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate?: string | null; endDate?: string | null }) => Promise<void>;
  onUpdateProject: (id: string, data: { clientId: string; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate?: string | null; endDate?: string | null }) => Promise<void>;
  onRetry: () => void;
}

export default function ClientsProjects({
  period,
  onPeriodChange,
  clients,
  projects,
  backendStatus,
  onCreateClient,
  onUpdateClient,
  onCreateProject,
  onUpdateProject,
  onRetry,
}: ClientsProjectsProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"clients" | "projects">("clients");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedClientId, setSelectedClientId] = useState<string>("All");

  // Client Modal State
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState<{ clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode }>({
    clientCode: "",
    name: "",
    status: "Active",
    defaultCurrency: "USD",
  });
  const [clientFormError, setClientFormError] = useState<string | null>(null);
  const [savingClient, setSavingClient] = useState(false);

  // Project Modal State
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState<{ clientId: string; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate: string; endDate: string }>({
    clientId: "",
    name: "",
    status: "Active",
    billingCurrency: "USD",
    startDate: "",
    endDate: "",
  });
  const [projectFormError, setProjectFormError] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);

  const canManageClients = user?.role === "admin" || user?.role === "manager" || user?.role === "finance";
  const canManageProjects = user?.role === "admin" || user?.role === "manager" || user?.role === "finance";

  // Filtered Clients
  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || client.name.toLowerCase().includes(q) || (client.clientCode?.toLowerCase().includes(q) ?? false);
      const matchesStatus = statusFilter === "All" || client.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [clients, query, statusFilter]);

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const q = query.trim().toLowerCase();
      const client = clients.find((c) => c.id === project.clientId);
      const matchesQuery = !q || project.name.toLowerCase().includes(q) || (client?.name.toLowerCase().includes(q) ?? false);
      const matchesStatus = statusFilter === "All" || project.status === statusFilter;
      const matchesClient = selectedClientId === "All" || project.clientId === selectedClientId;
      return matchesQuery && matchesStatus && matchesClient;
    });
  }, [projects, clients, query, statusFilter, selectedClientId]);

  // Open Add/Edit Client Modal
  const openClientModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setClientForm({
        clientCode: client.clientCode ?? "",
        name: client.name,
        status: client.status,
        defaultCurrency: client.defaultCurrency,
      });
    } else {
      setEditingClient(null);
      setClientForm({
        clientCode: `CL-${Math.floor(100 + Math.random() * 900)}`,
        name: "",
        status: "Active",
        defaultCurrency: "USD",
      });
    }
    setClientFormError(null);
    setClientModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientFormError(null);
    if (!clientForm.clientCode.trim() || !clientForm.name.trim()) {
      setClientFormError("Client code and name are required.");
      return;
    }
    setSavingClient(true);
    try {
      if (editingClient) {
        await onUpdateClient(editingClient.id, clientForm);
      } else {
        await onCreateClient(clientForm);
      }
      setClientModalOpen(false);
    } catch (err: unknown) {
      setClientFormError(err instanceof Error ? err.message : "Failed to save client.");
    } finally {
      setSavingClient(false);
    }
  };

  // Open Add/Edit Project Modal
  const openProjectModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setProjectForm({
        clientId: project.clientId,
        name: project.name,
        status: project.status,
        billingCurrency: project.billingCurrency,
        startDate: project.startDate ?? "",
        endDate: project.endDate ?? "",
      });
    } else {
      setEditingProject(null);
      setProjectForm({
        clientId: clients[0]?.id ?? "",
        name: "",
        status: "Active",
        billingCurrency: clients[0]?.defaultCurrency ?? "USD",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: "",
      });
    }
    setProjectFormError(null);
    setProjectModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setProjectFormError(null);
    if (!projectForm.clientId) {
      setProjectFormError("Select an associated client.");
      return;
    }
    if (!projectForm.name.trim()) {
      setProjectFormError("Project name is required.");
      return;
    }
    setSavingProject(true);
    try {
      const payload = {
        clientId: projectForm.clientId,
        name: projectForm.name.trim(),
        status: projectForm.status,
        billingCurrency: projectForm.billingCurrency,
        startDate: projectForm.startDate || null,
        endDate: projectForm.endDate || null,
      };
      if (editingProject) {
        await onUpdateProject(editingProject.id, payload);
      } else {
        await onCreateProject(payload);
      }
      setProjectModalOpen(false);
    } catch (err: unknown) {
      setProjectFormError(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      setSavingProject(false);
    }
  };

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange}>
      <div className="dashboard-page">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">Client operations <span className="eyebrow-dot" /></p>
            <h1>Clients & Projects</h1>
            <p className="page-subtitle">Manage client accounts, project engagements, and contract currencies backed by MongoDB.</p>
          </div>
          <div className="heading-actions">
            {activeTab === "clients" && canManageClients && (
              <button className="button button-primary" onClick={() => openClientModal()}>
                <Plus size={16} /> Add client
              </button>
            )}
            {activeTab === "projects" && canManageProjects && (
              <button className="button button-primary" onClick={() => openProjectModal()} disabled={clients.length === 0}>
                <Plus size={16} /> Add project
              </button>
            )}
          </div>
        </div>

        {backendStatus.error ? (
          <div className="panel error-panel" style={{ padding: "24px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#C53030" }}>
              <AlertCircle size={20} />
              <strong>Connection Error</strong>
            </div>
            <p style={{ margin: "8px 0 16px 0", color: "#4A5568" }}>
              {backendErrorMessage(backendStatus.error)}
            </p>
            <button className="button button-primary" onClick={onRetry}>
              <RefreshCw size={14} /> Retry connection
            </button>
          </div>
        ) : null}

        {/* Tab Controls & Filter Bar */}
        <div className="panel" style={{ padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div className="table-tabs" style={{ margin: 0 }}>
              <button
                className={activeTab === "clients" ? "is-active" : ""}
                onClick={() => { setActiveTab("clients"); setStatusFilter("All"); }}
              >
                <Building2 size={16} style={{ marginRight: 6 }} />
                Clients ({clients.length})
              </button>
              <button
                className={activeTab === "projects" ? "is-active" : ""}
                onClick={() => { setActiveTab("projects"); setStatusFilter("All"); }}
              >
                <Briefcase size={16} style={{ marginRight: 6 }} />
                Projects ({projects.length})
              </button>
            </div>

            <div className="table-filters" style={{ margin: 0 }}>
              <label className="table-search">
                <Search size={15} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={activeTab === "clients" ? "Search clients by name, code..." : "Search projects..."}
                />
              </label>

              {activeTab === "projects" && (
                <label className="select-control">
                  <Filter size={14} />
                  <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
                    <option value="All">All clients</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className="select-control">
                <Filter size={14} />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="All">All statuses</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  {activeTab === "projects" && <option value="On hold">On hold</option>}
                  {activeTab === "projects" && <option value="Closed">Closed</option>}
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* Clients Table Tab */}
        {activeTab === "clients" && (
          <article className="panel">
            <PanelHeader
              eyebrow="Portfolio Directory"
              title="Registered Clients"
              detail={`Showing ${filteredClients.length} of ${clients.length} clients in database`}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Client Code</th>
                    <th>Client Name</th>
                    <th>Default Currency</th>
                    <th>Associated Projects</th>
                    <th>Status</th>
                    {canManageClients && <th style={{ textAlign: "right" }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => {
                    const clientProjects = projects.filter((p) => p.clientId === client.id);
                    return (
                      <tr key={client.id}>
                        <td><code style={{ background: "#EDF2F7", padding: "2px 6px", borderRadius: 4 }}>{client.clientCode}</code></td>
                        <td><strong>{client.name}</strong></td>
                        <td><span className="badge badge-currency">{client.defaultCurrency}</span></td>
                        <td>
                          <span style={{ color: clientProjects.length > 0 ? "#2B6CB0" : "#A0AEC0" }}>
                            {clientProjects.length} {clientProjects.length === 1 ? "project" : "projects"}
                          </span>
                        </td>
                        <td>
                          <StatusBadge tone={client.status === "Active" ? "success" : "neutral"}>
                            {client.status}
                          </StatusBadge>
                        </td>
                        {canManageClients && (
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="button button-quiet"
                              onClick={() => openClientModal(client)}
                              title="Edit Client"
                            >
                              <Edit2 size={14} /> Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredClients.length === 0 && (
              <EmptyState
                title="No clients found"
                description={query ? "No clients match your search criteria." : "No clients have been created yet."}
              />
            )}
          </article>
        )}

        {/* Projects Table Tab */}
        {activeTab === "projects" && (
          <article className="panel">
            <PanelHeader
              eyebrow="Delivery Engagements"
              title="Project Workstreams"
              detail={`Showing ${filteredProjects.length} of ${projects.length} projects in database`}
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Project Name</th>
                    <th>Client</th>
                    <th>Billing Currency</th>
                    <th>Schedule</th>
                    <th>Status</th>
                    {canManageProjects && <th style={{ textAlign: "right" }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => {
                    const client = clients.find((c) => c.id === project.clientId);
                    return (
                      <tr key={project.id}>
                        <td><strong>{project.name}</strong></td>
                        <td>
                          <span style={{ color: "#2B6CB0" }}>
                            {client ? client.name : "Unassigned Client"}
                          </span>
                        </td>
                        <td><span className="badge badge-currency">{project.billingCurrency}</span></td>
                        <td className="muted-cell" style={{ fontSize: "13px" }}>
                          {project.startDate ? (
                            <span><Calendar size={12} style={{ display: "inline", marginRight: 4 }} />{project.startDate} {project.endDate ? `to ${project.endDate}` : "→ Ongoing"}</span>
                          ) : (
                            "Unscheduled"
                          )}
                        </td>
                        <td>
                          <StatusBadge tone={project.status === "Active" ? "success" : project.status === "On hold" ? "warning" : "neutral"}>
                            {project.status}
                          </StatusBadge>
                        </td>
                        {canManageProjects && (
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="button button-quiet"
                              onClick={() => openProjectModal(project)}
                              title="Edit Project"
                            >
                              <Edit2 size={14} /> Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredProjects.length === 0 && (
              <EmptyState
                title="No projects found"
                description={query ? "No projects match your search criteria." : "No projects have been added yet."}
              />
            )}
          </article>
        )}

        {/* Client Modal */}
        {clientModalOpen && (
          <div className="drawer-scrim" onClick={() => setClientModalOpen(false)}>
            <div
              className="panel"
              style={{ width: "480px", maxWidth: "90%", margin: "auto", padding: "24px", background: "#FFFFFF", borderRadius: "8px", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
                {editingClient ? "Edit Client" : "Add New Client"}
              </h2>
              <p style={{ color: "#718096", fontSize: "14px", marginBottom: "16px" }}>
                Client code is a unique identifier used for billing and time entry relations.
              </p>

              {clientFormError && (
                <div style={{ background: "#FFF5F5", color: "#C53030", padding: "10px", borderRadius: 4, marginBottom: "16px", fontSize: "13px" }}>
                  {clientFormError}
                </div>
              )}

              <form onSubmit={handleSaveClient}>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Client Code</label>
                  <input
                    className="input-control"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                    value={clientForm.clientCode}
                    onChange={(e) => setClientForm({ ...clientForm, clientCode: e.target.value })}
                    required
                  />
                </div>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Client Name</label>
                  <input
                    className="input-control"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                    value={clientForm.name}
                    onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Status</label>
                    <select
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                      value={clientForm.status}
                      onChange={(e) => setClientForm({ ...clientForm, status: e.target.value as "Active" | "Inactive" })}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Default Currency</label>
                    <select
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                      value={clientForm.defaultCurrency}
                      onChange={(e) => setClientForm({ ...clientForm, defaultCurrency: e.target.value as CurrencyCode })}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button type="button" className="button button-quiet" onClick={() => setClientModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="button button-primary" disabled={savingClient}>
                    {savingClient ? "Saving..." : editingClient ? "Save Changes" : "Create Client"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Project Modal */}
        {projectModalOpen && (
          <div className="drawer-scrim" onClick={() => setProjectModalOpen(false)}>
            <div
              className="panel"
              style={{ width: "500px", maxWidth: "90%", margin: "auto", padding: "24px", background: "#FFFFFF", borderRadius: "8px", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
                {editingProject ? "Edit Project" : "Add New Project"}
              </h2>
              <p style={{ color: "#718096", fontSize: "14px", marginBottom: "16px" }}>
                Associate delivery work with a client and establish the project's billing currency.
              </p>

              {projectFormError && (
                <div style={{ background: "#FFF5F5", color: "#C53030", padding: "10px", borderRadius: 4, marginBottom: "16px", fontSize: "13px" }}>
                  {projectFormError}
                </div>
              )}

              <form onSubmit={handleSaveProject}>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Client</label>
                  <select
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                    value={projectForm.clientId}
                    onChange={(e) => {
                      const c = clients.find(cl => cl.id === e.target.value);
                      setProjectForm({
                        ...projectForm,
                        clientId: e.target.value,
                        billingCurrency: c ? c.defaultCurrency : projectForm.billingCurrency,
                      });
                    }}
                    required
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.clientCode})</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Project Name</label>
                  <input
                    className="input-control"
                    style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                    value={projectForm.name}
                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Status</label>
                    <select
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                      value={projectForm.status}
                      onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as "Active" | "On hold" | "Closed" })}
                    >
                      <option value="Active">Active</option>
                      <option value="On hold">On hold</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Billing Currency</label>
                    <select
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                      value={projectForm.billingCurrency}
                      onChange={(e) => setProjectForm({ ...projectForm, billingCurrency: e.target.value as CurrencyCode })}
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Start Date</label>
                    <input
                      type="date"
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                      value={projectForm.startDate}
                      onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>End Date</label>
                    <input
                      type="date"
                      style={{ width: "100%", padding: "8px 12px", border: "1px solid #CBD5E0", borderRadius: 4 }}
                      value={projectForm.endDate}
                      onChange={(e) => setProjectForm({ ...projectForm, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button type="button" className="button button-quiet" onClick={() => setProjectModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="button button-primary" disabled={savingProject}>
                    {savingProject ? "Saving..." : editingProject ? "Save Changes" : "Create Project"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
