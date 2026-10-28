import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Filter, Search, Calendar, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PanelHeader } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import type { Client, Consultant, CurrencyCode, Project, ReportingPeriod, TimeEntry } from "@/types";
import { downloadCsv, formatCurrency, formatNumber, availableWorkingHours } from "@/lib/calculations";
import { periodDateRange } from "@/lib/timeEntryService";

interface ReportsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  clients: Client[];
  projects: Project[];
  timeEntries: TimeEntry[];
}

type ReportType = "utilization" | "timeEntries" | "billableSplit" | "revenueByClient";

export default function Reports({
  period,
  onPeriodChange,
  consultants,
  clients,
  projects,
  timeEntries,
}: ReportsProps) {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<ReportType>("utilization");
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedClient, setSelectedClient] = useState("All");
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode | "All">("All");
  const [query, setQuery] = useState("");
  const [exported, setExported] = useState(false);

  const hasFinancialPermission = user?.role === "admin" || user?.role === "finance";

  // Filter entries to reporting period
  const dateRange = periodDateRange(period);
  const periodEntries = useMemo(() => {
    return timeEntries.filter((entry) => {
      if (dateRange.from && entry.workDate < dateRange.from) return false;
      if (dateRange.to && entry.workDate > dateRange.to) return false;
      return true;
    });
  }, [timeEntries, dateRange]);

  const departments = useMemo(() => ["All", ...new Set(consultants.map((c) => c.department))], [consultants]);

  // Report 1: Consultant Utilization Report
  const utilizationReportData = useMemo(() => {
    return consultants
      .filter((c) => selectedDept === "All" || c.department === selectedDept)
      .map((c) => {
        const cEntries = periodEntries.filter((e) => e.consultantId === c.id);
        const billableHours = cEntries.filter((e) => e.status === "Approved" && e.billingClassification === "Billable").reduce((sum, e) => sum + e.hours, 0);
        const nonBillableHours = cEntries.filter((e) => e.status === "Approved" && e.billingClassification === "Non-billable").reduce((sum, e) => sum + e.hours, 0);
        const avail = availableWorkingHours(c, period, dateRange);
        const util = avail > 0 ? Math.round((billableHours / avail) * 1000) / 10 : 0;

        return {
          employeeCode: c.employeeCode,
          name: c.name,
          department: c.department,
          role: c.role,
          weeklyCapacity: c.weeklyCapacityHours,
          availableHours: avail,
          billableHours,
          nonBillableHours,
          utilization: `${util}%`,
          tier: util > 90 ? "Over capacity" : util >= 75 ? "Target" : "Underutilized",
        };
      })
      .filter((r) => {
        const q = query.trim().toLowerCase();
        return !q || r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q);
      });
  }, [consultants, periodEntries, selectedDept, query, period, dateRange]);

  // Report 2: Time Entries Report
  const timeEntriesReportData = useMemo(() => {
    return periodEntries
      .filter((e) => {
        const c = consultants.find((co) => co.id === e.consultantId);
        const cl = clients.find((cli) => cli.id === e.clientId);
        const p = projects.find((pr) => pr.id === e.projectId);
        const q = query.trim().toLowerCase();
        const matchesQuery =
          !q ||
          e.description.toLowerCase().includes(q) ||
          (c?.name.toLowerCase().includes(q) ?? false) ||
          (cl?.name.toLowerCase().includes(q) ?? false);
        const matchesClient = selectedClient === "All" || e.clientId === selectedClient;
        const matchesCurrency = selectedCurrency === "All" || e.currency === selectedCurrency;
        return matchesQuery && matchesClient && matchesCurrency;
      })
      .map((e) => {
        const c = consultants.find((co) => co.id === e.consultantId);
        const cl = clients.find((cli) => cli.id === e.clientId);
        const p = projects.find((pr) => pr.id === e.projectId);
        const estRevenue = (e.billingRateSnapshot ?? 0) * e.hours;

        return {
          workDate: e.workDate,
          consultant: c?.name ?? "Unknown",
          client: cl?.name ?? "Unknown",
          project: p?.name ?? "Unknown",
          description: e.description,
          hours: e.hours,
          classification: e.billingClassification,
          rateSnapshot: e.billingRateSnapshot ? `${e.billingRateSnapshot} ${e.currency}` : "N/A",
          estimatedRevenue: hasFinancialPermission && e.billingRateSnapshot ? `${estRevenue} ${e.currency}` : "Restricted",
          status: e.status,
        };
      });
  }, [periodEntries, consultants, clients, projects, query, selectedClient, selectedCurrency, hasFinancialPermission]);

  // Report 3: Client & Project Delivery Report
  const clientDeliveryReportData = useMemo(() => {
    return clients
      .filter((cl) => selectedClient === "All" || cl.id === selectedClient)
      .flatMap((cl) => {
        const clientProjects = projects.filter((p) => p.clientId === cl.id);
        return clientProjects.map((p) => {
          const pEntries = periodEntries.filter((e) => e.projectId === p.id && e.status === "Approved");
          const totalHours = pEntries.reduce((sum, e) => sum + e.hours, 0);
          const billableHours = pEntries.filter((e) => e.billingClassification === "Billable").reduce((sum, e) => sum + e.hours, 0);
          const activeConsultants = new Set(pEntries.map((e) => e.consultantId)).size;
          const estRevenue = pEntries.reduce((sum, e) => sum + (e.billingRateSnapshot ?? 0) * e.hours, 0);

          return {
            clientCode: cl.clientCode ?? "-",
            clientName: cl.name,
            projectName: p.name,
            projectStatus: p.status,
            currency: p.billingCurrency,
            totalHours,
            billableHours,
            activeConsultants,
            estimatedRevenue: hasFinancialPermission ? `${estRevenue} ${p.billingCurrency}` : "Restricted",
          };
        });
      });
  }, [clients, projects, periodEntries, selectedClient, hasFinancialPermission]);

  // Export to CSV Function
  const handleExport = () => {
    let filename = "";
    let csvData = "";

    const escapeCsv = (val: string | number) => `"${String(val).replaceAll('"', '""')}"`;

    if (reportType === "utilization") {
      filename = `consultant-utilization-report-${period}.csv`;
      const headers = ["Employee Code", "Consultant", "Department", "Role", "Weekly Capacity", "Available Hours", "Billable Hours", "Non-Billable Hours", "Utilization", "Performance Tier"];
      const rows = utilizationReportData.map((r) => [
        escapeCsv(r.employeeCode),
        escapeCsv(r.name),
        escapeCsv(r.department),
        escapeCsv(r.role),
        escapeCsv(r.weeklyCapacity),
        escapeCsv(r.availableHours),
        escapeCsv(r.billableHours),
        escapeCsv(r.nonBillableHours),
        escapeCsv(r.utilization),
        escapeCsv(r.tier),
      ]);
      csvData = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    } else if (reportType === "timeEntries") {
      filename = `time-entries-report-${period}.csv`;
      const headers = ["Work Date", "Consultant", "Client", "Project", "Description", "Hours", "Classification", "Rate Snapshot", "Estimated Revenue", "Status"];
      const rows = timeEntriesReportData.map((r) => [
        escapeCsv(r.workDate),
        escapeCsv(r.consultant),
        escapeCsv(r.client),
        escapeCsv(r.project),
        escapeCsv(r.description),
        escapeCsv(r.hours),
        escapeCsv(r.classification),
        escapeCsv(r.rateSnapshot),
        escapeCsv(r.estimatedRevenue),
        escapeCsv(r.status),
      ]);
      csvData = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    } else if (reportType === "revenueByClient") {
      filename = `client-delivery-report-${period}.csv`;
      const headers = ["Client Code", "Client Name", "Project Name", "Project Status", "Currency", "Total Approved Hours", "Billable Hours", "Active Consultants", "Estimated Revenue"];
      const rows = clientDeliveryReportData.map((r) => [
        escapeCsv(r.clientCode),
        escapeCsv(r.clientName),
        escapeCsv(r.projectName),
        escapeCsv(r.projectStatus),
        escapeCsv(r.currency),
        escapeCsv(r.totalHours),
        escapeCsv(r.billableHours),
        escapeCsv(r.activeConsultants),
        escapeCsv(r.estimatedRevenue),
      ]);
      csvData = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    }

    if (csvData) {
      downloadCsv(filename, csvData);
      setExported(true);
      setTimeout(() => setExported(false), 2500);
    }
  };

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange}>
      <div className="dashboard-page">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">Decision intelligence <span className="eyebrow-dot" /></p>
            <h1>Operational & Delivery Reports</h1>
            <p className="page-subtitle">
              Configurable exportable business reports derived from live MongoDB timesheets and consultant data.
            </p>
          </div>
          <div className="heading-actions">
            <button className="button button-primary" onClick={handleExport}>
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        {/* Report Selector & Filters */}
        <div className="panel" style={{ padding: "18px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <div className="table-tabs" style={{ margin: 0 }}>
              <button
                className={reportType === "utilization" ? "is-active" : ""}
                onClick={() => setReportType("utilization")}
              >
                Consultant Utilization
              </button>
              <button
                className={reportType === "timeEntries" ? "is-active" : ""}
                onClick={() => setReportType("timeEntries")}
              >
                Time Tracking Log
              </button>
              <button
                className={reportType === "revenueByClient" ? "is-active" : ""}
                onClick={() => setReportType("revenueByClient")}
              >
                Client Delivery & Revenue
              </button>
            </div>

            <div className="table-filters" style={{ margin: 0 }}>
              <label className="table-search">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter records..."
                />
              </label>

              {reportType === "utilization" && (
                <label className="select-control">
                  <Filter size={14} />
                  <select value={selectedDept} onChange={(e) => setSelectedDept(e.target.value)}>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d === "All" ? "All departments" : d}</option>
                    ))}
                  </select>
                </label>
              )}

              {reportType !== "utilization" && (
                <label className="select-control">
                  <Filter size={14} />
                  <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)}>
                    <option value="All">All clients</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Report Table Display */}
        <article className="panel">
          {reportType === "utilization" && (
            <>
              <PanelHeader
                eyebrow="Staffing & Allocation"
                title="Consultant Utilization Report"
                detail={`Showing ${utilizationReportData.length} records for ${period.replace("-", " ")}`}
              />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Consultant Name</th>
                      <th>Department</th>
                      <th>Role</th>
                      <th>Available Hours</th>
                      <th>Billable Hours</th>
                      <th>Non-Billable</th>
                      <th>Utilization %</th>
                      <th>Performance Tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {utilizationReportData.map((row) => (
                      <tr key={row.employeeCode}>
                        <td><code>{row.employeeCode}</code></td>
                        <td><strong>{row.name}</strong></td>
                        <td>{row.department}</td>
                        <td>{row.role}</td>
                        <td className="number-cell">{row.availableHours}h</td>
                        <td className="number-cell" style={{ fontWeight: 600, color: "#2B6CB0" }}>{row.billableHours}h</td>
                        <td className="number-cell" style={{ color: "#718096" }}>{row.nonBillableHours}h</td>
                        <td><strong>{row.utilization}</strong></td>
                        <td>
                          <span className={`badge ${row.tier === "Target" ? "badge-success" : row.tier === "Over capacity" ? "badge-danger" : "badge-warning"}`}>
                            {row.tier}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === "timeEntries" && (
            <>
              <PanelHeader
                eyebrow="Activity Audit Trail"
                title="Time-Entry Detail Report"
                detail={`Showing ${timeEntriesReportData.length} log lines for ${period.replace("-", " ")}`}
              />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Work Date</th>
                      <th>Consultant</th>
                      <th>Client / Project</th>
                      <th>Description</th>
                      <th>Hours</th>
                      <th>Classification</th>
                      <th>Rate Snapshot</th>
                      <th>Estimated Revenue</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeEntriesReportData.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: "13px" }}>{row.workDate}</td>
                        <td><strong>{row.consultant}</strong></td>
                        <td>
                          <div>{row.client}</div>
                          <div style={{ fontSize: "12px", color: "#718096" }}>{row.project}</div>
                        </td>
                        <td style={{ maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.description}
                        </td>
                        <td className="number-cell">{row.hours}h</td>
                        <td>
                          <span className="badge" style={{ background: row.classification === "Billable" ? "#EBF8FF" : "#EDF2F7", color: row.classification === "Billable" ? "#2B6CB0" : "#4A5568" }}>
                            {row.classification}
                          </span>
                        </td>
                        <td>{row.rateSnapshot}</td>
                        <td className="revenue-cell">{row.estimatedRevenue}</td>
                        <td>
                          <span className={`badge ${row.status === "Approved" ? "badge-success" : row.status === "Submitted" ? "badge-warning" : "badge-neutral"}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {reportType === "revenueByClient" && (
            <>
              <PanelHeader
                eyebrow="Client Engagement Performance"
                title="Client & Project Delivery Report"
                detail={`Showing ${clientDeliveryReportData.length} project engagements for ${period.replace("-", " ")}`}
              />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Client Code</th>
                      <th>Client Name</th>
                      <th>Project Name</th>
                      <th>Status</th>
                      <th>Approved Total Hours</th>
                      <th>Billable Hours</th>
                      <th>Staff Count</th>
                      <th>Estimated Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientDeliveryReportData.map((row, idx) => (
                      <tr key={idx}>
                        <td><code>{row.clientCode}</code></td>
                        <td><strong>{row.clientName}</strong></td>
                        <td>{row.projectName}</td>
                        <td>
                          <span className={`badge ${row.projectStatus === "Active" ? "badge-success" : "badge-neutral"}`}>
                            {row.projectStatus}
                          </span>
                        </td>
                        <td className="number-cell">{row.totalHours}h</td>
                        <td className="number-cell" style={{ fontWeight: 600 }}>{row.billableHours}h</td>
                        <td>{row.activeConsultants} staff</td>
                        <td className="revenue-cell">{row.estimatedRevenue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>

        {exported && (
          <div className="toast">
            <Check size={16} /> CSV export initiated successfully.
          </div>
        )}
      </div>
    </AppShell>
  );
}
