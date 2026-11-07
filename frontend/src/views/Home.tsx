import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Clock3, RefreshCw, Timer, UsersRound, WalletCards } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BackendState } from "@/components/BackendState";
import { EmptyState, KpiCard, PageHeader, PanelHeader } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import { availableWorkingHours, formatCurrency, formatNumber, periodDateRange, utilizationFormula } from "@/lib/calculations";
import { trpc } from "@/lib/trpc";
import type { Consultant, ReportingPeriod } from "@/types";
import type { BackendStatus } from "@/lib/backendService";

interface HomeProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  backendStatus: BackendStatus;
  onRetry: () => void;
}

const currencyOrder = ["USD", "EUR", "GBP"] as const;
const chartColors = ["#147D73", "#3973C6", "#C1842D", "#65758B"];

export default function Home({ period, onPeriodChange, consultants, backendStatus, onRetry }: HomeProps) {
  const { can } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const range = useMemo(() => periodDateRange(period), [period]);
  const canViewMetrics = can("metrics.utilization");
  const canViewFinancials = can("metrics.financial");
  const canViewRetainers = can("clients.read");
  const activeConsultants = useMemo(
    () => consultants.filter((consultant) => consultant.employmentStatus === "Active"),
    [consultants],
  );

  const metricsQuery = trpc.timeEntries.metrics.useQuery(range, {
    enabled: canViewMetrics,
    retry: false,
  });
  const draftEntriesQuery = trpc.timeEntries.list.useQuery({ status: "Draft", page: 1, pageSize: 100 }, {
    enabled: can("time.read"),
    retry: false,
  });
  const draftPageCount = Math.ceil((draftEntriesQuery.data?.total ?? 0) / 100);
  const additionalDraftQueries = trpc.useQueries((queries) =>
    Array.from({ length: Math.max(0, draftPageCount - 1) }, (_, index) =>
      queries.timeEntries.list({ status: "Draft", page: index + 2, pageSize: 100 }, {
        enabled: can("time.read"),
        retry: false,
      }),
    ),
  );
  const consultantMetricQueries = trpc.useQueries((queries) =>
    activeConsultants.map((consultant) =>
      queries.timeEntries.metrics({ ...range, consultantId: consultant.id }, {
        enabled: canViewMetrics,
        retry: false,
      }),
    ),
  );
  const retainerAlertsQuery = trpc.retainers.alerts.useQuery(undefined, {
    enabled: canViewRetainers,
    retry: false,
  });

  const metricError = metricsQuery.error ?? draftEntriesQuery.error ??
    additionalDraftQueries.find((query) => query.error)?.error ??
    consultantMetricQueries.find((query) => query.error)?.error;
  const availableHours = useMemo(
    () => activeConsultants.reduce((total, consultant) => total + availableWorkingHours(consultant, period, range), 0),
    [activeConsultants, period, range],
  );
  const utilization = utilizationFormula(metricsQuery.data?.approvedBillableHours ?? 0, availableHours);
  const consultantUtilization = useMemo(() => activeConsultants.map((consultant, index) => {
    const approvedBillableHours = consultantMetricQueries[index]?.data?.approvedBillableHours ?? 0;
    const consultantAvailableHours = availableWorkingHours(consultant, period, range);
    return {
      name: consultant.name,
      utilization: utilizationFormula(approvedBillableHours, consultantAvailableHours) ?? 0,
      billableHours: approvedBillableHours,
      availableHours: consultantAvailableHours,
    };
  }).sort((a, b) => b.utilization - a.utilization), [activeConsultants, consultantMetricQueries, period, range]);

  const draftEntries = useMemo(() => [
    ...(draftEntriesQuery.data?.items ?? []),
    ...additionalDraftQueries.flatMap((query) => query.data?.items ?? []),
  ], [draftEntriesQuery.data, additionalDraftQueries]);
  // The API has no due date or overdue policy, so report the actual draft count
  // without deriving an unsupported overdue threshold.
  const draftCount = draftEntries.length;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.allSettled([
        onRetry(),
        metricsQuery.refetch(),
        draftEntriesQuery.refetch(),
        ...additionalDraftQueries.map((query) => query.refetch()),
        ...consultantMetricQueries.map((query) => query.refetch()),
        ...(canViewRetainers ? [retainerAlertsQuery.refetch()] : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const loading = backendStatus.loading || metricsQuery.isLoading || draftEntriesQuery.isLoading ||
    additionalDraftQueries.some((query) => query.isLoading) || consultantMetricQueries.some((query) => query.isLoading);

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange} alertCount={canViewRetainers ? retainerAlertsQuery.data?.length ?? 0 : 0}>
      <div className="dashboard-page overview-dashboard">
        <PageHeader
          eyebrow="Operations overview"
          title="Overview"
          description="Billable capacity and time-entry activity for the selected reporting period."
          actions={(
            <button className="button button-quiet overview-refresh" onClick={handleRefresh} disabled={refreshing || loading}>
              <RefreshCw size={15} className={refreshing ? "overview-refresh-spin" : undefined} />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          )}
          meta={<span className="last-updated">{range.from} – {range.to}</span>}
        />

        {loading ? (
          <DashboardSkeleton />
        ) : backendStatus.error ? (
          <BackendState loading={false} error={backendStatus.error} onRetry={handleRefresh} title="Dashboard data unavailable" />
        ) : metricError ? (
          <BackendState loading={false} error={metricError} onRetry={handleRefresh} title="Dashboard metrics unavailable" />
        ) : !canViewMetrics ? (
          <div className="panel overview-access-state">
            <EmptyState title="Overview metrics are unavailable for this role" description="Your current permissions do not include utilization metrics." />
          </div>
        ) : (
          <>
            <section className={`kpi-grid overview-kpi-grid ${canViewFinancials ? "has-revenue" : ""}`} aria-label="Overview metrics">
              <KpiCard label="Billable utilization" value={utilization == null ? "—" : `${utilization}%`} detail="Approved billable hours ÷ available hours" icon={<UsersRound size={17} />} accent="teal">
                <div className="kpi-footnote">Available capacity estimate for this period</div>
              </KpiCard>
              <KpiCard label="Billable hours" value={`${formatNumber(metricsQuery.data?.approvedBillableHours ?? 0)} hrs`} detail="Approved time entries" icon={<Timer size={17} />} accent="blue">
                <div className="kpi-footnote">Submitted entries are excluded</div>
              </KpiCard>
              <KpiCard label="Available hours" value={`${formatNumber(availableHours)} hrs`} detail={`${activeConsultants.length} active consultants`} icon={<Clock3 size={17} />} accent="navy">
                <div className="kpi-footnote">Leave and holidays are not modeled</div>
              </KpiCard>
              {canViewFinancials && <RevenueKpi amounts={metricsQuery.data?.estimatedRevenueByCurrency ?? {}} />}
              <KpiCard label="Pending timesheets" value={formatNumber(metricsQuery.data?.pendingApproval ?? 0)} detail="Submitted entries awaiting review" icon={<AlertTriangle size={17} />} accent={(metricsQuery.data?.pendingApproval ?? 0) > 0 ? "amber" : "teal"}>
                <div className="kpi-footnote"><Link href="/approvals" className="overview-inline-link">Open approvals</Link></div>
              </KpiCard>
            </section>

            <section className="overview-analytics-grid" aria-label="Dashboard analytics">
              <article className="panel chart-panel overview-chart-panel">
                <PanelHeader eyebrow="Approved time" title="Billable vs non-billable hours" detail="Hours approved in the selected period" />
                {(metricsQuery.data?.approvedBillableHours ?? 0) + (metricsQuery.data?.approvedNonBillableHours ?? 0) === 0 ? (
                  <EmptyState title="No approved time entries" description="Hours will appear here after time entries are approved." />
                ) : (
                  <div className="overview-chart" role="img" aria-label={`Approved billable hours: ${metricsQuery.data?.approvedBillableHours ?? 0}; approved non-billable hours: ${metricsQuery.data?.approvedNonBillableHours ?? 0}`}>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={[{ name: "Approved hours", Billable: metricsQuery.data?.approvedBillableHours ?? 0, "Non-billable": metricsQuery.data?.approvedNonBillableHours ?? 0 }]} margin={{ top: 12, right: 12, bottom: 4, left: 0 }}>
                        <CartesianGrid vertical={false} stroke="#E6EDF2" />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#69798B", fontSize: 12 }} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fill: "#69798B", fontSize: 11 }} />
                        <Tooltip formatter={(value) => [`${value} hrs`]} />
                        <Bar dataKey="Billable" fill="#147D73" radius={[4, 4, 0, 0]} maxBarSize={64} />
                        <Bar dataKey="Non-billable" fill="#AEBBC8" radius={[4, 4, 0, 0]} maxBarSize={64} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </article>

              <article className="panel chart-panel overview-chart-panel">
                <PanelHeader eyebrow="Team capacity" title="Utilization distribution" detail="Approved billable hours as a share of available hours by consultant" />
                {consultantUtilization.length === 0 ? (
                  <EmptyState title="No active consultants" description="Active consultant records will appear here." />
                ) : (
                  <div className="overview-chart" role="img" aria-label={`Utilization by consultant for ${consultantUtilization.length} active consultants`}>
                    <ResponsiveContainer width="100%" height={Math.max(250, Math.min(420, consultantUtilization.length * 38))}>
                      <BarChart data={consultantUtilization} layout="vertical" margin={{ top: 4, right: 22, bottom: 4, left: 8 }}>
                        <CartesianGrid horizontal={false} stroke="#E6EDF2" />
                        <XAxis type="number" domain={[0, "dataMax"]} tickLine={false} axisLine={false} tick={{ fill: "#69798B", fontSize: 10 }} tickFormatter={(value) => `${value}%`} />
                        <YAxis type="category" dataKey="name" width={104} tickLine={false} axisLine={false} tick={{ fill: "#475569", fontSize: 10 }} />
                        <Tooltip formatter={(value) => [`${value}%`, "Utilization"]} />
                        <Bar dataKey="utilization" radius={[0, 4, 4, 0]} maxBarSize={20}>
                          {consultantUtilization.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </article>
            </section>

            <section className="overview-operations" aria-label="Operational follow-up">
              <article className="panel overview-operation-panel">
                <PanelHeader eyebrow="Review queue" title="Pending approvals" action={<Link href="/approvals" className="text-link">Open approvals</Link>} />
                <OperationSummary count={metricsQuery.data?.pendingApproval ?? 0} unit="submitted entries" empty="No submitted time entries are awaiting review." />
              </article>
              <article className="panel overview-operation-panel">
                <PanelHeader eyebrow="Timesheet hygiene" title="Draft timesheets" action={<Link href="/time-tracking" className="text-link">Open timesheets</Link>} />
                <OperationSummary count={draftCount} unit="draft entries" empty="No draft time entries are waiting to be submitted." />
              </article>
              {canViewRetainers && <article className="panel overview-operation-panel">
                <PanelHeader eyebrow="Retainer watch" title="Retainer alerts" action={<Link href="/retainers" className="text-link">View retainers</Link>} />
                {retainerAlertsQuery.isLoading ? <InlineLoading /> : retainerAlertsQuery.error ? <InlineError message="Retainer alerts could not be loaded." /> : (retainerAlertsQuery.data?.length ?? 0) === 0 ? <OperationSummary count={0} unit="active alerts" empty="No retainer alerts." /> : (
                  <ul className="overview-alert-list">
                    {retainerAlertsQuery.data?.slice(0, 4).map((alert) => <li key={`${alert.retainerId}-${alert.type}`}><span className={`overview-alert-mark ${alert.severity}`} /><span><strong>{alert.retainerName}</strong><small>{alert.message}</small></span></li>)}
                  </ul>
                )}
              </article>}
            </section>

            <section className="panel overview-consultant-panel">
              <PanelHeader eyebrow="Team capacity" title="Consultant utilization" detail="Approved billable hours and available capacity for the selected period" action={<Link href="/utilization" className="text-link">Full utilization view</Link>} />
              {consultantUtilization.length === 0 ? <EmptyState title="No active consultants" description="Consultant utilization will appear after active consultant records are available." /> : (
                <div className="overview-consultant-list">
                  {consultantUtilization.map((consultant) => <div className="overview-consultant-row" key={consultant.name}>
                    <strong>{consultant.name}</strong>
                    <span>{formatNumber(consultant.billableHours)} / {formatNumber(consultant.availableHours)} hrs</span>
                    <div className="overview-utilization-track" aria-hidden="true"><i style={{ width: `${Math.min(consultant.utilization, 100)}%` }} /></div>
                    <b>{consultant.utilization}%</b>
                  </div>)}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function RevenueKpi({ amounts }: { amounts: Partial<Record<string, number>> }) {
  const nonZeroCurrencies = currencyOrder.filter((currency) => amounts[currency] != null);
  return (
    <KpiCard label="Billable revenue" value={nonZeroCurrencies.length === 1 ? formatCurrency(amounts[nonZeroCurrencies[0]!]!, true, nonZeroCurrencies[0]!) : nonZeroCurrencies.length ? `${nonZeroCurrencies.length} currencies` : "—"} detail="Estimated from approved and submitted entries" icon={<WalletCards size={17} />} accent="teal">
      <div className="kpi-footnote overview-currency-list">
        {nonZeroCurrencies.length ? nonZeroCurrencies.map((currency) => <span key={currency}>{formatCurrency(amounts[currency]!, true, currency)}</span>) : "No revenue entries for this period"}
        <small>Not collected revenue or profit</small>
      </div>
    </KpiCard>
  );
}

function OperationSummary({ count, unit, empty }: { count: number; unit: string; empty: string }) {
  return <div className="overview-operation-summary"><strong>{formatNumber(count)}</strong><span>{unit}</span>{count === 0 && <small>{empty}</small>}</div>;
}

function InlineLoading() {
  return <div className="overview-inline-state" role="status">Loading alerts…</div>;
}

function InlineError({ message }: { message: string }) {
  return <div className="overview-inline-error" role="alert">{message}</div>;
}

function DashboardSkeleton() {
  return (
    <div className="overview-skeleton" role="status" aria-label="Loading dashboard">
      <div className="overview-skeleton-kpis">{Array.from({ length: 5 }, (_, index) => <div className="overview-skeleton-block" key={index} />)}</div>
      <div className="overview-skeleton-charts"><div className="overview-skeleton-block" /><div className="overview-skeleton-block" /></div>
      <span className="sr-only">Loading dashboard metrics…</span>
    </div>
  );
}
