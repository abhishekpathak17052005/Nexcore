import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, AlertTriangle, Info, ArrowUpRight, CheckCircle2, Filter, Search, Clock, Users, Briefcase } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PanelHeader } from "@/components/DashboardPrimitives";
import type { Client, Consultant, Project, ReportingPeriod, TimeEntry } from "@/types";
import { availableWorkingHours } from "@/lib/calculations";

interface AlertsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  clients: Client[];
  projects: Project[];
  timeEntries: TimeEntry[];
}

export type AlertSeverity = "Critical" | "Warning" | "Info";

export interface OperationalAlert {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  affectedType: "TimeEntry" | "Consultant" | "Project" | "Client";
  affectedName: string;
  actionUrl: string;
  actionLabel: string;
  timestamp: string;
}

export default function Alerts({
  period,
  onPeriodChange,
  consultants,
  clients,
  projects,
  timeEntries,
}: AlertsProps) {
  const [severityFilter, setSeverityFilter] = useState<string>("All");
  const [query, setQuery] = useState("");

  // Generate real, explainable operational alerts from live records
  const generatedAlerts = useMemo(() => {
    const list: OperationalAlert[] = [];

    // 1. Pending Approvals Alert (Warning)
    const submittedEntries = timeEntries.filter((e) => e.status === "Submitted");
    if (submittedEntries.length > 0) {
      const totalPendingHours = submittedEntries.reduce((sum, e) => sum + e.hours, 0);
      list.push({
        id: "alert-pending-approvals",
        type: "Approval Workflow",
        severity: "Warning",
        title: `${submittedEntries.length} Time Entries Awaiting Review`,
        description: `There are currently ${submittedEntries.length} submitted time entries totaling ${totalPendingHours} hours awaiting manager/admin approval.`,
        affectedType: "TimeEntry",
        affectedName: `${submittedEntries.length} entries pending`,
        actionUrl: "/time-tracking",
        actionLabel: "Open review queue",
        timestamp: "Active now",
      });
    }

    // 2. Overdue/Stale Drafts Alert (Info)
    const oldDrafts = timeEntries.filter((e) => {
      if (e.status !== "Draft") return false;
      const createdDate = new Date(e.createdAt);
      const daysOld = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysOld > 7;
    });
    if (oldDrafts.length > 0) {
      list.push({
        id: "alert-stale-drafts",
        type: "Timesheet Compliance",
        severity: "Info",
        title: `${oldDrafts.length} Stale Draft Time Entries`,
        description: `${oldDrafts.length} time entries have remained in Draft state for over 7 days without being submitted for review.`,
        affectedType: "TimeEntry",
        affectedName: `${oldDrafts.length} draft entries`,
        actionUrl: "/time-tracking",
        actionLabel: "Review draft entries",
        timestamp: "Audit backlog",
      });
    }

    // 3. Over-capacity Consultants Alert (Critical)
    consultants.forEach((c) => {
      if (c.employmentStatus !== "Active") return;
      const cEntries = timeEntries.filter((e) => e.consultantId === c.id && e.status === "Approved");
      const approvedHours = cEntries.reduce((sum, e) => sum + e.hours, 0);
      const availableCap = availableWorkingHours(c, period);
      if (availableCap > 0 && approvedHours > availableCap) {
        list.push({
          id: `alert-overcap-${c.id}`,
          type: "Capacity Overload",
          severity: "Critical",
          title: `Over-capacity: ${c.name}`,
          description: `${c.name} has logged ${approvedHours}h against ${availableCap}h capacity (${Math.round((approvedHours / availableCap) * 100)}% load). Risk of delivery burnout.`,
          affectedType: "Consultant",
          affectedName: c.name,
          actionUrl: "/consultants",
          actionLabel: "View consultant profile",
          timestamp: "Active period",
        });
      }
    });

    // 4. Under-utilized / Zero-hour Active Consultants (Warning)
    consultants.forEach((c) => {
      if (c.employmentStatus !== "Active") return;
      const cEntries = timeEntries.filter((e) => e.consultantId === c.id);
      if (cEntries.length === 0) {
        list.push({
          id: `alert-nologs-${c.id}`,
          type: "Missing Activity",
          severity: "Warning",
          title: `Zero Logged Hours: ${c.name}`,
          description: `Active consultant ${c.name} (${c.department}) has zero logged time entries recorded in the system.`,
          affectedType: "Consultant",
          affectedName: c.name,
          actionUrl: "/consultants",
          actionLabel: "View consultant",
          timestamp: "Audit notice",
        });
      }
    });

    // 5. Active Projects with No Time Entries (Info)
    projects.forEach((p) => {
      if (p.status !== "Active") return;
      const pEntries = timeEntries.filter((e) => e.projectId === p.id);
      if (pEntries.length === 0) {
        const client = clients.find((cl) => cl.id === p.clientId);
        list.push({
          id: `alert-orphan-proj-${p.id}`,
          type: "Project Inactivity",
          severity: "Info",
          title: `Unallocated Active Project: ${p.name}`,
          description: `Project "${p.name}" for client "${client?.name ?? "Client"}" is marked Active but has no time tracked against it.`,
          affectedType: "Project",
          affectedName: p.name,
          actionUrl: "/clients-projects",
          actionLabel: "View project details",
          timestamp: "Operational check",
        });
      }
    });

    return list;
  }, [consultants, clients, projects, timeEntries, period]);

  // Filtered Alerts
  const filteredAlerts = useMemo(() => {
    return generatedAlerts.filter((a) => {
      const q = query.trim().toLowerCase();
      const matchesQuery = !q || a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.affectedName.toLowerCase().includes(q);
      const matchesSeverity = severityFilter === "All" || a.severity === severityFilter;
      return matchesQuery && matchesSeverity;
    });
  }, [generatedAlerts, query, severityFilter]);

  const criticalCount = generatedAlerts.filter((a) => a.severity === "Critical").length;
  const warningCount = generatedAlerts.filter((a) => a.severity === "Warning").length;
  const infoCount = generatedAlerts.filter((a) => a.severity === "Info").length;

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange} alertCount={generatedAlerts.length}>
      <div className="dashboard-page">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">Operational governance <span className="eyebrow-dot" /></p>
            <h1>Action Center & Alerts</h1>
            <p className="page-subtitle">
              Live operational alerts generated directly from approval backlogs, capacity overload, and delivery risks.
            </p>
          </div>
        </div>

        {/* Severity Metrics Bar */}
        <section className="kpi-grid" style={{ marginBottom: "20px" }}>
          <div className="panel" style={{ padding: "18px 20px", borderLeft: "4px solid #E53E3E" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="panel-eyebrow" style={{ color: "#E53E3E" }}>Urgent Intervention</span>
                <div style={{ fontSize: "28px", fontWeight: 700, margin: "4px 0" }}>{criticalCount}</div>
                <div style={{ fontSize: "12px", color: "#718096" }}>Critical capacity or workflow alerts</div>
              </div>
              <AlertCircle size={28} style={{ color: "#E53E3E", opacity: 0.8 }} />
            </div>
          </div>

          <div className="panel" style={{ padding: "18px 20px", borderLeft: "4px solid #DD6B20" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="panel-eyebrow" style={{ color: "#DD6B20" }}>Action Required</span>
                <div style={{ fontSize: "28px", fontWeight: 700, margin: "4px 0" }}>{warningCount}</div>
                <div style={{ fontSize: "12px", color: "#718096" }}>Pending approvals & compliance notices</div>
              </div>
              <AlertTriangle size={28} style={{ color: "#DD6B20", opacity: 0.8 }} />
            </div>
          </div>

          <div className="panel" style={{ padding: "18px 20px", borderLeft: "4px solid #3182CE" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="panel-eyebrow" style={{ color: "#3182CE" }}>Informational</span>
                <div style={{ fontSize: "28px", fontWeight: 700, margin: "4px 0" }}>{infoCount}</div>
                <div style={{ fontSize: "12px", color: "#718096" }}>Inactivity & audit queue items</div>
              </div>
              <Info size={28} style={{ color: "#3182CE", opacity: 0.8 }} />
            </div>
          </div>
        </section>

        {/* Filters Toolbar */}
        <div className="panel" style={{ padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <label className="table-search" style={{ minWidth: "280px" }}>
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search alerts by condition, record..."
              />
            </label>

            <div className="table-filters" style={{ margin: 0 }}>
              <label className="select-control">
                <Filter size={14} />
                <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                  <option value="All">All severities ({generatedAlerts.length})</option>
                  <option value="Critical">Critical only ({criticalCount})</option>
                  <option value="Warning">Warnings only ({warningCount})</option>
                  <option value="Info">Info only ({infoCount})</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* Alerts List */}
        <article className="panel">
          <PanelHeader
            eyebrow="Explainable Business Conditions"
            title="Active Operational Queue"
            detail={`Showing ${filteredAlerts.length} triggered conditions based on active database records`}
          />

          <div style={{ padding: "0 20px 20px 20px" }}>
            {filteredAlerts.map((alert) => {
              const borderColors: Record<AlertSeverity, string> = {
                Critical: "#FEB2B2",
                Warning: "#FEEBC8",
                Info: "#BEE3F8",
              };
              const bgColors: Record<AlertSeverity, string> = {
                Critical: "#FFF5F5",
                Warning: "#FFFAF0",
                Info: "#EBF8FF",
              };
              const textColors: Record<AlertSeverity, string> = {
                Critical: "#C53030",
                Warning: "#C05621",
                Info: "#2B6CB0",
              };

              return (
                <div
                  key={alert.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    padding: "16px",
                    borderRadius: "8px",
                    border: `1px solid ${borderColors[alert.severity]}`,
                    background: bgColors[alert.severity],
                    marginBottom: "12px",
                  }}
                >
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <div style={{ marginTop: 2 }}>
                      {alert.severity === "Critical" && <AlertCircle size={20} color={textColors.Critical} />}
                      {alert.severity === "Warning" && <AlertTriangle size={20} color={textColors.Warning} />}
                      {alert.severity === "Info" && <Info size={20} color={textColors.Info} />}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: textColors[alert.severity], letterSpacing: "0.5px" }}>
                          {alert.type}
                        </span>
                        <span style={{ fontSize: "11px", color: "#A0AEC0" }}>•</span>
                        <span style={{ fontSize: "11px", color: "#718096" }}>{alert.timestamp}</span>
                      </div>
                      <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#1A202C", margin: "0 0 4px 0" }}>
                        {alert.title}
                      </h3>
                      <p style={{ fontSize: "13px", color: "#4A5568", margin: 0, lineHeight: 1.5 }}>
                        {alert.description}
                      </p>
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <Link href={alert.actionUrl} className="button button-quiet" style={{ fontSize: "13px", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {alert.actionLabel} <ArrowUpRight size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}

            {filteredAlerts.length === 0 && (
              <EmptyState
                title="No operational alerts detected"
                description="All capacity thresholds, timesheet submissions, and delivery workflows are currently within normal operating bounds."
              />
            )}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
