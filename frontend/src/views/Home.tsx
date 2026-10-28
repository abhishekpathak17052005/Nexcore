import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, BarChart3, Check, ChevronDown, Download, Filter, FolderKanban, MoreHorizontal, Search, SlidersHorizontal, Sparkles, Target, TimerReset, UsersRound, WalletCards, AlertTriangle, AlertCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ConsultantUtilization3D } from "@/components/ConsultantUtilization3D";
import { EmptyState, KpiCard, PanelHeader, SectionMenuButton, StatusBadge, TinyTrend } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import { consultantsToCsv, downloadCsv, filterConsultants, formatCurrency, formatNumber, sortConsultants, type ConsultantSortKey, availableWorkingHours } from "@/lib/calculations";
import { periodDateRange, eligibleForOperationalMetrics, estimatedRevenueForEntry } from "@/lib/timeEntryService";
import type { Client, Consultant, Project, ReportingPeriod, TimeEntry } from "@/types";

interface HomeProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  clients: Client[];
  projects: Project[];
  timeEntries: TimeEntry[];
}

export default function Home({
  period,
  onPeriodChange,
  consultants,
  clients,
  projects,
  timeEntries,
}: HomeProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All teams");
  const [sortKey, setSortKey] = useState<ConsultantSortKey>("utilization");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [activeTableView, setActiveTableView] = useState<"all" | "attention">("all");
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [exported, setExported] = useState(false);

  const hasFinancialPermission = user?.role === "admin" || user?.role === "finance";

  // Filter entries to selected reporting period
  const dateRange = periodDateRange(period);
  const periodEntries = useMemo(() => {
    return timeEntries.filter((entry) => {
      if (dateRange.from && entry.workDate < dateRange.from) return false;
      if (dateRange.to && entry.workDate > dateRange.to) return false;
      return true;
    });
  }, [timeEntries, dateRange]);

  // Real KPI Metrics derived from live MongoDB records
  const liveMetrics = useMemo(() => {
    const activeConsultantsList = consultants.filter((c) => c.employmentStatus === "Active");
    const activeConsultants = activeConsultantsList.length;
    const activeClients = clients.filter((c) => c.status === "Active").length;
    const activeProjects = projects.filter((p) => p.status === "Active").length;

    // Time calculations
    const approvedBillableHours = periodEntries
      .filter((e) => e.status === "Approved" && e.billingClassification === "Billable")
      .reduce((sum, e) => sum + e.hours, 0);

    const nonBillableHours = periodEntries
      .filter((e) => e.billingClassification === "Non-billable")
      .reduce((sum, e) => sum + e.hours, 0);

    const totalLoggedHours = periodEntries.reduce((sum, e) => sum + e.hours, 0);

    // Available working hours capacity (Active consultants only)
    const totalAvailableHours = activeConsultantsList.reduce((sum, c) => sum + availableWorkingHours(c, period, dateRange), 0);

    // Utilization % = Approved Billable Hours ÷ Available Working Hours × 100
    const averageUtilization = totalAvailableHours > 0
      ? Math.round((approvedBillableHours / totalAvailableHours) * 1000) / 10
      : 0;

    // Estimated revenue by currency
    const revenueByCurrency: Partial<Record<string, number>> = {};
    periodEntries.forEach((e) => {
      if (e.billingClassification === "Billable" && eligibleForOperationalMetrics(e)) {
        const rev = estimatedRevenueForEntry(e);
        const cur = e.currency ?? "USD";
        if (rev != null) {
          revenueByCurrency[cur] = Math.round(((revenueByCurrency[cur] ?? 0) + rev) * 100) / 100;
        }
      }
    });

    const primaryRevenue = revenueByCurrency["USD"] ?? Object.values(revenueByCurrency)[0] ?? 0;

    return {
      activeConsultants,
      activeClients,
      activeProjects,
      totalLoggedHours,
      approvedBillableHours,
      nonBillableHours,
      totalAvailableHours,
      averageUtilization,
      revenueByCurrency,
      primaryRevenue,
      pendingApprovalCount: periodEntries.filter((e) => e.status === "Submitted").length,
    };
  }, [consultants, clients, projects, periodEntries, period, dateRange]);

  // Real consultant performance rows derived from period time entries
  const liveConsultantRows = useMemo(() => {
    return consultants.map((c) => {
      const cEntries = periodEntries.filter((e) => e.consultantId === c.id);
      const billable = cEntries.filter((e) => e.status === "Approved" && e.billingClassification === "Billable").reduce((sum, e) => sum + e.hours, 0);
      const nonBillable = cEntries.filter((e) => e.billingClassification === "Non-billable").reduce((sum, e) => sum + e.hours, 0);
      const avail = availableWorkingHours(c, period, dateRange);
      const util = avail > 0 ? Math.round((billable / avail) * 1000) / 10 : 0;
      const rev = cEntries.filter((e) => e.billingClassification === "Billable" && eligibleForOperationalMetrics(e)).reduce((sum, e) => sum + (estimatedRevenueForEntry(e) ?? 0), 0);

      const status: "On track" | "Over capacity" | "Watch" = util > 90 ? "Over capacity" : util < 75 ? "Watch" : "On track";

      return {
        ...c,
        availableHours: avail,
        billableHours: billable,
        nonBillableHours: nonBillable,
        utilization: util,
        revenue: rev,
        status,
      };
    });
  }, [consultants, periodEntries]);

  // Utilization & Revenue Trends (grouped weekly)
  const { utilizationSeries, revenueSeries } = useMemo(() => {
    const weeklyData: Record<string, { billableHours: number; totalHours: number; revenue: number }> = {};

    // Group entries by workDate week label (MM/DD)
    periodEntries.forEach((e) => {
      const dateKey = e.workDate.slice(5); // e.g. "04-12"
      if (!weeklyData[dateKey]) {
        weeklyData[dateKey] = { billableHours: 0, totalHours: 0, revenue: 0 };
      }
      weeklyData[dateKey].totalHours += e.hours;
      if (e.billingClassification === "Billable" && (e.status === "Approved" || e.status === "Submitted")) {
        weeklyData[dateKey].billableHours += e.hours;
        weeklyData[dateKey].revenue += (e.billingRateSnapshot ?? 0) * e.hours;
      }
    });

    const sortedKeys = Object.keys(weeklyData).sort();
    if (sortedKeys.length === 0) {
      // Default empty structure if no entries
      return {
        utilizationSeries: [{ label: "W1", utilization: liveMetrics.averageUtilization }],
        revenueSeries: [{ label: "W1", estimated: liveMetrics.primaryRevenue, invoiced: 0 }],
      };
    }

    const uSeries = sortedKeys.map((key) => {
      const item = weeklyData[key]!;
      const approxWeekCapacity = Math.max(1, liveMetrics.totalAvailableHours / Math.max(1, sortedKeys.length));
      const u = Math.min(100, Math.round((item.billableHours / approxWeekCapacity) * 100));
      return {
        label: key,
        utilization: u,
      };
    });

    const rSeries = sortedKeys.map((key) => {
      const item = weeklyData[key]!;
      return {
        label: key,
        estimated: Math.round(item.revenue),
        invoiced: 0, // Explicitly 0: Invoice schema pending
      };
    });

    return { utilizationSeries: uSeries, revenueSeries: rSeries };
  }, [periodEntries, liveMetrics]);

  // Operational alerts derived from real database entries
  const liveAlerts = useMemo(() => {
    const alertsList: Array<{ id: string; type: string; severity: "Critical" | "Warning" | "Info"; description: string; actionLabel: string; url: string }> = [];

    if (liveMetrics.pendingApprovalCount > 0) {
      alertsList.push({
        id: "alert-pending-approvals",
        type: "Pending Approvals",
        severity: "Warning",
        description: `${liveMetrics.pendingApprovalCount} time entries awaiting manager approval.`,
        actionLabel: "Review entries",
        url: "/time-tracking",
      });
    }

    const overCapacity = liveConsultantRows.filter((c) => c.status === "Over capacity");
    if (overCapacity.length > 0) {
      alertsList.push({
        id: "alert-overcap",
        type: "Capacity Overload",
        severity: "Critical",
        description: `${overCapacity.length} consultants exceeding 90% weekly capacity limit.`,
        actionLabel: "Check utilization",
        url: "/utilization",
      });
    }

    const underutilized = liveConsultantRows.filter((c) => c.status === "Watch" && c.availableHours > 0);
    if (underutilized.length > 0) {
      alertsList.push({
        id: "alert-underutilized",
        type: "Under-utilization",
        severity: "Warning",
        description: `${underutilized.length} consultants tracking below target 75% utilization.`,
        actionLabel: "View details",
        url: "/utilization",
      });
    }

    return alertsList;
  }, [liveMetrics, liveConsultantRows]);

  // Departments for table filter
  const departments = useMemo(() => ["All teams", ...new Set(consultants.map((c) => c.department))], [consultants]);

  // Filtered consultant table rows
  const tableRows = useMemo(() => {
    const filtered = filterConsultants(liveConsultantRows, query, department).filter(
      (record) => activeTableView === "all" || record.status !== "On track"
    );
    return sortConsultants(filtered, sortKey, sortDirection);
  }, [liveConsultantRows, query, department, activeTableView, sortKey, sortDirection]);

  const toggleSort = (key: ConsultantSortKey) => {
    if (sortKey === key) setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection(key === "name" ? "asc" : "desc");
    }
  };

  const exportCurrent = () => {
    downloadCsv(`nexcore-consultant-performance-${period}.csv`, consultantsToCsv(tableRows));
    setExported(true);
    setTimeout(() => setExported(false), 2400);
  };

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange} alertCount={liveAlerts.length}>
      <div className="dashboard-page">
        {/* Live Backend Connection Indicator */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#F0FFF4", border: "1px solid #C6F6D5", borderRadius: "6px", padding: "8px 14px", marginBottom: "16px", fontSize: "12px", color: "#22543D" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38A169", display: "inline-block" }} />
            <strong>Live MongoDB Connection Active</strong> — Metrics derived from real database records in <code>consultant_utilization_dashboard</code>
          </div>
          <span style={{ color: "#718096" }}>Period: {period.replace("-", " ")}</span>
        </div>

        <div className="page-heading-row">
          <div>
            <p className="eyebrow">Operations overview <span className="eyebrow-dot" /></p>
            <h1>Overview</h1>
            <p className="page-subtitle">Consultant performance, billable capacity, and revenue backed by MongoDB.</p>
          </div>
          <div className="heading-actions">
            <button className="button button-primary" onClick={exportCurrent}>
              <Download size={16} /> Export report
            </button>
          </div>
        </div>

        {/* 6 Core KPI Cards backed by Live MongoDB records */}
        <section className="kpi-grid" aria-label="Key performance indicators">
          <KpiCard
            label="Active consultants"
            value={formatNumber(liveMetrics.activeConsultants)}
            detail={`${departments.length - 1} delivery departments`}
            icon={<UsersRound size={17} />}
            accent="navy"
          >
            <div className="kpi-footnote">Total registered: {consultants.length}</div>
          </KpiCard>

          <KpiCard
            label="Average utilization"
            value={`${liveMetrics.averageUtilization}%`}
            detail={`Target 75.0% · ${(liveMetrics.averageUtilization - 75).toFixed(1)} pts`}
            icon={<Target size={17} />}
            accent={liveMetrics.averageUtilization >= 75 ? "teal" : "amber"}
          >
            <div className="kpi-progress">
              <span style={{ width: `${Math.min(liveMetrics.averageUtilization, 100)}%` }} />
              <i style={{ left: "75%" }} />
            </div>
          </KpiCard>

          <KpiCard
            label="Approved billable hours"
            value={`${formatNumber(liveMetrics.approvedBillableHours)} hrs`}
            detail={`Logged: ${liveMetrics.totalLoggedHours}h total`}
            icon={<TimerReset size={17} />}
            accent="blue"
          >
            <div className="kpi-footnote">Of {formatNumber(liveMetrics.totalAvailableHours)} available capacity hrs</div>
          </KpiCard>

          <KpiCard
            label="Estimated billable revenue"
            value={hasFinancialPermission ? formatCurrency(liveMetrics.primaryRevenue, true) : "Restricted"}
            detail={hasFinancialPermission ? "Frozen billing rate snapshots" : "Requires financial permission"}
            icon={<BarChart3 size={17} />}
            accent="teal"
          >
            <div className="kpi-footnote">
              {hasFinancialPermission
                ? Object.entries(liveMetrics.revenueByCurrency).map(([cur, amt]) => `${formatNumber(amt!)} ${cur}`).join(" · ") || "0 USD"
                : "Restricted to Finance/Admin"}
            </div>
          </KpiCard>

          <KpiCard
            label="Active clients & projects"
            value={`${liveMetrics.activeClients} clients`}
            detail={`${liveMetrics.activeProjects} active projects engaged`}
            icon={<WalletCards size={17} />}
            accent="navy"
          >
            <div className="kpi-footnote"><Link href="/clients-projects" style={{ color: "#2B6CB0", textDecoration: "underline" }}>View portfolio</Link></div>
          </KpiCard>

          <KpiCard
            label="Pending approval review"
            value={`${liveMetrics.pendingApprovalCount} entries`}
            detail="Awaiting review by manager/admin"
            icon={<FolderKanban size={17} />}
            accent={liveMetrics.pendingApprovalCount > 0 ? "amber" : "teal"}
          >
            <div className="kpi-footnote warning-note">
              <span className={`mini-dot ${liveMetrics.pendingApprovalCount > 0 ? "amber" : "teal"}`} />
              <Link href="/time-tracking" style={{ color: "#2B6CB0", textDecoration: "underline" }}>Open approval queue</Link>
            </div>
          </KpiCard>
        </section>

        {/* Real Charts Grid */}
        <section className="analytics-grid">
          <article className="panel chart-panel utilization-panel">
            <PanelHeader
              eyebrow="Capacity signal"
              title="Utilization trend"
              detail="Approved billable hours ÷ available working hours"
              action={<SectionMenuButton />}
            />
            <div className="chart-meta">
              <div className="chart-stat">
                <strong>{liveMetrics.averageUtilization}%</strong>
                <span>period average</span>
              </div>
              <div className="chart-legend">
                <span><i className="legend-line teal-line" />Utilization</span>
                <span><i className="legend-line dashed-line" />Target 75%</span>
              </div>
            </div>
            <div className="utilization-focus">
              <ConsultantUtilization3D utilization={liveMetrics.averageUtilization} target={75} />
              <div className="line-chart-wrap">
                <ResponsiveContainer width="100%" height={218}>
                  <AreaChart data={utilizationSeries} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="utilization-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0F9D91" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#0F9D91" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#E6EDF2" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8795A4", fontSize: 11 }} dy={10} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#8795A4", fontSize: 11 }} tickFormatter={(val) => `${val}%`} width={40} />
                    <Tooltip />
                    <ReferenceLine y={75} stroke="#8A9AAA" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="utilization" stroke="#0F9D91" strokeWidth={2.6} fill="url(#utilization-fill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="chart-footer">
              <span>Target: 75% capacity utilization benchmark</span>
              <Link href="/utilization">Detailed utilization analytics <ArrowUpRight size={14} /></Link>
            </div>
          </article>

          <article className="panel chart-panel revenue-panel">
            <PanelHeader
              eyebrow="Financial signal"
              title="Estimated billable revenue"
              detail="Derived from frozen rate snapshots on approved time"
              action={<SectionMenuButton />}
            />
            <div className="chart-meta">
              <div className="chart-stat">
                <strong>{hasFinancialPermission ? formatCurrency(liveMetrics.primaryRevenue, true) : "Restricted"}</strong>
                <span>estimated in period</span>
              </div>
              <div className="chart-legend">
                <span><i className="legend-square estimate-square" />Estimated Revenue</span>
              </div>
            </div>
            <div className="bar-chart-wrap">
              <ResponsiveContainer width="100%" height={218}>
                <BarChart data={revenueSeries} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={3}>
                  <CartesianGrid vertical={false} stroke="#E6EDF2" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8795A4", fontSize: 11 }} dy={10} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8795A4", fontSize: 11 }} tickFormatter={(val) => `$${Math.round(val / 1000)}k`} width={40} />
                  <Tooltip />
                  <Bar dataKey="estimated" fill="#0F9D91" radius={[3, 3, 0, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-footer">
              <span>Invoicing schema pending · Estimated values derived from timesheets</span>
              <Link href="/revenue">Open revenue analytics <ArrowUpRight size={14} /></Link>
            </div>
          </article>
        </section>

        {/* Lower Grid: Consultant Performance Table & Real Attention Panels */}
        <section className="lower-grid">
          <article className="panel consultant-panel">
            <div className="table-panel-header">
              <PanelHeader
                eyebrow="Delivery capacity"
                title="Consultant performance"
                detail={`Live database records · ${tableRows.length} shown`}
                action={<button className="button button-quiet" onClick={exportCurrent}><Download size={14} />CSV</button>}
              />
            </div>
            <div className="table-toolbar">
              <div className="table-tabs">
                <button className={activeTableView === "all" ? "is-active" : ""} onClick={() => setActiveTableView("all")}>
                  All consultants <span>{liveConsultantRows.length}</span>
                </button>
                <button className={activeTableView === "attention" ? "is-active" : ""} onClick={() => setActiveTableView("attention")}>
                  Needs attention <span>{liveConsultantRows.filter(c => c.status !== "On track").length}</span>
                </button>
              </div>
              <div className="table-filters">
                <label className="table-search">
                  <Search size={15} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search consultants..." />
                </label>
                <label className="select-control">
                  <Filter size={14} />
                  <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                    {departments.map((d) => <option key={d}>{d}</option>)}
                  </select>
                  <ChevronDown size={13} />
                </label>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th><button onClick={() => toggleSort("name")}>Consultant</button></th>
                    <th>Role</th>
                    <th><button onClick={() => toggleSort("availableHours")}>Available</button></th>
                    <th><button onClick={() => toggleSort("billableHours")}>Billable</button></th>
                    <th><button onClick={() => toggleSort("utilization")}>Utilization</button></th>
                    <th><button onClick={() => toggleSort("revenue")}>Revenue</button></th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((c) => (
                    <tr key={c.id} onClick={() => setSelectedConsultant(c)}>
                      <td>
                        <div className="consultant-cell">
                          <div className="avatar" style={{ background: `${c.color}18`, color: c.color }}>{c.initials}</div>
                          <div><strong>{c.name}</strong><span>{c.department}</span></div>
                        </div>
                      </td>
                      <td className="muted-cell">{c.role}</td>
                      <td className="number-cell">{c.availableHours}h</td>
                      <td className="number-cell" style={{ fontWeight: 600 }}>{c.billableHours}h</td>
                      <td>
                        <div className="utilization-cell">
                          <strong>{c.utilization}%</strong>
                          <span className="mini-progress">
                            <i className={c.status === "Over capacity" ? "is-danger" : c.status === "Watch" ? "is-warning" : ""} style={{ width: `${Math.min(c.utilization, 100)}%` }} />
                          </span>
                        </div>
                      </td>
                      <td className="revenue-cell">
                        {hasFinancialPermission ? formatCurrency(c.revenue, true, c.currency) : "Restricted"}
                      </td>
                      <td>
                        <StatusBadge tone={c.status === "On track" ? "success" : c.status === "Over capacity" ? "danger" : "warning"}>
                          {c.status}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tableRows.length === 0 && (
              <EmptyState title="No consultants match" description="Try clearing search or choosing another department." />
            )}
          </article>

          {/* Attention & Alerts Sidebar */}
          <aside className="attention-column">
            {/* Operational Alerts Card */}
            <article className="panel alerts-panel">
              <PanelHeader
                eyebrow="Action queue"
                title="Operational alerts"
                action={<Link href="/alerts" className="text-link">Open center <ArrowUpRight size={14} /></Link>}
              />
              <div className="alert-list">
                {liveAlerts.slice(0, 3).map((alert) => (
                  <div className="alert-item" key={alert.id}>
                    <span className={`alert-icon ${alert.severity.toLowerCase()}`}><span /></span>
                    <div className="alert-copy">
                      <div><strong>{alert.type}</strong></div>
                      <p>{alert.description}</p>
                      <Link href={alert.url}>{alert.actionLabel} <ArrowUpRight size={12} /></Link>
                    </div>
                  </div>
                ))}
                {liveAlerts.length === 0 && (
                  <div style={{ padding: "20px", color: "#38A169", fontSize: "13px" }}>
                    ✓ All timesheets, capacity loads, and approvals are on track.
                  </div>
                )}
              </div>
            </article>

            {/* Retainers Disclosure Card */}
            <article className="panel retainer-panel">
              <PanelHeader
                eyebrow="Contract Watch"
                title="Client Engagements"
                detail="Supported active client project workstreams"
                action={<Link href="/retainers" className="text-link">View retainers <ArrowUpRight size={14} /></Link>}
              />
              <div style={{ padding: "16px", fontSize: "13px", color: "#4A5568" }}>
                <p style={{ margin: "0 0 10px 0" }}>
                  <strong>{clients.length} Clients</strong> with <strong>{projects.length} Projects</strong> registered in MongoDB.
                </p>
                <div style={{ background: "#F7FAFC", padding: "10px", borderRadius: "4px", fontSize: "12px", color: "#718096" }}>
                  Retainer agreements and drawdown tracking require the upcoming retainer contract schema.
                </div>
              </div>
            </article>
          </aside>
        </section>
      </div>

      {/* Consultant Details Drawer */}
      {selectedConsultant && (
        <div className="drawer-scrim" onClick={() => setSelectedConsultant(null)}>
          <aside className="detail-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <span className="panel-eyebrow">Database Record</span>
                <h2>{selectedConsultant.name}</h2>
                <p>{selectedConsultant.role} · {selectedConsultant.department}</p>
              </div>
              <button className="icon-button" onClick={() => setSelectedConsultant(null)}>×</button>
            </div>
            <div className="drawer-profile">
              <div className="avatar avatar-large" style={{ background: `${selectedConsultant.color}18`, color: selectedConsultant.color }}>
                {selectedConsultant.initials}
              </div>
              <div>
                <span>Utilization Rate</span>
                <strong>{selectedConsultant.utilization}%</strong>
                <StatusBadge tone={selectedConsultant.status === "On track" ? "success" : selectedConsultant.status === "Over capacity" ? "danger" : "warning"}>
                  {selectedConsultant.status}
                </StatusBadge>
              </div>
            </div>
            <div className="drawer-metrics">
              <div><span>Weekly Cap</span><strong>{selectedConsultant.weeklyCapacityHours}h</strong></div>
              <div><span>Available</span><strong>{selectedConsultant.availableHours}h</strong></div>
              <div><span>Approved Billable</span><strong>{selectedConsultant.billableHours}h</strong></div>
              <div><span>Revenue</span><strong>{hasFinancialPermission ? formatCurrency(selectedConsultant.revenue, true, selectedConsultant.currency) : "Restricted"}</strong></div>
            </div>
            <Link href="/consultants" className="button button-primary drawer-action" onClick={() => setSelectedConsultant(null)}>
              Open in Consultant Directory <ArrowUpRight size={16} />
            </Link>
          </aside>
        </div>
      )}

      {exported && <div className="toast"><Check size={15} />CSV export started for current view.</div>}
    </AppShell>
  );
}
