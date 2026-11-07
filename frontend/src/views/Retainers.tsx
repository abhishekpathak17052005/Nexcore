import { useEffect, useMemo, useState } from "react";
import { WalletCards, Plus, Search, ChevronDown, Edit3, CheckCircle2, AlertCircle, XCircle, Clock, Check, MoreHorizontal, X, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PanelHeader, StatusBadge } from "@/components/DashboardPrimitives";
import { RetainerForm } from "@/components/RetainerForm";
import { useAuth } from "@/contexts/AuthContext";
import type { Client, Project, ReportingPeriod, Retainer, RetainerFormValues } from "@/types";
import type { BackendStatus } from "@/lib/backendService";
import { formatCurrency, formatNumber } from "@/lib/calculations";
import { BackendState } from "@/components/BackendState";
import { trpc } from "@/lib/trpc";

interface RetainersProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  retainers: Retainer[];
  clients: Client[];
  projects: Project[];
  backendStatus: BackendStatus;
  onCreate: (values: RetainerFormValues) => Promise<void>;
  onUpdate: (id: string, values: RetainerFormValues) => Promise<void>;
  onActivate: (id: string) => Promise<void>;
  onTerminate: (id: string) => Promise<void>;
  onRetry: () => void;
}

type StatusFilter = "all" | "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED";

export default function Retainers({
  period,
  onPeriodChange,
  retainers,
  clients,
  projects,
  backendStatus,
  onCreate,
  onUpdate,
  onActivate,
  onTerminate,
  onRetry,
}: RetainersProps) {
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | Retainer["type"]>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [formRecord, setFormRecord] = useState<Retainer | undefined>();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canManage = can("clients.manage");
  const usageQueries = trpc.useQueries((queries) => retainers.map((retainer) =>
    queries.retainers.usage({ id: retainer.id }, { enabled: can("clients.read"), retry: false }),
  ));
  const retainerUsages = useMemo(() => new Map(usageQueries.flatMap((result, index) =>
    result.data ? [[retainers[index].id, result.data] as const] : [],
  )), [usageQueries, retainers]);
  const usageError = usageQueries.find((result) => result.error)?.error;
  const usageLoading = usageQueries.some((result) => result.isLoading);
  const alertsQuery = trpc.retainers.alerts.useQuery(undefined, { enabled: can("clients.read"), retry: false });
  const detailQuery = trpc.retainers.get.useQuery({ id: detailId ?? "" }, { enabled: Boolean(detailId), retry: false });
  useEffect(() => {
    const linkedRetainerId = new URLSearchParams(window.location.search).get("retainerId");
    if (linkedRetainerId && retainers.some((retainer) => retainer.id === linkedRetainerId)) setDetailId(linkedRetainerId);
  }, [retainers]);
  const refreshIntelligence = async () => {
    await Promise.all([alertsQuery.refetch(), ...usageQueries.map((result) => result.refetch())]);
  };

  // Filter and search
  const filtered = useMemo(() => {
    return retainers.filter((retainer) => {
      const client = clients.find((c) => c.id === retainer.clientId);
      const project = retainer.projectId ? projects.find((p) => p.id === retainer.projectId) : null;

      const matchesQuery =
        !query ||
        retainer.name.toLowerCase().includes(query.toLowerCase()) ||
        client?.name.toLowerCase().includes(query.toLowerCase()) ||
        project?.name.toLowerCase().includes(query.toLowerCase()) ||
        retainer.currency.toLowerCase().includes(query.toLowerCase());

      const matchesStatus = statusFilter === "all" || retainer.status === statusFilter;
      const matchesType = typeFilter === "all" || retainer.type === typeFilter;

      return matchesQuery && matchesStatus && matchesType;
    });
  }, [retainers, clients, projects, query, statusFilter, typeFilter]);

  const statusCounts = useMemo(() => ({
    active: retainers.filter((retainer) => retainer.status === "ACTIVE").length,
    draft: retainers.filter((retainer) => retainer.status === "DRAFT").length,
    expired: retainers.filter((retainer) => retainer.status === "EXPIRED").length,
    terminated: retainers.filter((retainer) => retainer.status === "TERMINATED").length,
  }), [retainers]);

  // Actions
  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const openAdd = () => {
    setFormRecord(undefined);
    setFormOpen(true);
  };

  const openEdit = (retainer: Retainer) => {
    setFormRecord(retainer);
    setFormOpen(true);
    setActionMenu(null);
  };

  const handleCreate = async (values: RetainerFormValues) => {
    try {
      await onCreate(values);
      await refreshIntelligence();
      setFormOpen(false);
      showToast("Retainer agreement created successfully.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create retainer.");
    }
  };

  const handleUpdate = async (values: RetainerFormValues) => {
    if (!formRecord) return;
    try {
      await onUpdate(formRecord.id, values);
      await refreshIntelligence();
      setFormOpen(false);
      showToast("Retainer agreement updated successfully.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update retainer.");
    }
  };

  const handleActivate = async (retainer: Retainer) => {
    try {
      await onActivate(retainer.id);
      await refreshIntelligence();
      if (detailId === retainer.id) await detailQuery.refetch();
      setActionMenu(null);
      showToast(`Retainer "${retainer.name}" activated.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to activate retainer.");
    }
  };

  const handleTerminate = async (retainer: Retainer) => {
    if (!window.confirm(`Are you sure you want to terminate "${retainer.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await onTerminate(retainer.id);
      await refreshIntelligence();
      if (detailId === retainer.id) await detailQuery.refetch();
      setActionMenu(null);
      showToast(`Retainer "${retainer.name}" terminated.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to terminate retainer.");
    }
  };

  if (backendStatus.enabled && !backendStatus.ready) {
    return (
      <AppShell period={period} onPeriodChange={onPeriodChange}>
        <div className="dashboard-page">
          <BackendState
            loading={backendStatus.loading}
            error={backendStatus.error}
            onRetry={onRetry}
            title="Retainer records unavailable"
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange}>
      <div className="dashboard-page">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">
              Contract governance <span className="eyebrow-dot" />
            </p>
            <h1>Retainer Engagements</h1>
            <p className="page-subtitle">
              Manage client retainer contracts, track usage against limits, and monitor contract balances.
            </p>
          </div>
          <div className="heading-actions">
            {canManage && (
              <button className="button button-primary" onClick={openAdd}>
                <Plus size={16} />
                Create Retainer
              </button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <section className="directory-summary">
          <SummaryCount label="Total retainers" count={retainers.length} caption={`${statusCounts.active} active contracts`} />
          <SummaryCount label="Draft" count={statusCounts.draft} caption="Awaiting activation" />
          <SummaryCount label="Expired" count={statusCounts.expired} caption="Contract status" />
          <SummaryCount label="Terminated" count={statusCounts.terminated} caption="Contract status" />
        </section>

        <article className="panel retainer-alert-panel">
          <PanelHeader eyebrow="Contract intelligence" title="Retainer alerts" detail="Threshold, exceeded, and expiry alerts from the backend" />
          {alertsQuery.isLoading && <p role="status" className="retainer-alert-message">Loading alerts…</p>}
          {alertsQuery.error && <div className="error-panel" role="alert">{alertsQuery.error.message}<button type="button" className="button button-quiet" onClick={() => void alertsQuery.refetch()}>Retry</button></div>}
          {!alertsQuery.isLoading && !alertsQuery.error && !alertsQuery.data?.length && <p className="retainer-alert-message">No retainer alerts.</p>}
          {!!alertsQuery.data?.length && <ul className="retainer-alert-list">{alertsQuery.data.map((alert) => (
            <li key={`${alert.retainerId}-${alert.type}`} className={`retainer-alert-item ${alert.severity}`}>
              <span className="retainer-alert-severity" aria-label={`${alert.severity} alert`}>{alert.severity === "critical" ? "!" : "•"}</span>
              <div className="retainer-alert-copy"><strong>{alert.retainerName}</strong><span>{alert.type}</span><p>{alert.message}</p></div>
              <button type="button" className="button button-quiet" onClick={() => setDetailId(alert.retainerId)} aria-label={`View ${alert.retainerName} details`}>Details</button>
            </li>
          ))}</ul>}
        </article>

        {/* Retainer Table */}
        <article className="panel directory-panel">
          <div className="directory-panel-header">
            <PanelHeader
              eyebrow="Contract Management"
              title="Retainer Agreements"
              detail={`${filtered.length} of ${retainers.length} contracts visible`}
            />
          </div>

          <div className="directory-toolbar">
            <label className="table-search directory-search">
              <Search size={15} />
              <span className="sr-only">Search retainers</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or client..."
              />
            </label>

            <label className="select-control directory-select">
              <span className="sr-only">Filter by status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="TERMINATED">Terminated</option>
              </select>
              <ChevronDown size={13} />
            </label>
            <label className="select-control directory-select">
              <span className="sr-only">Filter by contract type</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
                <option value="all">All types</option><option value="HOURS">Hours</option><option value="AMOUNT">Amount</option>
              </select><ChevronDown size={13} />
            </label>
          </div>

          <div className="table-scroll">
            <table className="directory-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Contracted</th>
                  <th>Consumed</th>
                  <th>Remaining</th>
                  <th>Utilization</th>
                  <th>Period</th>
                  <th>Status</th>
                  {canManage && <th><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((retainer) => {
                  const client = clients.find((c) => c.id === retainer.clientId);
                  const project = retainer.projectId ? projects.find((p) => p.id === retainer.projectId) : null;
                  const usage = retainerUsages.get(retainer.id);

                  const contracted =
                    retainer.type === "HOURS"
                      ? retainer.contractedHours == null ? "—" : `${formatNumber(retainer.contractedHours)}h`
                      : retainer.contractedAmount == null ? "—" : `${retainer.currency} ${formatCurrency(retainer.contractedAmount, false, retainer.currency)}`;

                  const consumed = !usage
                    ? "—"
                    : retainer.type === "HOURS"
                      ? `${formatNumber(usage.approvedHours)}h`
                      : usage.approvedAmount == null ? "—" : `${retainer.currency} ${formatCurrency(usage.approvedAmount, false, retainer.currency)}`;

                  const remaining =
                    retainer.type === "HOURS"
                      ? usage?.remainingHours != null
                        ? `${formatNumber(usage.remainingHours)}h`
                        : "—"
                      : usage?.remainingAmount != null
                      ? `${retainer.currency} ${formatCurrency(usage.remainingAmount, false, retainer.currency)}`
                      : "—";

                  const utilization = usage?.utilizationPercent;
                  const isOverage = usage?.exceedsContract || false;

                  return (
                    <tr key={retainer.id}>
                      <td>
                        <div className="consultant-cell">
                          <div>
                            <button type="button" className="button button-quiet retainer-detail-link" onClick={() => setDetailId(retainer.id)}>{retainer.name}</button>
                            {project && <span className="table-subline">{project.name}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="role-cell">{client?.name || "Unknown Client"}</span>
                      </td>
                      <td>
                        <span className="badge" style={{ textTransform: "capitalize" }}>
                          {retainer.type === "HOURS" ? "Hours" : "Amount"}
                        </span>
                      </td>
                      <td className="number-cell">
                        <strong>{contracted}</strong>
                      </td>
                      <td className="number-cell">{consumed}</td>
                      <td className="number-cell">
                        <span style={{ color: isOverage ? "#C53030" : undefined }}>
                          {remaining}
                        </span>
                      </td>
                      <td>
                        <div className="utilization-cell">
                          <strong style={{ color: isOverage ? "#C53030" : undefined }}>
                            {utilization == null ? "—" : `${utilization.toFixed(1)}%`}
                          </strong>
                          <span className="mini-progress">
                            <i
                              className={isOverage ? "is-danger" : ""}
                              style={{ width: `${Math.min(utilization ?? 0, 100)}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="muted-cell" style={{ fontSize: "11px" }}>
                        {retainer.startDate}
                        <br />
                        to {retainer.endDate}
                      </td>
                      <td>
                        <StatusBadge
                          tone={
                            retainer.status === "ACTIVE"
                              ? "success"
                              : retainer.status === "DRAFT"
                              ? "neutral"
                              : retainer.status === "EXPIRED"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {retainer.status === "ACTIVE" ? (
                            <>
                              <CheckCircle2 size={12} />
                              Active
                            </>
                          ) : retainer.status === "DRAFT" ? (
                            <>
                              <Clock size={12} />
                              Draft
                            </>
                          ) : retainer.status === "EXPIRED" ? (
                            <>
                              <AlertCircle size={12} />
                              Expired
                            </>
                          ) : (
                            <>
                              <XCircle size={12} />
                              Terminated
                            </>
                          )}
                        </StatusBadge>
                      </td>
                      {canManage && (
                        <td style={{ position: "relative" }}>
                          <button
                            className="row-more"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionMenu(actionMenu === retainer.id ? null : retainer.id);
                            }}
                            aria-label={`Actions for ${retainer.name}`}
                          >
                            <MoreHorizontal size={17} />
                          </button>
                          {actionMenu === retainer.id && (
                            <div className="floating-menu action-menu">
                              <button onClick={() => openEdit(retainer)}>
                                <Edit3 size={14} />
                                Edit Contract
                              </button>
                              {retainer.status === "DRAFT" && (
                                <button onClick={() => handleActivate(retainer)}>
                                  <CheckCircle2 size={14} />
                                  Activate
                                </button>
                              )}
                              {retainer.status !== "TERMINATED" && (
                                <button
                                  onClick={() => handleTerminate(retainer)}
                                  style={{ color: "#C53030" }}
                                >
                                  <XCircle size={14} />
                                  Terminate
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="empty-state">
              <WalletCards size={20} />
              <strong>
                {query || statusFilter !== "all" || typeFilter !== "all"
                  ? "No retainers match these filters"
                  : "No retainer agreements yet"}
              </strong>
              <p>
                {query || statusFilter !== "all" || typeFilter !== "all"
                  ? "Try adjusting your search or filter criteria."
                  : canManage
                  ? "Create your first retainer agreement to start tracking contract usage."
                  : "Retainer contracts will appear here once created."}
              </p>
            </div>
          )}

          {usageLoading && <div className="sr-only" role="status">Loading contract usage</div>}
          {usageError && <div className="error-panel" role="alert" style={{ margin: 16, padding: 12 }}>Some contract usage could not be loaded. <button type="button" className="button button-quiet" onClick={() => void Promise.all(usageQueries.map((result) => result.refetch()))}>Retry usage</button></div>}
          {filtered.length > 0 && (
            <div className="table-footer">
              <span>
                Showing {filtered.length} of {retainers.length} retainer agreements
              </span>
            </div>
          )}
        </article>
      </div>

      {detailId && (
        <div className="drawer-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailId(null); }}>
          <aside className="detail-drawer retainer-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="retainer-detail-title">
            <div className="retainer-detail-header">
              <div><span className="panel-eyebrow">Retainer details</span><h2 id="retainer-detail-title">{detailQuery.data?.name ?? "Contract overview"}</h2></div>
              <button type="button" className="icon-button" onClick={() => setDetailId(null)} aria-label="Close retainer details"><X size={18} /></button>
            </div>
            {detailQuery.isLoading ? <div role="status" aria-label="Loading retainer details"><div className="overview-skeleton-block" /><div className="overview-skeleton-block" style={{ marginTop: 12 }} /></div> : null}
            {detailQuery.error ? <div className="error-panel" role="alert">{detailQuery.error.message}<button type="button" className="button button-quiet" onClick={() => void detailQuery.refetch()}>Retry</button></div> : null}
            {detailQuery.data && (() => {
              const record = detailQuery.data;
              const usage = retainerUsages.get(record.id);
              const client = clients.find((item) => item.id === record.clientId);
              const project = record.projectId ? projects.find((item) => item.id === record.projectId) : null;
              const alerts = alertsQuery.data?.filter((alert) => alert.retainerId === record.id) ?? [];
              const utilization = usage?.utilizationPercent;
              const contracted = record.type === "HOURS" ? record.contractedHours == null ? "—" : `${formatNumber(record.contractedHours)} hours` : record.contractedAmount == null ? "—" : `${record.currency} ${formatCurrency(record.contractedAmount, false, record.currency)}`;
              const consumed = usage ? record.type === "HOURS" ? `${formatNumber(usage.approvedHours)} hours` : usage.approvedAmount == null ? "—" : `${record.currency} ${formatCurrency(usage.approvedAmount, false, record.currency)}` : usageLoading ? "Loading usage…" : usageError ? "Usage unavailable" : "—";
              const remaining = usage ? record.type === "HOURS" ? usage.remainingHours == null ? "—" : `${formatNumber(usage.remainingHours)} hours` : usage.remainingAmount == null ? "—" : `${record.currency} ${formatCurrency(usage.remainingAmount, false, record.currency)}` : "—";
              return <>
                <div className="retainer-detail-status"><StatusBadge tone={record.status === "ACTIVE" ? "success" : record.status === "EXPIRED" ? "warning" : record.status === "TERMINATED" ? "danger" : "neutral"}>{record.status}</StatusBadge><span>{record.type === "HOURS" ? "Hour-based contract" : "Amount-based contract"}</span></div>
                <dl className="retainer-detail-list">
                  <DetailRow key="client" label="Client" value={client?.name ?? "Unavailable"} />
                  <DetailRow key="project" label="Project" value={project?.name ?? (record.projectId ? "Unavailable" : "Client-wide") } />
                  <DetailRow key="period" label="Contract period" value={`${record.startDate} to ${record.endDate}`} />
                  <DetailRow key="frequency" label="Billing frequency" value={record.billingFrequency} />
                  <DetailRow key="rollover" label="Rollover" value={record.rolloverAllowed ? "Allowed" : "Not allowed"} />
                  <DetailRow key="threshold" label="Alert threshold" value={`${record.alertThresholdPercent}%`} />
                  <DetailRow key="contracted" label="Contracted" value={contracted} />
                  <DetailRow key="usage" label="Approved usage" value={consumed} />
                  <DetailRow key="remaining" label="Remaining" value={remaining} />
                </dl>
                <section className="retainer-detail-usage" aria-label="Contract utilization">
                  <div><strong>Utilization</strong><b>{utilization == null ? "—" : `${utilization.toFixed(1)}%`}</b></div>
                  <div className="retainer-detail-progress" role="progressbar" aria-label="Retainer utilization" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(utilization ?? 0, 100)}><span className={usage?.exceedsContract ? "is-exceeded" : ""} style={{ width: `${Math.min(utilization ?? 0, 100)}%` }} /></div>
                  {usage?.exceedsContract && <p className="retainer-exceeded" role="status">Contract limit exceeded.</p>}
                </section>
                <section className="retainer-detail-alerts"><h3>Alerts</h3>{alertsQuery.isLoading ? <p>Loading alerts…</p> : alertsQuery.error ? <p role="alert">Alerts could not be loaded.</p> : alerts.length ? <ul>{alerts.map((alert) => <li key={alert.type}><StatusBadge tone={alert.severity === "critical" ? "danger" : "warning"}>{alert.type}</StatusBadge><span>{alert.message}</span></li>)}</ul> : <p>No active alerts for this retainer.</p>}</section>
                {canManage && <div className="retainer-detail-actions"><button type="button" className="button button-quiet" onClick={() => { openEdit(record); setDetailId(null); }}><Edit3 size={15} /> Edit</button>{record.status === "DRAFT" && <button type="button" className="button button-primary" onClick={() => void handleActivate(record)}><CheckCircle2 size={15} /> Activate</button>}{record.status !== "TERMINATED" && <button type="button" className="button button-danger" onClick={() => void handleTerminate(record)}><XCircle size={15} /> Terminate</button>}</div>}
              </>;
            })()}
          </aside>
        </div>
      )}

      {/* Form Drawer */}
      {formOpen && (
        <div className="drawer-scrim" onClick={() => setFormOpen(false)}>
          <aside className="detail-drawer form-drawer" onClick={(e) => e.stopPropagation()}>
            <RetainerForm
              record={formRecord}
              records={retainers}
              clients={clients}
              projects={projects}
              onSubmit={formRecord ? handleUpdate : handleCreate}
              onCancel={() => setFormOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}

      {/* Click away to close action menu */}
      {actionMenu && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10,
          }}
          onClick={() => setActionMenu(null)}
        />
      )}
    </AppShell>
  );
}

function SummaryCount({ label, count, caption }: { label: string; count: number; caption: string }) {
  return <div className="directory-summary-item"><span className="summary-label">{label}</span><strong>{count}</strong><small>{caption}</small></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
