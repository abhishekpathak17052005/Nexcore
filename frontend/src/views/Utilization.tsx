import { useMemo, useState } from "react";
import { Search, Filter, Target, Users, AlertTriangle, ArrowUpDown, ChevronDown } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, KpiCard, PanelHeader, StatusBadge } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import type { Consultant, ReportingPeriod, TimeEntry } from "@/types";
import { formatNumber, availableWorkingHours } from "@/lib/calculations";
import { periodDateRange } from "@/lib/timeEntryService";

interface UtilizationProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  timeEntries: TimeEntry[];
}

export default function Utilization({ period, onPeriodChange, consultants, timeEntries }: UtilizationProps) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All teams");
  const [tierFilter, setTierFilter] = useState<string>("All");
  const [sortKey, setSortKey] = useState<"name" | "utilization" | "billableHours" | "availableHours">("utilization");
  const [sortAsc, setSortAsc] = useState(false);

  // Filter entries to current reporting period
  const dateRange = periodDateRange(period);
  const periodEntries = useMemo(() => {
    return timeEntries.filter((entry) => {
      if (dateRange.from && entry.workDate < dateRange.from) return false;
      if (dateRange.to && entry.workDate > dateRange.to) return false;
      return true;
    });
  }, [timeEntries, dateRange]);

  // Derived consultant utilization records
  const utilizationRecords = useMemo(() => {
    const isConsultantRole = user?.role === "consultant";
    const scopedConsultants = isConsultantRole && user?.consultantId
      ? consultants.filter((c) => c.id === user.consultantId)
      : consultants;

    return scopedConsultants.map((c) => {
      const cEntries = periodEntries.filter((e) => e.consultantId === c.id);
      const totalLoggedHours = cEntries.reduce((sum, e) => sum + e.hours, 0);
      const submittedHours = cEntries.filter((e) => e.status === "Submitted").reduce((sum, e) => sum + e.hours, 0);
      const approvedBillableHours = cEntries.filter((e) => e.status === "Approved" && e.billingClassification === "Billable").reduce((sum, e) => sum + e.hours, 0);
      const approvedNonBillableHours = cEntries.filter((e) => e.status === "Approved" && e.billingClassification === "Non-billable").reduce((sum, e) => sum + e.hours, 0);
      
      const available = availableWorkingHours(c, period, dateRange);
      const hasCapacity = available > 0;
      const utilization = hasCapacity ? Math.round((approvedBillableHours / available) * 1000) / 10 : 0;
      
      let tier: "Over capacity" | "Target" | "Underutilized" | "No capacity";
      if (!hasCapacity) {
        tier = "No capacity";
      } else if (utilization > 90) {
        tier = "Over capacity";
      } else if (utilization >= 75) {
        tier = "Target";
      } else {
        tier = "Underutilized";
      }

      return {
        ...c,
        availableHours: available,
        hasCapacity,
        totalLoggedHours,
        submittedHours,
        approvedBillableHours,
        approvedNonBillableHours,
        utilization,
        tier,
      };
    });
  }, [consultants, periodEntries, user, period, dateRange]);

  // Filter & Sort
  const departments = useMemo(() => ["All teams", ...new Set(consultants.map((c) => c.department))], [consultants]);

  const filteredRecords = useMemo(() => {
    return utilizationRecords.filter((r) => {
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || r.name.toLowerCase().includes(q) || r.role.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q);
      const matchesDept = department === "All teams" || r.department === department;
      const matchesTier = tierFilter === "All" || r.tier === tierFilter;
      return matchesQuery && matchesDept && matchesTier;
    }).sort((a, b) => {
      let valA: string | number = a[sortKey];
      let valB: string | number = b[sortKey];
      if (typeof valA === "string") {
        return sortAsc ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
      }
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [utilizationRecords, query, department, tierFilter, sortKey, sortAsc]);

  // Summary Metrics
  const summary = useMemo(() => {
    const totalAvail = utilizationRecords.reduce((sum, r) => sum + (r.hasCapacity ? r.availableHours : 0), 0);
    const totalBillable = utilizationRecords.reduce((sum, r) => sum + r.approvedBillableHours, 0);
    const overallUtil = totalAvail > 0 ? Math.round((totalBillable / totalAvail) * 1000) / 10 : 0;
    const overCapacityCount = utilizationRecords.filter((r) => r.tier === "Over capacity").length;
    const underutilizedCount = utilizationRecords.filter((r) => r.tier === "Underutilized").length;

    return {
      totalAvail,
      totalBillable,
      overallUtil,
      overCapacityCount,
      underutilizedCount,
    };
  }, [utilizationRecords]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  };

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange}>
      <div className="dashboard-page">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">Delivery performance <span className="eyebrow-dot" /></p>
            <h1>Utilization Analytics</h1>
            <p className="page-subtitle">
              Calculated strictly as <strong>Approved Billable Hours ÷ Available Working Hours × 100</strong>.
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <section className="kpi-grid" style={{ marginBottom: "20px" }}>
          <KpiCard
            label="Average team utilization"
            value={`${summary.overallUtil}%`}
            detail="Benchmark target: 75.0%"
            icon={<Target size={17} />}
            accent={summary.overallUtil >= 75 ? "teal" : "amber"}
          >
            <div className="kpi-progress">
              <span style={{ width: `${Math.min(summary.overallUtil, 100)}%` }} />
              <i style={{ left: "75%" }} />
            </div>
          </KpiCard>

          <KpiCard
            label="Approved billable hours"
            value={`${formatNumber(summary.totalBillable)} hrs`}
            detail={`Across ${utilizationRecords.length} consultant records`}
            icon={<Users size={17} />}
            accent="blue"
          >
            <div className="kpi-footnote">Of {formatNumber(summary.totalAvail)} total available hrs</div>
          </KpiCard>

          <KpiCard
            label="Capacity allocation"
            value={`${summary.overCapacityCount} over capacity`}
            detail={`${summary.underutilizedCount} underutilized (<75%)`}
            icon={<AlertTriangle size={17} />}
            accent={summary.overCapacityCount > 0 ? "amber" : "navy"}
          >
            <div className="retainer-kpi-split">
              <span><strong>{summary.overCapacityCount}</strong> &gt;90% load</span>
              <span><strong>{summary.underutilizedCount}</strong> &lt;75% load</span>
            </div>
          </KpiCard>
        </section>

        {/* Filters Toolbar */}
        <div className="panel" style={{ padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <label className="table-search" style={{ minWidth: "260px" }}>
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by consultant, role, code..."
              />
            </label>

            <div className="table-filters" style={{ margin: 0 }}>
              <label className="select-control">
                <Filter size={14} />
                <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </label>

              <label className="select-control">
                <Filter size={14} />
                <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
                  <option value="All">All load tiers</option>
                  <option value="Over capacity">Over capacity (&gt;90%)</option>
                  <option value="Target">Target (75%–90%)</option>
                  <option value="Underutilized">Underutilized (&lt;75%)</option>
                  <option value="No capacity">No capacity configured</option>
                </select>
                <ChevronDown size={13} />
              </label>
            </div>
          </div>
        </div>

        {/* Table View */}
        <article className="panel">
          <PanelHeader
            eyebrow="Individual Capacity Breakdown"
            title="Consultant Utilization Table"
            detail={`Showing ${filteredRecords.length} records for ${period.replace("-", " ")}`}
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    <button onClick={() => handleSort("name")} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      Consultant <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th>Department & Role</th>
                  <th>
                    <button onClick={() => handleSort("availableHours")} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      Available Cap <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th>Total Logged</th>
                  <th>
                    <button onClick={() => handleSort("billableHours")} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      Approved Billable <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th>Approved Non-Billable</th>
                  <th>
                    <button onClick={() => handleSort("utilization")} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      Utilization % <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="consultant-cell">
                        <div className="avatar" style={{ background: `${r.color}18`, color: r.color }}>
                          {r.initials}
                        </div>
                        <div>
                          <strong>{r.name}</strong>
                          <span style={{ fontSize: "11px", color: "#718096" }}>{r.employeeCode}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{r.department}</strong>
                      <div style={{ fontSize: "12px", color: "#718096" }}>{r.role}</div>
                    </td>
                    <td className="number-cell">
                      {r.hasCapacity ? `${r.availableHours}h` : <span style={{ color: "#E53E3E" }}>0h (Unset)</span>}
                    </td>
                    <td className="number-cell">{r.totalLoggedHours}h</td>
                    <td className="number-cell" style={{ fontWeight: 600, color: "#2B6CB0" }}>
                      {r.approvedBillableHours}h
                    </td>
                    <td className="number-cell" style={{ color: "#718096" }}>
                      {r.approvedNonBillableHours}h
                    </td>
                    <td>
                      {r.hasCapacity ? (
                        <div className="utilization-cell">
                          <strong>{r.utilization}%</strong>
                          <span className="mini-progress">
                            <i
                              className={r.tier === "Over capacity" ? "is-danger" : r.tier === "Underutilized" ? "is-warning" : ""}
                              style={{ width: `${Math.min(r.utilization, 100)}%` }}
                            />
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "#A0AEC0", fontSize: "12px" }}>N/A (No Cap)</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge
                        tone={r.tier === "Target" ? "success" : r.tier === "Over capacity" ? "danger" : r.tier === "No capacity" ? "neutral" : "warning"}
                      >
                        {r.tier}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRecords.length === 0 && (
            <EmptyState
              title="No utilization records found"
              description="No consultants match the selected filters or reporting period."
            />
          )}
        </article>
      </div>
    </AppShell>
  );
}
