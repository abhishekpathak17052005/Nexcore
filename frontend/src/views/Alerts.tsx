import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, ExternalLink, Filter, RefreshCw, Search } from "lucide-react";
import { Link } from "wouter";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, PanelHeader, StatusBadge } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import type { ReportingPeriod } from "@/types";
import { backendErrorMessage } from "@/lib/backendService";
import { trpc } from "@/lib/trpc";

interface AlertsProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
}

type AlertSeverity = "all" | "warning" | "critical";

export default function Alerts({ period, onPeriodChange }: AlertsProps) {
  const { can } = useAuth();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<AlertSeverity>("all");
  const alertsQuery = trpc.retainers.alerts.useQuery(undefined, { enabled: can("clients.read"), retry: false });
  const alerts = alertsQuery.data ?? [];

  const filtered = useMemo(() => alerts.filter((alert) => {
    const matchesSeverity = severity === "all" || alert.severity === severity;
    const matchesText = !query.trim() || `${alert.retainerName} ${alert.type} ${alert.message}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesSeverity && matchesText;
  }), [alerts, severity, query]);
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange} alertCount={alerts.length}>
      <div className="dashboard-page">
        <PageHeader
          eyebrow="Operational governance"
          title="Alert Center"
          description="Retainer alerts returned by Nexcore’s existing contract intelligence procedure. Timesheet reminders and capacity alerts are not included because no authoritative alert procedure supports them."
          actions={can("clients.read") ? <button type="button" className="button button-quiet" onClick={() => void alertsQuery.refetch()} disabled={alertsQuery.isFetching}><RefreshCw size={15} /> Refresh</button> : undefined}
        />

        {!can("clients.read") ? <EmptyState title="Retainer alerts are not available" description="Your role does not have access to the retainer alert procedure." /> : <>
          <section className="alert-summary-grid" aria-label="Retainer alert counts">
            <div className="panel alert-summary-card critical"><span><AlertCircle size={17} /> Critical</span><strong>{alertsQuery.isLoading ? "—" : criticalCount}</strong><small>Exceeded contracts</small></div>
            <div className="panel alert-summary-card warning"><span><AlertTriangle size={17} /> Warnings</span><strong>{alertsQuery.isLoading ? "—" : warningCount}</strong><small>Threshold and expiry alerts</small></div>
            <div className="panel alert-summary-card total"><span>Backend alerts</span><strong>{alertsQuery.isLoading ? "—" : alerts.length}</strong><small>Returned for this organization</small></div>
          </section>

          <article className="panel alert-center-panel">
            <PanelHeader eyebrow="Retainer contracts" title="Current alerts" detail="Threshold, exceeded, expiring, and expired alerts" />
            <div className="alert-center-toolbar">
              <label className="table-search"><Search size={15} /><span className="sr-only">Search retainer alerts</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by retainer or alert type" /></label>
              <label className="select-control"><Filter size={14} /><span className="sr-only">Filter alerts by severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as AlertSeverity)}><option value="all">All severities</option><option value="critical">Critical</option><option value="warning">Warning</option></select></label>
            </div>

            {alertsQuery.isLoading && <div className="alert-center-loading" role="status" aria-label="Loading retainer alerts"><div className="overview-skeleton-block" /><div className="overview-skeleton-block" /><span className="sr-only">Loading retainer alerts…</span></div>}
            {alertsQuery.error && <div className="error-panel alert-center-error" role="alert"><p>{backendErrorMessage(alertsQuery.error)}</p><button type="button" className="button button-primary" onClick={() => void alertsQuery.refetch()}><RefreshCw size={14} /> Retry</button></div>}
            {!alertsQuery.isLoading && !alertsQuery.error && filtered.length === 0 && <EmptyState title={alerts.length ? "No alerts match these filters" : "No retainer alerts"} description={alerts.length ? "Adjust your search or severity filter." : "The backend currently returns no retainer threshold, exceeded-contract, or expiry alerts."} />}

            {!!filtered.length && <ul className="alert-center-list">{filtered.map((alert) => (
              <li className={`alert-center-item ${alert.severity}`} key={`${alert.retainerId}-${alert.type}`}>
                <div className="alert-center-icon" aria-hidden="true">{alert.severity === "critical" ? <AlertCircle size={19} /> : <AlertTriangle size={19} />}</div>
                <div className="alert-center-copy">
                  <div className="alert-center-title"><strong>{alert.retainerName}</strong><StatusBadge tone={alert.severity === "critical" ? "danger" : "warning"}>{alert.severity}</StatusBadge></div>
                  <p>{alert.message}</p>
                  <span className="alert-center-type">{alert.type}</span>
                </div>
                <Link className="button button-quiet alert-center-link" href={`/retainers?retainerId=${encodeURIComponent(alert.retainerId)}`}>Open retainer <ExternalLink size={14} /></Link>
              </li>
            ))}</ul>}
          </article>
        </>}
      </div>
    </AppShell>
  );
}
