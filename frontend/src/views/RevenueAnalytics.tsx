import { useMemo, useState } from "react";
import { DollarSign, ShieldAlert, AlertCircle, Filter, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, KpiCard, PanelHeader } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import type { Client, Consultant, CurrencyCode, Project, ReportingPeriod, TimeEntry } from "@/types";
import { formatCurrency, formatNumber } from "@/lib/calculations";
import { periodDateRange } from "@/lib/timeEntryService";

interface RevenueAnalyticsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  clients: Client[];
  projects: Project[];
  timeEntries: TimeEntry[];
}

export default function RevenueAnalytics({
  period,
  onPeriodChange,
  consultants,
  clients,
  projects,
  timeEntries,
}: RevenueAnalyticsProps) {
  const { user } = useAuth();
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode | "All">("All");
  const [query, setQuery] = useState("");

  const hasFinancialPermission = user?.role === "admin" || user?.role === "finance";

  // Filter entries to current reporting period
  const dateRange = periodDateRange(period);
  const periodEntries = useMemo(() => {
    return timeEntries.filter((entry) => {
      if (dateRange.from && entry.workDate < dateRange.from) return false;
      if (dateRange.to && entry.workDate > dateRange.to) return false;
      return true;
    });
  }, [timeEntries, dateRange]);

  // Billable entries with rate snapshots
  const billableEntries = useMemo(() => {
    return periodEntries.filter((entry) => {
      return (
        entry.billingClassification === "Billable" &&
        (entry.status === "Approved" || entry.status === "Submitted") &&
        entry.billingRateSnapshot != null &&
        entry.currency != null
      );
    });
  }, [periodEntries]);

  // Distinct currencies present in billable records
  const availableCurrencies = useMemo(() => {
    const set = new Set<CurrencyCode>();
    billableEntries.forEach((e) => {
      if (e.currency) set.add(e.currency);
    });
    return Array.from(set);
  }, [billableEntries]);

  // Grouped estimated revenue by currency
  const revenueByCurrency = useMemo(() => {
    const totals: Record<CurrencyCode, { estimatedRevenue: number; billableHours: number; count: number }> = {
      USD: { estimatedRevenue: 0, billableHours: 0, count: 0 },
      EUR: { estimatedRevenue: 0, billableHours: 0, count: 0 },
      GBP: { estimatedRevenue: 0, billableHours: 0, count: 0 },
    };

    billableEntries.forEach((entry) => {
      const cur = entry.currency ?? "USD";
      if (!totals[cur]) {
        totals[cur] = { estimatedRevenue: 0, billableHours: 0, count: 0 };
      }
      const rev = (entry.billingRateSnapshot ?? 0) * entry.hours;
      totals[cur].estimatedRevenue += rev;
      totals[cur].billableHours += entry.hours;
      totals[cur].count += 1;
    });

    return totals;
  }, [billableEntries]);

  // Revenue by Consultant
  const revenueByConsultant = useMemo(() => {
    return consultants.flatMap((c) => {
      const cEntries = billableEntries.filter((e) => e.consultantId === c.id);
      const byCurrency = new Map<CurrencyCode, { billableHours: number; estimatedRevenue: number; entryCount: number }>();
      cEntries.forEach((entry) => {
        const totals = byCurrency.get(entry.currency!) ?? { billableHours: 0, estimatedRevenue: 0, entryCount: 0 };
        totals.billableHours += entry.hours;
        totals.estimatedRevenue += (entry.billingRateSnapshot ?? 0) * entry.hours;
        totals.entryCount += 1;
        byCurrency.set(entry.currency!, totals);
      });
      return Array.from(byCurrency, ([currency, totals]) => ({ ...c, currency, ...totals }));
    }).filter((c) => c.entryCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency));
  }, [consultants, billableEntries]);

  // Revenue by Client
  const revenueByClient = useMemo(() => {
    return clients.flatMap((cl) => {
      const clEntries = billableEntries.filter((e) => e.clientId === cl.id);
      const byCurrency = new Map<CurrencyCode, { billableHours: number; estimatedRevenue: number; entryCount: number }>();
      clEntries.forEach((entry) => {
        const totals = byCurrency.get(entry.currency!) ?? { billableHours: 0, estimatedRevenue: 0, entryCount: 0 };
        totals.billableHours += entry.hours;
        totals.estimatedRevenue += (entry.billingRateSnapshot ?? 0) * entry.hours;
        totals.entryCount += 1;
        byCurrency.set(entry.currency!, totals);
      });
      return Array.from(byCurrency, ([currency, totals]) => ({ ...cl, currency, ...totals }));
    }).filter((cl) => cl.entryCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency));
  }, [clients, billableEntries]);

  // Filtered transaction-level records
  const filteredRecords = useMemo(() => {
    return billableEntries.filter((e) => {
      const consultant = consultants.find((c) => c.id === e.consultantId);
      const client = clients.find((c) => c.id === e.clientId);
      const project = projects.find((p) => p.id === e.projectId);
      const q = query.trim().toLowerCase();
      const matchesQuery =
        !q ||
        e.description.toLowerCase().includes(q) ||
        (consultant?.name.toLowerCase().includes(q) ?? false) ||
        (client?.name.toLowerCase().includes(q) ?? false) ||
        (project?.name.toLowerCase().includes(q) ?? false);
      const matchesCurrency = selectedCurrency === "All" || e.currency === selectedCurrency;
      return matchesQuery && matchesCurrency;
    });
  }, [billableEntries, consultants, clients, projects, query, selectedCurrency]);

  if (!hasFinancialPermission) {
    return (
      <AppShell period={period} onPeriodChange={onPeriodChange}>
        <div className="dashboard-page">
          <div className="panel error-panel" style={{ padding: "40px", textAlign: "center", margin: "40px auto", maxWidth: "600px" }}>
            <ShieldAlert size={48} style={{ color: "#E53E3E", margin: "0 auto 16px auto" }} />
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>Financial Access Restricted</h2>
            <p style={{ color: "#4A5568", lineHeight: 1.6 }}>
              Revenue Analytics is reserved for <strong>Administrator</strong> and <strong>Finance</strong> roles.
              Your current role (<strong>{user?.role ?? "unassigned"}</strong>) does not have the <code>metrics.financial</code> permission.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange}>
      <div className="dashboard-page revenue-analytics-page">
        <div className="page-heading-row revenue-heading">
          <div>
            <p className="eyebrow">Financial intelligence <span className="eyebrow-dot" /></p>
            <h1>Revenue Analytics</h1>
            <p className="page-subtitle">
              Estimated billable revenue calculated from frozen rate snapshots on eligible time entries.
            </p>
          </div>
        </div>

        {/* Currency Distinct KPI Cards */}
        <section className="kpi-grid revenue-kpi-grid" aria-label="Estimated revenue by currency">
          <KpiCard
            label="USD Estimated Revenue"
            value={formatCurrency(revenueByCurrency.USD.estimatedRevenue, true, "USD")}
            detail={`${revenueByCurrency.USD.billableHours} billable hours in period`}
            icon={<DollarSign size={17} />}
            accent="teal"
          >
            <div className="kpi-footnote">{revenueByCurrency.USD.count} billable time entries</div>
          </KpiCard>

          <KpiCard
            label="EUR Estimated Revenue"
            value={formatCurrency(revenueByCurrency.EUR.estimatedRevenue, true, "EUR")}
            detail={`${revenueByCurrency.EUR.billableHours} billable hours in period`}
            icon={<DollarSign size={17} />}
            accent="blue"
          >
            <div className="kpi-footnote">{revenueByCurrency.EUR.count} billable time entries</div>
          </KpiCard>

          <KpiCard
            label="GBP Estimated Revenue"
            value={formatCurrency(revenueByCurrency.GBP.estimatedRevenue, true, "GBP")}
            detail={`${revenueByCurrency.GBP.billableHours} billable hours in period`}
            icon={<DollarSign size={17} />}
            accent="navy"
          >
            <div className="kpi-footnote">{revenueByCurrency.GBP.count} billable time entries</div>
          </KpiCard>
        </section>

        {/* Financial Accounting Integrity Notice */}
        <div className="panel revenue-disclosure-panel">
          <div className="revenue-disclosure-content">
            <AlertCircle size={19} className="revenue-disclosure-icon" />
            <div className="revenue-disclosure-copy">
              <strong>Revenue note:</strong> Estimates use billable hours and saved rates. Invoiced revenue and payments aren’t available.
            </div>
          </div>
        </div>

        {/* Breakdown Panels */}
        <div className="revenue-breakdown-grid">
          {/* Revenue by Client */}
          <article className="panel revenue-breakdown-panel">
            <PanelHeader
              eyebrow="Account Distribution"
              title="Revenue by Client"
              detail="Total estimated earnings grouped by client"
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Currency</th>
                    <th>Hours</th>
                    <th>Estimated Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByClient.map((cl) => (
                    <tr key={`${cl.id}-${cl.currency}`}>
                      <td>
                        <strong>{cl.name}</strong>
                        <div style={{ fontSize: "11px", color: "#718096" }}>{cl.clientCode}</div>
                      </td>
                      <td><span className="badge badge-currency">{cl.currency}</span></td>
                      <td className="number-cell">{cl.billableHours}h</td>
                      <td className="revenue-cell">{formatCurrency(cl.estimatedRevenue, false, cl.currency)}</td>
                    </tr>
                  ))}
                  {revenueByClient.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#A0AEC0", padding: "20px" }}>
                        No billable client activity in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {/* Revenue by Consultant */}
          <article className="panel revenue-breakdown-panel">
            <PanelHeader
              eyebrow="Delivery Generation"
              title="Revenue by Consultant"
              detail="Estimated revenue contribution per consultant"
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Consultant</th>
                    <th>Department</th>
                    <th>Hours</th>
                    <th>Estimated Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByConsultant.map((c) => (
                    <tr key={`${c.id}-${c.currency}`}>
                      <td>
                        <strong>{c.name}</strong>
                        <div style={{ fontSize: "11px", color: "#718096" }}>{c.employeeCode}</div>
                      </td>
                      <td>{c.department}</td>
                      <td className="number-cell">{c.billableHours}h</td>
                      <td className="revenue-cell">{formatCurrency(c.estimatedRevenue, false, c.currency)}</td>
                    </tr>
                  ))}
                  {revenueByConsultant.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#A0AEC0", padding: "20px" }}>
                        No billable consultant time logged in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>

        {/* Transaction Level Audit Records */}
        <article className="panel revenue-audit-panel">
          <div className="revenue-audit-header">
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>Transaction-Level Audit</p>
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "4px 0 0 0" }}>Supporting Time Entries</h2>
            </div>
            <div className="table-filters revenue-audit-filters">
              <label className="table-search">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter entries by description, consultant..."
                />
              </label>
              <label className="select-control">
                <Filter size={14} />
                <select value={selectedCurrency} onChange={(e) => setSelectedCurrency(e.target.value as any)}>
                  <option value="All">All currencies</option>
                  {availableCurrencies.map((cur) => (
                    <option key={cur} value={cur}>{cur}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Work Date</th>
                  <th>Consultant</th>
                  <th>Client / Project</th>
                  <th>Hours</th>
                  <th>Rate Snapshot</th>
                  <th>Estimated Revenue</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((entry) => {
                  const consultant = consultants.find((c) => c.id === entry.consultantId);
                  const client = clients.find((c) => c.id === entry.clientId);
                  const project = projects.find((p) => p.id === entry.projectId);
                  const entryRev = (entry.billingRateSnapshot ?? 0) * entry.hours;

                  return (
                    <tr key={entry.id}>
                      <td style={{ fontSize: "13px" }}>{entry.workDate}</td>
                      <td>
                        <strong>{consultant?.name ?? "Unknown"}</strong>
                      </td>
                      <td>
                        <div><strong>{client?.name ?? "Unknown"}</strong></div>
                        <div style={{ fontSize: "12px", color: "#718096" }}>{project?.name ?? "Unknown"}</div>
                      </td>
                      <td className="number-cell">{entry.hours}h</td>
                      <td className="number-cell" style={{ color: "#4A5568" }}>
                        {formatCurrency(entry.billingRateSnapshot ?? 0, false, entry.currency ?? "USD")}/h
                      </td>
                      <td className="revenue-cell" style={{ fontWeight: 600 }}>
                        {formatCurrency(entryRev, false, entry.currency ?? "USD")}
                      </td>
                      <td>
                        <span className="badge" style={{ background: entry.status === "Approved" ? "#C6F6D5" : "#FEFCBF", color: entry.status === "Approved" ? "#22543D" : "#744210" }}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredRecords.length === 0 && (
            <EmptyState
              title="No supporting records found"
              description="No billable time entries match the selected filters."
            />
          )}
        </article>
      </div>
    </AppShell>
  );
}
