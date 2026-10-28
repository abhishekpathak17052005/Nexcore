import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Check, ChevronDown, Download, Edit3, Filter, Mail, MoreHorizontal, Plus, Search, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BackendState } from "@/components/BackendState";
import { ConsultantForm } from "@/components/ConsultantForm";
import { EmptyState, PanelHeader, StatusBadge } from "@/components/DashboardPrimitives";
import { consultantsToCsv, downloadCsv, filterConsultants, formatCurrency, sortConsultants, type ConsultantSortKey } from "@/lib/calculations";
import type { Client, Consultant, ConsultantFormValues, EmploymentStatus, Project, ReportingPeriod } from "@/types";
import type { TimeEntry } from "@/types";
import type { BackendStatus } from "@/lib/backendService";
import { useAuth } from "@/contexts/AuthContext";

interface ConsultantsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  records: Consultant[];
  timeEntries: TimeEntry[];
  clients: Client[];
  projects: Project[];
  backendStatus: BackendStatus;
  onCreate: (values: ConsultantFormValues) => Promise<void>;
  onUpdate: (id: string, values: ConsultantFormValues) => Promise<void>;
  onRetry: () => void;
}

const pageSize = 6;

export default function Consultants({ period, onPeriodChange, records, timeEntries, clients, projects, backendStatus, onCreate, onUpdate, onRetry }: ConsultantsProps) {
  const { can } = useAuth();
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

  const roles = useMemo(() => ["All roles", ...new Set(records.map((record) => record.role))], [records]);
  const departments = useMemo(() => ["All teams", ...new Set(records.map((record) => record.department))], [records]);
  const filtered = useMemo(() => filterConsultants(records, query, department, role, employmentStatus), [records, query, department, role, employmentStatus]);
  const sorted = useMemo(() => sortConsultants(filtered, sortKey, sortDirection), [filtered, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  const activeCount = records.filter((record) => record.employmentStatus === "Active").length;

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
  const exportCurrent = () => { downloadCsv("consultants-export.csv", consultantsToCsv(sorted)); showToast("CSV export started for the filtered directory."); };

  if (backendStatus.enabled && !backendStatus.ready) return <AppShell period={period} onPeriodChange={onPeriodChange} alertCount={0}><div className="dashboard-page"><BackendState loading={backendStatus.loading} error={backendStatus.error} onRetry={onRetry} title="Consultant records unavailable" /></div></AppShell>;

  return <AppShell period={period} onPeriodChange={onPeriodChange} alertCount={4}>
    <div className="dashboard-page consultants-page">
      <div className="dev-banner"><span className="dev-banner-dot" />Authenticated backend records<span className="dev-banner-separator">·</span><span>Changes persist through the application database</span></div>
      <div className="page-heading-row"><div><p className="eyebrow">People operations <span className="eyebrow-dot" /></p><h1>Consultants</h1><p className="page-subtitle">Manage consultant profiles, capacity, rates, and delivery assignments.</p></div><div className="heading-actions"><span className="last-updated"><UsersRound size={14} />{activeCount} active of {records.length} records</span>{can("consultants.manage") && <button className="button button-primary" onClick={openAdd}><Plus size={16} />Add consultant</button>}</div></div>
      <section className="directory-summary"><div className="directory-summary-item"><span className="summary-label">Directory records</span><strong>{records.length}</strong><small>Persistent profiles</small></div><div className="directory-summary-item"><span className="summary-label">Active consultants</span><strong>{activeCount}</strong><small>Eligible for current capacity view</small></div><div className="directory-summary-item"><span className="summary-label">Teams represented</span><strong>{new Set(records.map((record) => record.department)).size}</strong><small>Across the directory</small></div><div className="directory-summary-item"><span className="summary-label">Filtered results</span><strong>{sorted.length}</strong><small>{sorted.length === records.length ? "No filters applied" : "Current filter set"}</small></div></section>
      <article className="panel directory-panel"><div className="directory-panel-header"><PanelHeader eyebrow="People directory" title="Consultant records" detail="Search by name, employee code, email, role, or department." action={<button className="button button-quiet" onClick={exportCurrent}><Download size={14} />Export CSV</button>} /></div><div className="directory-toolbar"><label className="table-search directory-search"><Search size={15} /><span className="sr-only">Search consultants</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, code, or email" /></label><label className="select-control directory-select"><span className="sr-only">Filter by role</span><select value={role} onChange={(event) => { setRole(event.target.value); setPage(1); }}>{roles.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></label><label className="select-control directory-select"><span className="sr-only">Filter by department</span><select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}>{departments.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></label><label className="select-control directory-select"><span className="sr-only">Filter by employment status</span><select value={employmentStatus} onChange={(event) => { setEmploymentStatus(event.target.value); setPage(1); }}>{["All statuses", "Active", "On leave", "Inactive"].map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={13} /></label><button className="icon-button filter-icon-button" aria-label="Additional filters"><SlidersHorizontal size={16} /></button>{(query || role !== "All roles" || department !== "All teams" || employmentStatus !== "All statuses") && <button className="clear-filters" onClick={clearFilters}><X size={13} />Clear</button>}</div><div className="table-scroll"><table className="directory-table"><thead><tr><th><SortButton label="Consultant" sortKey="name" activeKey={sortKey} direction={sortDirection} onClick={toggleSort} /></th><th><SortButton label="Role" sortKey="role" activeKey={sortKey} direction={sortDirection} onClick={toggleSort} /></th><th>Department</th><th><SortButton label="Capacity" sortKey="availableHours" activeKey={sortKey} direction={sortDirection} onClick={toggleSort} /></th><th><SortButton label="Utilization" sortKey="utilization" activeKey={sortKey} direction={sortDirection} onClick={toggleSort} /></th><th>Rate</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{pageRows.map((record) => <tr key={record.id} tabIndex={0} onClick={() => setSelected(record)} onKeyDown={(event) => { if (event.key === "Enter") setSelected(record); }}><td><div className="consultant-cell"><div className="avatar" style={{ background: `${record.color}18`, color: record.color }}>{record.initials}</div><div><strong>{record.name}</strong><span>{record.employeeCode} · {record.email}</span></div></div></td><td><span className="role-cell">{record.role}</span></td><td><span className="department-chip">{record.department}</span></td><td><div className="directory-metric"><strong>{record.weeklyCapacityHours}h</strong><span>{record.availableHours}h current period</span></div></td><td><div className="utilization-cell"><strong>{record.utilization}%</strong><span className="mini-progress"><i className={record.status === "Over capacity" ? "is-danger" : record.status === "Watch" ? "is-warning" : ""} style={{ width: `${Math.min(record.utilization, 100)}%` }} /></span></div></td><td className="rate-cell">{formatCurrency(record.billingRate)}<span>/ hour</span></td><td><StatusBadge tone={record.employmentStatus === "Active" ? "success" : record.employmentStatus === "On leave" ? "warning" : "neutral"}>{record.employmentStatus}</StatusBadge></td><td><button className="row-more" onClick={(event) => { event.stopPropagation(); setSelected(record); }} aria-label={`Open ${record.name}`}><MoreHorizontal size={17} /></button></td></tr>)}</tbody></table></div>{pageRows.length === 0 && <EmptyState title="No consultants match these filters" description="Try clearing a filter or searching by another field." />}<div className="table-footer"><span>Showing {pageRows.length} of {sorted.length} filtered records</span><div className="pagination-controls"><button className="pagination-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 5).map((pageNumber) => <button key={pageNumber} className={`pagination-button ${pageNumber === page ? "is-current" : ""}`} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button className="pagination-button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>›</button></div></div></article>
    </div>
    {selected && <ConsultantDetail record={selected} timeEntries={timeEntries} clients={clients} projects={projects} onClose={() => setSelected(null)} onEdit={can("consultants.manage") ? () => openEdit(selected) : undefined} />}
    {formMode && <div className="drawer-scrim" onClick={() => setFormMode(null)}><aside className="detail-drawer form-drawer" onClick={(event) => event.stopPropagation()}><ConsultantForm record={formMode === "edit" ? formRecord : undefined} records={records} onSubmit={formMode === "edit" ? handleUpdate : handleCreate} onCancel={() => setFormMode(null)} /></aside></div>}
    {toast && <div className="toast"><Check size={15} />{toast}</div>}
  </AppShell>;
}

function SortButton({ label, sortKey, activeKey, direction, onClick }: { label: string; sortKey: ConsultantSortKey; activeKey: ConsultantSortKey; direction: "asc" | "desc"; onClick: (key: ConsultantSortKey) => void }) { return <button onClick={() => onClick(sortKey)}>{label}<span className={`sort-indicator ${activeKey === sortKey ? "is-active" : ""}`}>{activeKey === sortKey ? direction === "asc" ? "↑" : "↓" : "↕"}</span></button>; }

function ConsultantDetail({ record, timeEntries, clients, projects, onClose, onEdit }: { record: Consultant; timeEntries: TimeEntry[]; clients: Client[]; projects: Project[]; onClose: () => void; onEdit?: () => void }) {
  const recentEntries = timeEntries.filter((entry) => entry.consultantId === record.id).sort((a, b) => b.workDate.localeCompare(a.workDate)).slice(0, 4);
  return <div className="drawer-scrim" onClick={onClose}><aside className="detail-drawer consultant-detail-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="panel-eyebrow">Consultant record</span><h2>{record.name}</h2><p>{record.employeeCode} · {record.email}</p></div><button className="icon-button" onClick={onClose} aria-label="Close consultant details"><X size={18} /></button></div><div className="drawer-profile"><div className="avatar avatar-large" style={{ background: `${record.color}18`, color: record.color }}>{record.initials}</div><div><span>{record.role} · {record.department}</span><strong>{record.utilization}%</strong><StatusBadge tone={record.employmentStatus === "Active" ? "success" : record.employmentStatus === "On leave" ? "warning" : "neutral"}>{record.employmentStatus}</StatusBadge></div></div><div className="drawer-metrics"><div><span>Weekly capacity</span><strong>{record.weeklyCapacityHours}h</strong></div><div><span>Billable period</span><strong>{record.billableHours}h</strong></div><div><span>Non-billable</span><strong>{record.nonBillableHours?.toFixed(1) ?? "—"}h</strong></div><div><span>Billing rate</span><strong>{formatCurrency(record.billingRate)}</strong></div></div><div className="drawer-detail-section"><span className="panel-eyebrow">Profile</span><dl className="detail-list"><div><dt>Start date</dt><dd>{record.startDate}</dd></div><div><dt>Currency</dt><dd>{record.currency}</dd></div><div><dt>Available hours</dt><dd>{record.availableHours}h</dd></div><div><dt>Estimated revenue</dt><dd>{formatCurrency(record.revenue, true)} <small>current-period estimate</small></dd></div></dl></div><div className="drawer-detail-section"><span className="panel-eyebrow">Assigned projects</span>{record.assignedProjects.length > 0 ? <ul className="project-list">{record.assignedProjects.map((project) => <li key={project}><span className="project-dot" />{project}</li>)}</ul> : <div className="detail-empty"><FolderKanbanIcon /><strong>No assigned projects</strong><span>No project assignment data is available for this consultant record.</span></div>}</div><div className="drawer-detail-section"><span className="panel-eyebrow">Recent time entries</span>{recentEntries.length > 0 ? <ul className="project-list time-entry-history">{recentEntries.map((entry) => { const client = clients.find((item) => item.id === entry.clientId); const project = projects.find((item) => item.id === entry.projectId); return <li key={entry.id}><span className="project-dot" /><span><strong>{entry.workDate} · {entry.hours}h · {entry.status}</strong><small>{client?.name ?? entry.clientId} / {project?.name ?? entry.projectId}</small></span></li>; })}</ul> : <div className="detail-empty"><Mail size={17} /><strong>No time-entry history available</strong><span>Recent entries will appear when this consultant has connected time data. No history is fabricated here.</span></div>}</div><div className="drawer-form-actions"><button className="button button-quiet" onClick={onClose}>Close</button>{onEdit && <button className="button button-primary" onClick={onEdit}><Edit3 size={15} />Edit consultant</button>}</div></aside></div>;
}

function FolderKanbanIcon() { return <span className="detail-empty-icon"><Filter size={16} /></span>; }
