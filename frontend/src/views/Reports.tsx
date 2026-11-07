import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Filter, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, PanelHeader, StatusBadge } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import type { Client, Consultant, Project, ReportingPeriod } from "@/types";
import { availableWorkingHours, downloadCsv, formatCurrency, formatNumber, periodDateRange, utilizationFormula } from "@/lib/calculations";
import { backendErrorMessage, type BackendStatus } from "@/lib/backendService";
import { trpc } from "@/lib/trpc";

interface ReportsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  clients: Client[];
  projects: Project[];
  backendStatus: BackendStatus;
  onRetry: () => void;
}

type ReportType = "utilization" | "timeDetail" | "projectRevenue" | "clientAudit";

export default function Reports({ period, onPeriodChange, consultants, clients, projects, backendStatus, onRetry }: ReportsProps) {
  const { can } = useAuth();
  const [reportType, setReportType] = useState<ReportType>("utilization");
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedClient, setSelectedClient] = useState("All");
  const [query, setQuery] = useState("");
  const [exported, setExported] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const range = useMemo(() => periodDateRange(period), [period]);
  const canUtilization = can("metrics.utilization");
  const canTimeDetail = can("time.read");
  const canProjectRevenue = can("projects.read") && can("metrics.financial");
  const canClientAudit = can("clients.read");
  const availableReports: { id: ReportType; title: string }[] = [
    ...(canUtilization ? [{ id: "utilization" as const, title: "Utilization Summary" }] : []),
    ...(canTimeDetail ? [{ id: "timeDetail" as const, title: "Consultant Time Detail" }] : []),
    ...(canProjectRevenue ? [{ id: "projectRevenue" as const, title: "Project Revenue Breakdown" }] : []),
    ...(canClientAudit ? [{ id: "clientAudit" as const, title: "Client Audit" }] : []),
  ];

  const entryQuery = trpc.timeEntries.list.useQuery(
    { ...range, page: 1, pageSize: 100 },
    { enabled: canTimeDetail && reportType === "timeDetail", retry: false },
  );
  const extraEntryPages = trpc.useQueries((queries) => {
    const pageCount = Math.ceil((entryQuery.data?.total ?? 0) / 100);
    return Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => queries.timeEntries.list(
      { ...range, page: index + 2, pageSize: 100 },
      { enabled: canTimeDetail && reportType === "timeDetail", retry: false },
    ));
  });
  const allEntries = useMemo(() => [
    ...(entryQuery.data?.items ?? []),
    ...extraEntryPages.flatMap((page) => page.data?.items ?? []),
  ], [entryQuery.data, extraEntryPages]);

  const consultantMetricQueries = trpc.useQueries((queries) => consultants.map((consultant) =>
    queries.timeEntries.metrics({ ...range, consultantId: consultant.id }, {
      enabled: canUtilization && reportType === "utilization",
      retry: false,
    }),
  ));
  const projectMetricQueries = trpc.useQueries((queries) => projects.map((project) =>
    queries.timeEntries.metrics({ ...range, projectId: project.id }, {
      enabled: canProjectRevenue && reportType === "projectRevenue",
      retry: false,
    }),
  ));

  const departments = useMemo(() => ["All", ...new Set(consultants.map((consultant) => consultant.department))], [consultants]);
  const normalizedQuery = query.trim().toLowerCase();
  const utilizationRows = useMemo(() => consultants.flatMap((consultant, index) => {
    const metrics = consultantMetricQueries[index]?.data;
    const availableHours = availableWorkingHours(consultant, period, range);
    const utilization = metrics ? utilizationFormula(metrics.approvedBillableHours, availableHours) : null;
    const row = {
      code: consultant.employeeCode,
      name: consultant.name,
      department: consultant.department,
      role: consultant.role,
      availableHours,
      billableHours: metrics?.approvedBillableHours ?? 0,
      nonBillableHours: metrics?.approvedNonBillableHours ?? 0,
      utilization,
    };
    const matchesDept = selectedDept === "All" || row.department === selectedDept;
    const matchesSearch = !normalizedQuery || `${row.code} ${row.name} ${row.department} ${row.role}`.toLowerCase().includes(normalizedQuery);
    return matchesDept && matchesSearch ? [row] : [];
  }), [consultants, consultantMetricQueries, period, range, selectedDept, normalizedQuery]);

  const timeDetailRows = useMemo(() => allEntries.filter((entry) => {
    const consultant = consultants.find((item) => item.id === entry.consultantId);
    const client = clients.find((item) => item.id === entry.clientId);
    const project = projects.find((item) => item.id === entry.projectId);
    const matchesSearch = !normalizedQuery || `${entry.description} ${consultant?.name ?? ""} ${client?.name ?? ""} ${project?.name ?? ""}`.toLowerCase().includes(normalizedQuery);
    return matchesSearch && (selectedClient === "All" || entry.clientId === selectedClient);
  }), [allEntries, consultants, clients, projects, normalizedQuery, selectedClient]);

  const projectRevenueRows = useMemo(() => projects.flatMap((project, index) => {
    const metrics = projectMetricQueries[index]?.data;
    const client = clients.find((item) => item.id === project.clientId);
    const matchesClient = selectedClient === "All" || project.clientId === selectedClient;
    const matchesSearch = !normalizedQuery || `${project.name} ${client?.name ?? ""}`.toLowerCase().includes(normalizedQuery);
    if (!matchesClient || !matchesSearch) return [];
    const revenue = Object.entries(metrics?.approvedEstimatedRevenueByCurrency ?? {})
      .filter((entry): entry is [string, number] => entry[1] != null)
      .map(([currency, amount]) => `${currency} ${formatCurrency(amount, false, currency as "USD" | "EUR" | "GBP")}`)
      .join("; ");
    return [{ project: project.name, client: client?.name ?? "Unavailable", billableHours: metrics?.approvedBillableHours ?? 0, revenue: revenue || "—" }];
  }), [projects, projectMetricQueries, clients, selectedClient, normalizedQuery]);

  const clientAuditRows = useMemo(() => clients.filter((client) =>
    !normalizedQuery || `${client.clientCode ?? ""} ${client.name} ${client.status} ${client.defaultCurrency}`.toLowerCase().includes(normalizedQuery),
  ), [clients, normalizedQuery]);

  const queryError = reportType === "timeDetail"
    ? entryQuery.error ?? extraEntryPages.find((page) => page.error)?.error
    : reportType === "utilization"
      ? consultantMetricQueries.find((result) => result.error)?.error
      : reportType === "projectRevenue"
        ? projectMetricQueries.find((result) => result.error)?.error
        : null;
  const sourceLoading = backendStatus.loading && reportType !== "timeDetail";
  const queryLoading = sourceLoading || (reportType === "timeDetail"
    ? entryQuery.isLoading || extraEntryPages.some((page) => page.isLoading)
    : reportType === "utilization"
      ? consultantMetricQueries.some((result) => result.isLoading)
      : reportType === "projectRevenue"
        ? projectMetricQueries.some((result) => result.isLoading)
        : false);
  const pageHasError = Boolean(queryError || (backendStatus.error && (reportType === "clientAudit" || reportType === "projectRevenue" || reportType === "utilization")));
  const rowsAvailable = reportType === "utilization" ? utilizationRows.length : reportType === "timeDetail" ? timeDetailRows.length : reportType === "projectRevenue" ? projectRevenueRows.length : clientAuditRows.length;

  const handleExport = () => {
    setExportError(null);
    try {
      let filename: string;
      let headers: string[];
      let rows: (string | number)[][];
      if (reportType === "utilization") {
        filename = `utilization-summary-${period}.csv`;
        headers = ["Employee Code", "Consultant", "Department", "Role", "Available Hours", "Approved Billable Hours", "Approved Non-billable Hours", "Billable Utilization"];
        rows = utilizationRows.map((row) => [row.code, row.name, row.department, row.role, row.availableHours, row.billableHours, row.nonBillableHours, row.utilization == null ? "" : `${row.utilization}%`]);
      } else if (reportType === "timeDetail") {
        filename = `consultant-time-detail-${period}.csv`;
        headers = ["Work Date", "Consultant", "Employee Code", "Client", "Project", "Description", "Hours", "Classification", "Status"];
        rows = timeDetailRows.map((entry) => [entry.workDate, consultants.find((item) => item.id === entry.consultantId)?.name ?? "Unavailable", consultants.find((item) => item.id === entry.consultantId)?.employeeCode ?? "", clients.find((item) => item.id === entry.clientId)?.name ?? "Unavailable", projects.find((item) => item.id === entry.projectId)?.name ?? "Unavailable", entry.description, entry.hours, entry.billingClassification, entry.status]);
      } else if (reportType === "projectRevenue") {
        filename = `project-revenue-breakdown-${period}.csv`;
        headers = ["Project", "Client", "Approved Billable Hours", "Approved Revenue by Currency"];
        rows = projectRevenueRows.map((row) => [row.project, row.client, row.billableHours, row.revenue]);
      } else {
        filename = `client-audit.csv`;
        headers = ["Client Code", "Client Name", "Status", "Default Currency"];
        rows = clientAuditRows.map((client) => [client.clientCode ?? "", client.name, client.status, client.defaultCurrency]);
      }
      const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
      downloadCsv(filename, [headers.map(quote).join(","), ...rows.map((row) => row.map(quote).join(","))].join("\r\n"));
      setExported(true);
      window.setTimeout(() => setExported(false), 2500);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "CSV export could not be created.");
    }
  };

  const setReport = (next: ReportType) => {
    setReportType(next);
    setQuery("");
    setSelectedClient("All");
    setExportError(null);
  };

  const currentTitle = availableReports.find((report) => report.id === reportType)?.title ?? "Reports";

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange}>
      <div className="dashboard-page">
        <PageHeader
          eyebrow="Reporting"
          title="Reports"
          description="Export organization-scoped operational reports. CSV files are assembled in your browser from the existing Nexcore API procedures; no backend CSV export endpoint is available."
          actions={<button type="button" className="button button-primary" onClick={handleExport} disabled={queryLoading || pageHasError || rowsAvailable === 0}><Download size={16} /> Download CSV</button>}
        />

        {!availableReports.some((report) => report.id === reportType) && <EmptyState title="Report access unavailable" description="Your role does not have permission to view this report." />}

        <div className="panel report-toolbar">
          <div className="table-tabs report-tabs" role="group" aria-label="Available reports">
            {availableReports.map((report) => <button type="button" aria-pressed={reportType === report.id} className={reportType === report.id ? "is-active" : ""} key={report.id} onClick={() => setReport(report.id)}>{report.title}</button>)}
          </div>
          <div className="table-filters report-filters">
            <label className="table-search"><Search size={15} /><span className="sr-only">Search report rows</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search report rows" /></label>
            {reportType === "utilization" && <label className="select-control"><Filter size={14} /><span className="sr-only">Filter by department</span><select value={selectedDept} onChange={(event) => setSelectedDept(event.target.value)}><option value="All">All departments</option>{departments.filter((department) => department !== "All").map((department) => <option key={department} value={department}>{department}</option>)}</select></label>}
            {(reportType === "timeDetail" || reportType === "projectRevenue") && <label className="select-control"><Filter size={14} /><span className="sr-only">Filter by client</span><select value={selectedClient} onChange={(event) => setSelectedClient(event.target.value)}><option value="All">All clients</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
          </div>
        </div>

        {exportError && <div className="error-panel" role="alert">{exportError}</div>}
        {pageHasError && <div className="error-panel" role="alert"><p>{backendErrorMessage(queryError ?? backendStatus.error)}</p><button type="button" className="button button-quiet" onClick={() => queryError ? void (reportType === "timeDetail" ? entryQuery.refetch() : reportType === "utilization" ? Promise.all(consultantMetricQueries.map((result) => result.refetch())) : Promise.all(projectMetricQueries.map((result) => result.refetch()))) : onRetry()}>Retry</button></div>}

        {availableReports.some((report) => report.id === reportType) && <article className="panel report-panel">
          <PanelHeader eyebrow="CSV source: Nexcore API data" title={currentTitle} detail={reportType === "clientAudit" ? `${rowsAvailable} client records` : `${range.from} to ${range.to} · ${rowsAvailable} rows`} action={<span className="report-source-label"><FileSpreadsheet size={14} /> Browser-generated CSV</span>} />
          {queryLoading && <div className="report-loading" role="status" aria-label={`Loading ${currentTitle}`}><div className="overview-skeleton-block" /><div className="overview-skeleton-block" /><span className="sr-only">Loading report rows…</span></div>}
          {!queryLoading && !pageHasError && rowsAvailable === 0 && <EmptyState title="No report rows" description="No records were returned for this report and period. No sample data is added to exports." />}

          {!queryLoading && !pageHasError && rowsAvailable > 0 && reportType === "utilization" && <div className="table-scroll"><table><thead><tr><th>Employee code</th><th>Consultant</th><th>Department</th><th>Role</th><th>Available hours</th><th>Approved billable</th><th>Approved non-billable</th><th>Utilization</th></tr></thead><tbody>{utilizationRows.map((row) => <tr key={row.code}><td><code>{row.code}</code></td><td><strong>{row.name}</strong></td><td>{row.department}</td><td>{row.role}</td><td className="number-cell">{formatNumber(row.availableHours)}h</td><td className="number-cell">{formatNumber(row.billableHours)}h</td><td className="number-cell">{formatNumber(row.nonBillableHours)}h</td><td>{row.utilization == null ? "—" : `${row.utilization}%`}</td></tr>)}</tbody></table></div>}

          {!queryLoading && !pageHasError && rowsAvailable > 0 && reportType === "timeDetail" && <div className="table-scroll"><table><thead><tr><th>Work date</th><th>Consultant</th><th>Client / project</th><th>Description</th><th>Hours</th><th>Classification</th><th>Status</th></tr></thead><tbody>{timeDetailRows.map((entry) => <tr key={entry.id}><td>{entry.workDate}</td><td>{consultants.find((item) => item.id === entry.consultantId)?.name ?? "Unavailable"}</td><td>{clients.find((item) => item.id === entry.clientId)?.name ?? "Unavailable"}<span className="report-subline">{projects.find((item) => item.id === entry.projectId)?.name ?? "Unavailable"}</span></td><td className="report-description">{entry.description}</td><td className="number-cell">{formatNumber(entry.hours)}h</td><td>{entry.billingClassification}</td><td><StatusBadge tone={entry.status === "Approved" ? "success" : entry.status === "Submitted" ? "warning" : "neutral"}>{entry.status}</StatusBadge></td></tr>)}</tbody></table></div>}

          {!queryLoading && !pageHasError && rowsAvailable > 0 && reportType === "projectRevenue" && <div className="table-scroll"><table><thead><tr><th>Project</th><th>Client</th><th>Approved billable hours</th><th>Approved revenue by currency</th></tr></thead><tbody>{projectRevenueRows.map((row, index) => <tr key={`${row.client}-${row.project}-${index}`}><td><strong>{row.project}</strong></td><td>{row.client}</td><td className="number-cell">{formatNumber(row.billableHours)}h</td><td>{row.revenue}</td></tr>)}</tbody></table></div>}

          {!queryLoading && !pageHasError && rowsAvailable > 0 && reportType === "clientAudit" && <div className="table-scroll"><table><thead><tr><th>Client code</th><th>Client</th><th>Status</th><th>Default currency</th></tr></thead><tbody>{clientAuditRows.map((client) => <tr key={client.id}><td><code>{client.clientCode ?? "—"}</code></td><td><strong>{client.name}</strong></td><td><StatusBadge tone={client.status === "Active" ? "success" : "neutral"}>{client.status}</StatusBadge></td><td>{client.defaultCurrency}</td></tr>)}</tbody></table></div>}
          {!queryLoading && !pageHasError && rowsAvailable > 0 && <div className="table-footer"><span>{formatNumber(rowsAvailable)} report rows · {reportType === "timeDetail" ? formatNumber(entryQuery.data?.total ?? 0) : "Organization-scoped API data"}</span></div>}
        </article>}

        {exported && <div className="toast" role="status">CSV download started.</div>}
      </div>
    </AppShell>
  );
}
