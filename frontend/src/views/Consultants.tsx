import { useMemo, useState } from "react";
import { Check, ChevronDown, Download, Edit3, Mail, MoreHorizontal, Plus, Search, UsersRound, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BackendState } from "@/components/BackendState";
import { ConsultantForm } from "@/components/ConsultantForm";
import { EmptyState, PanelHeader, StatusBadge } from "@/components/DashboardPrimitives";
import { availableWorkingHours, consultantsToCsv, downloadCsv, filterConsultants, formatCurrency, formatNumber, periodDateRange, sortConsultants, utilizationFormula, type ConsultantSortKey } from "@/lib/calculations";
import type { Client, Consultant, ConsultantFormValues, EmploymentStatus, Project, ReportingPeriod } from "@/types";
import type { BackendStatus } from "@/lib/backendService";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";

interface ConsultantsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  records: Consultant[];
  clients: Client[];
  projects: Project[];
  backendStatus: BackendStatus;
  onCreate: (values: ConsultantFormValues) => Promise<void>;
  onUpdate: (id: string, values: ConsultantFormValues) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
  onRetry: () => void;
}

const pageSize = 6;

export default function Consultants({ period, onPeriodChange, records, clients, projects, backendStatus, onCreate, onUpdate, onDeactivate, onRetry }: ConsultantsProps) {
  const { can } = useAuth();
  const canViewFinancials = can("metrics.financial");
  // Keep this view resilient to an incomplete/stale query cache during deploys.
  // The API contract is an array; an invalid cache value should render as empty,
  // not crash the entire application shell.
  const directoryRecords = Array.isArray(records) ? records : [];
  const directoryClients = Array.isArray(clients) ? clients : [];
  const directoryProjects = Array.isArray(projects) ? projects : [];
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All roles");
  const [department, setDepartment] = useState("All teams");
  const [employmentStatus, setEmploymentStatus] = useState("All statuses");
  const [sortKey, setSortKey] = useState<ConsultantSortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Consultant | null>(null);
  const [formMode, setFormMode] = useState<"add" | "edit" | null>(null);
  const [formRecord, setFormRecord] = useState<Consultant | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  const roles = useMemo(() => ["All roles", ...new Set(directoryRecords.map((record) => record.role))], [directoryRecords]);
  const departments = useMemo(() => ["All teams", ...new Set(directoryRecords.map((record) => record.department))], [directoryRecords]);
  const filtered = useMemo(() => filterConsultants(directoryRecords, query, department, role, employmentStatus), [directoryRecords, query, department, role, employmentStatus]);
  const sorted = useMemo(() => sortConsultants(filtered, sortKey, sortDirection), [filtered, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const activeCount = directoryRecords.filter((record) => record.employmentStatus === "Active").length;

  const toggleSort = (key: ConsultantSortKey) => {
    setPage(1);
    if (sortKey === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection(key === "name" || key === "role" ? "asc" : "desc"); }
  };
  const clearFilters = () => { setQuery(""); setRole("All roles"); setDepartment("All teams"); setEmploymentStatus("All statuses"); setPage(1); };
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 2600); };
  const openAdd = () => { setFormRecord(undefined); setFormMode("add"); };
  const openEdit = (record: Consultant) => { setSelected(null); setFormRecord(record); setFormMode("edit"); };
  const handleCreate = async (values: ConsultantFormValues) => { try { await onCreate(values); setFormMode(null); showToast("Consultant saved to persistent records."); } catch (error) { showToast(error instanceof Error ? error.message : "Consultant could not be saved."); } };
  const handleUpdate = async (values: ConsultantFormValues) => { if (!formRecord) return; try { await onUpdate(formRecord.id, values); setFormMode(null); showToast("Consultant updated in persistent records."); } catch (error) { showToast(error instanceof Error ? error.message : "Consultant could not be updated."); } };
  const handleDeactivate = async (record: Consultant) => { if (!window.confirm(`Deactivate ${record.name}?`)) return; try { await onDeactivate(record.id); setSelected(null); showToast("Consultant deactivated."); } catch (error) { showToast(error instanceof Error ? error.message : "Consultant could not be deactivated."); } };
  const exportCurrent = () => { downloadCsv("consultants-export.csv", consultantsToCsv(sorted, canViewFinancials)); showToast("CSV export started for the filtered directory."); };

  if (backendStatus.enabled && !backendStatus.ready) return <AppShell period={period} onPeriodChange={onPeriodChange} alertCount={0}><div className="dashboard-page"><BackendState loading={backendStatus.loading} error={backendStatus.error} onRetry={onRetry} title="Consultant records unavailable" /></div></AppShell>;

  return <AppShell period={period} onPeriodChange={onPeriodChange}>
    <div className="dashboard-page consultants-page">
      <div className="dev-banner"><span className="dev-banner-dot" />Authenticated backend records<span className="dev-banner-separator">·</span><span>Changes persist through the application database</span></div>
      <div className="page-heading-row"><div><p className="eyebrow">People operations <span className="eyebrow-dot" /></p><h1>Consultants</h1><p className="page-subtitle">Manage consultant profiles, capacity, utilization, and status.</p></div><div className="heading-actions"><span className="last-updated"><UsersRound size={14} />{activeCount} active of {directoryRecords.length} records</span>{can("consultants.manage") && canViewFinancials && <button className="button button-primary" onClick={openAdd}><Plus size={16} />Add consultant</button>}</div></div>
      <section className="directory-summary"><div className="directory-summary-item"><span className="summary-label">Directory records</span><strong>{directoryRecords.length}</strong><small>Organization profiles</small></div><div className="directory-summary-item"><span className="summary-label">Active consultants</span><strong>{activeCount}</strong><small>Current active status</small></div><div className="directory-summary-item"><span className="summary-label">Teams represented</span><strong>{new Set(directoryRecords.map((record) => record.department)).size}</strong><small>Across the directory</small></div><div className="directory-summary-item"><span className="summary-label">Filtered results</span><strong>{sorted.length}</strong><small>{sorted.length === directoryRecords.length ? "No filters applied" : "Current filter set"}</small></div></section>
      <article className="panel directory-panel"><div className="directory-panel-header"><PanelHeader eyebrow="People directory" title="Consultant records" detail="Search by name, employee code, email, role, or department." action={<button className="button button-quiet" onClick={exportCurrent}><Download size={14} />Export CSV</button>} /></div><div className="directory-toolbar"><label className="table-search directory-search"><Search size={15} /><span className="sr-only">Search consultants</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, code, or email" /></label><label className="select-control directory-select"><span className="sr-only">Filter by role</span><select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>{roles.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></label><label className="select-control directory-select"><span className="sr-only">Filter by department</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}>{departments.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></label><label className="select-control directory-select"><span className="sr-only">Filter by employment status</span><select value={employmentStatus} onChange={(event) => { setEmploymentStatus(event.target.value); setPage(1); }}>{["All statuses", "Active", "On leave", "Inactive"].map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></label>{(query || role !== "All roles" || department !== "All teams" || employmentStatus !== "All statuses") && <button className="clear-filters" onClick={clearFilters}><X size={13} />Clear</button>}</div><div className="table-scroll"><table className="directory-table"><thead><tr><th><SortButton label="Consultant" sortKey="name" activeKey={sortKey} direction={sortDirection} onClick={toggleSort} /></th><th><SortButton label="Role" sortKey="role" activeKey={sortKey} direction={sortDirection} onClick={toggleSort} /></th><th>Department</th><th>Weekly capacity</th><th>Utilization</th>{canViewFinancials && <th>Rate</th>}<th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{pageRows.map((record) => <tr key={record.id} role="button" aria-label={`Open ${record.name}`} tabIndex={0} onClick={() => setSelected(record)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(record); } }}><td><div className="consultant-cell"><div className="avatar" style={{ background: `${record.color}18`, color: record.color }}>{record.initials}</div><div><strong>{record.name}</strong><span>{record.employeeCode} · {record.email}</span></div></div></td><td><span className="role-cell">{record.role}</span></td><td><span className="department-chip">{record.department}</span></td><td><div className="directory-metric"><strong>{formatNumber(record.weeklyCapacityHours)}h / wk</strong><span>Contracted capacity</span></div></td><td><span className="muted-cell">Open details for current utilization</span></td>{canViewFinancials && <td className="rate-cell">{record.billingRate == null ? "—" : formatCurrency(record.billingRate, false, record.currency)}{record.billingRate != null && <span>/ hour</span>}</td>}<td><StatusBadge tone={record.employmentStatus === "Active" ? "success" : record.employmentStatus === "On leave" ? "warning" : "neutral"}>{record.employmentStatus}</StatusBadge></td><td><button className="row-more" onClick={(event) => { event.stopPropagation(); setSelected(record); }} aria-label={`Open ${record.name}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div>{pageRows.length === 0 && <EmptyState title="No consultants match these filters" description="Try clearing a filter or searching by another field." />}<div className="table-footer"><span>Showing {pageRows.length} of {sorted.length} filtered records</span><div className="pagination-controls"><button className="pagination-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((pageNumber) => <button key={pageNumber} className={`pagination-button ${pageNumber === page ? "is-current" : ""}`} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button className="pagination-button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>›</button></div></div></article>
    </div>
    {selected && <ConsultantDetail record={selected} period={period} canViewFinancials={canViewFinancials} canViewMetrics={can("metrics.utilization")} canReadTime={can("time.read")} clients={directoryClients} projects={directoryProjects} onClose={() => setSelected(null)} onEdit={can("consultants.manage") ? () => openEdit(selected) : undefined} onDeactivate={can("consultants.manage") && selected.employmentStatus !== "Inactive" ? () => handleDeactivate(selected) : undefined} />}
    {formMode && <div className="drawer-scrim" onClick={() => setFormMode(null)}><aside className="detail-drawer form-drawer" onClick={(event) => event.stopPropagation()}><ConsultantForm canViewFinancials={canViewFinancials} record={formMode === "edit" ? formRecord : undefined} records={directoryRecords} onSubmit={formMode === "edit" ? handleUpdate : handleCreate} onCancel={() => setFormMode(null)} /></aside></div>}
    {toast && <div className="toast"><Check size={15} />{toast}</div>}
  </AppShell>;
}

function SortButton({ label, sortKey, activeKey, direction, onClick }: { label: string; sortKey: ConsultantSortKey; activeKey: ConsultantSortKey; direction: "asc" | "desc"; onClick: (key: ConsultantSortKey) => void }) { return <button onClick={() => onClick(sortKey)}>{label}<span className={`sort-indicator ${activeKey === sortKey ? "is-active" : ""}`}>{activeKey === sortKey ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button>; }

function ConsultantDetail({ record, period, canViewFinancials, canViewMetrics, canReadTime, clients, projects, onClose, onEdit, onDeactivate }: { record: Consultant; period: ReportingPeriod; canViewFinancials: boolean; canViewMetrics: boolean; canReadTime: boolean; clients: Client[]; projects: Project[]; onClose: () => void; onEdit?: () => void; onDeactivate?: () => void }) {
  const range = useMemo(() => periodDateRange(period), [period]);
  const consultantQuery = trpc.consultants.get.useQuery({ id: record.id }, { retry: false });
  const metricsQuery = trpc.timeEntries.metrics.useQuery({ ...range, consultantId: record.id }, { enabled: canViewMetrics, retry: false });
  const entriesQuery = trpc.timeEntries.list.useQuery({ consultantId: record.id, page: 1, pageSize: 100 }, { enabled: canReadTime, retry: false });
  const consultant = consultantQuery.data ?? record;
  const availableHours = availableWorkingHours(consultant, period, range);
  const approvedHours = metricsQuery.data?.approvedBillableHours;
  const utilization = approvedHours == null ? null : utilizationFormula(approvedHours, availableHours);
  const recentEntries = [...(entriesQuery.data?.items ?? [])].sort((a, b) => b.workDate.localeCompare(a.workDate)).slice(0, 4);
  const statusTone = consultant.employmentStatus === "Active" ? "success" : consultant.employmentStatus === "On leave" ? "warning" : "neutral";
  return <div className="drawer-scrim" onClick={onClose}><aside className="detail-drawer consultant-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="consultant-detail-title" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="panel-eyebrow">Consultant record</span><h2 id="consultant-detail-title">{consultant.name}</h2><p>{consultant.employeeCode} · {consultant.email}</p></div><button className="icon-button" onClick={onClose} aria-label="Close consultant details"><X size={18} /></button></div><div className="drawer-profile"><div className="avatar avatar-large" style={{ background: `${consultant.color}18`, color: consultant.color }}>{consultant.initials}</div><div><span>{consultant.role} · {consultant.department}</span><strong>{metricsQuery.isLoading ? "Loading…" : utilization == null ? "—" : `${utilization}%`}</strong><StatusBadge tone={statusTone}>{consultant.employmentStatus}</StatusBadge></div></div>{consultantQuery.error && <div className="form-error-summary" role="alert">Consultant profile could not be refreshed. Showing the directory record.</div>}{metricsQuery.error && <div className="form-error-summary" role="alert">Utilization metrics are unavailable for this period.</div>}<div className="drawer-metrics"><div><span>Weekly capacity</span><strong>{formatNumber(consultant.weeklyCapacityHours)}h</strong></div><div><span>Available this period</span><strong>{formatNumber(availableHours)}h</strong></div><div><span>Approved billable</span><strong>{metricsQuery.isLoading ? "…" : approvedHours == null ? "—" : `${formatNumber(approvedHours)}h`}</strong></div>{canViewFinancials && <div><span>Billing rate</span><strong>{consultant.billingRate == null ? "—" : `${formatCurrency(consultant.billingRate, false, consultant.currency)} / hr`}</strong></div>}</div><div className="drawer-detail-section"><span className="panel-eyebrow">Profile</span><dl className="detail-list"><div><dt>Start date</dt><dd>{consultant.startDate || "—"}</dd></div><div><dt>Employee code</dt><dd>{consultant.employeeCode}</dd></div><div><dt>Department</dt><dd>{consultant.department}</dd></div><div><dt>Role</dt><dd>{consultant.role}</dd></div></dl></div>{canReadTime && <div className="drawer-detail-section"><span className="panel-eyebrow">Recent time entries</span>{entriesQuery.isLoading ? <div className="detail-empty" role="status">Loading time-entry history…</div> : entriesQuery.error ? <div className="detail-empty" role="alert">Time-entry history is unavailable.</div> : recentEntries.length > 0 ? <ul className="project-list time-entry-history">{recentEntries.map((entry) => { const client = clients.find((item) => item.id === entry.clientId); const project = projects.find((item) => item.id === entry.projectId); return <li key={entry.id}><span className="project-dot" /><span><strong>{entry.workDate} · {entry.hours}h · {entry.status}</strong><small>{client?.name ?? entry.clientId} / {project?.name ?? entry.projectId}</small></span></li>; })}</ul> : <div className="detail-empty"><Mail size={17} /><strong>No time-entry history</strong><span>No time entries were returned for this consultant.</span></div>}</div>}<div className="drawer-form-actions"><button className="button button-quiet" onClick={onClose}>Close</button>{onDeactivate && <button className="button button-quiet" onClick={onDeactivate}>Deactivate</button>}{onEdit && <button className="button button-primary" onClick={onEdit}><Edit3 size={15} />Edit consultant</button>}</div></aside></div>;
}
