import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Clock3, RefreshCw, Timer, UsersRound, WalletCards, ArrowRight, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BackendState } from "@/components/BackendState";
import { EmptyState, KpiCard, PageHeader, PanelHeader } from "@/components/DashboardPrimitives";
import { useAuth } from "@/contexts/AuthContext";
import { availableWorkingHours, formatCurrency, formatNumber, periodDateRange, utilizationFormula } from "@/lib/calculations";
import { trpc } from "@/lib/trpc";
import type { Consultant, ReportingPeriod, TimeEntry } from "@/types";
import type { BackendStatus } from "@/lib/backendService";

interface HomeProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  backendStatus: BackendStatus;
  onRetry: () => void;
}

const currencyOrder = ["USD", "EUR", "GBP"] as const;

export default function Home({ period, onPeriodChange, consultants, backendStatus, onRetry }: HomeProps) {
  const { can, user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  const firstName = user?.name?.trim().split(/\s+/)[0] || "there";
  const greeting = `Good ${now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"}, ${firstName}`;
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
  const personalEntriesQuery = trpc.timeEntries.list.useQuery({ page: 1, pageSize: 100 }, {
    enabled: user?.role === "consultant",
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

  if (user?.role === "consultant") {
    return <MyWorkspace period={period} onPeriodChange={onPeriodChange} userName={user.name ?? "there"} consultant={consultants.find((item) => item.id === user.consultantId)} entries={personalEntriesQuery.data?.items ?? []} loading={personalEntriesQuery.isLoading} error={personalEntriesQuery.error} onRetry={() => { void personalEntriesQuery.refetch(); }} />;
  }

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange} alertCount={canViewRetainers ? retainerAlertsQuery.data?.length ?? 0 : 0}>
      <div className="dashboard-page overview-dashboard">
        <PageHeader
          eyebrow="Operations overview"
          title={greeting}
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
              <KpiCard label="Non-billable hours" value={`${formatNumber(metricsQuery.data?.approvedNonBillableHours ?? 0)} hrs`} detail="Approved non-billable time" icon={<Clock3 size={17} />} accent="navy">
                <div className="kpi-footnote">Excluded from billable utilization</div>
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
                  <div className="utilization-heatmap" role="list" aria-label={`Consultant utilization heatmap for ${consultantUtilization.length} active consultants`}>
                    {consultantUtilization.map((consultant) => {
                      const intensity = Math.min(100, Math.max(0, consultant.utilization)) / 100;
                      return <article className={`utilization-heatmap-cell ${consultant.utilization > 100 ? "is-over-capacity" : ""}`} role="listitem" key={consultant.name} style={{ backgroundColor: `rgba(16, 185, 129, ${0.035 + intensity * 0.12})` } as CSSProperties}>
                        <div className="utilization-heatmap-heading"><strong>{consultant.name}</strong><b>{consultant.utilization}%</b></div>
                        <div className="utilization-heatmap-track" aria-hidden="true"><i style={{ width: `${intensity * 100}%` }} /></div>
                        <div className="utilization-heatmap-meta"><span>{formatNumber(consultant.billableHours)} of {formatNumber(consultant.availableHours)} hrs</span>{consultant.utilization > 100 && <em>Over capacity</em>}</div>
                      </article>;
                    })}
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

function MyWorkspace({ period, onPeriodChange, userName, consultant, entries, loading, error, onRetry }: { period: ReportingPeriod; onPeriodChange: (period: ReportingPeriod) => void; userName: string; consultant?: Consultant; entries: TimeEntry[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const today = new Date();
  const attendanceQuery = trpc.attendance.status.useQuery(undefined, { retry: false, refetchInterval: 30000 });
  const signInMutation = trpc.attendance.signIn.useMutation();
  const signOutMutation = trpc.attendance.signOut.useMutation();
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const weekday = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - weekday + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const week = entries.filter((entry) => entry.workDate >= iso(monday) && entry.workDate <= iso(sunday));
  const logged = week.filter((entry) => entry.status !== "Rejected").reduce((sum, entry) => sum + entry.hours, 0);
  const billable = week.filter((entry) => entry.status !== "Rejected" && entry.billingClassification === "Billable").reduce((sum, entry) => sum + entry.hours, 0);
  const nonBillable = logged - billable;
  const capacity = consultant?.weeklyCapacityHours;
  const utilization = capacity && capacity > 0 ? Math.round((billable / capacity) * 100) : null;
  const projects = Array.from(new Map(entries.filter((entry) => entry.projectReference).map((entry) => [entry.projectId, entry.projectReference!])).values());
  const recent = [...entries].sort((a, b) => b.workDate.localeCompare(a.workDate)).slice(0, 5);
  const toggleAttendance = async () => {
    setAttendanceError(null);
    try {
      if (attendanceQuery.data?.isSignedIn) {
        await signOutMutation.mutateAsync();
      } else {
        await signInMutation.mutateAsync();
      }
      await attendanceQuery.refetch();
    } catch (mutationError) {
      setAttendanceError(mutationError instanceof Error ? mutationError.message : "Could not update attendance status.");
    }
  };

  const isSignedIn = attendanceQuery.data?.isSignedIn ?? false;
  return <AppShell period={period} onPeriodChange={onPeriodChange}><main className="dashboard-page my-workspace">
    <PageHeader
      eyebrow="My workspace"
      title={`Good ${today.getHours() < 12 ? "morning" : today.getHours() < 18 ? "afternoon" : "evening"}, ${userName.split(" ")[0]}`}
      description="Your time, projects, and timesheet actions for the week."
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {attendanceError && <span style={{ color: "#B42318", fontSize: "12px" }}>{attendanceError}</span>}
          <button className={`button ${isSignedIn ? "button-quiet" : "button-primary"}`} onClick={() => void toggleAttendance()} disabled={signInMutation.isPending || signOutMutation.isPending}>
            {signInMutation.isPending || signOutMutation.isPending ? "Updating…" : isSignedIn ? "Sign off" : "Sign in"}
          </button>
          <Link href="/time-tracking" className="button button-primary"><Timer size={15} /> Log time</Link>
        </div>
      }
      meta={<span className="last-updated">{isSignedIn ? "Active" : "Offline"} · {iso(monday)} – {iso(sunday)}</span>}
    />
    {loading ? <DashboardSkeleton /> : error ? <BackendState error={error} onRetry={onRetry} title="Your timesheets are unavailable" /> : <>
      <section className="kpi-grid workspace-kpis" aria-label="This week's summary">
        <KpiCard label="Hours logged" value={`${formatNumber(logged)} hrs`} detail="Draft, submitted, and approved this week" icon={<Clock3 size={17} />} accent="teal" />
        <KpiCard label="Billable hours" value={`${formatNumber(billable)} hrs`} detail="Not rejected" icon={<Timer size={17} />} accent="blue" />
        <KpiCard label="Non-billable hours" value={`${formatNumber(nonBillable)} hrs`} detail="Not rejected" icon={<UsersRound size={17} />} accent="navy" />
        <KpiCard label="My utilization" value={utilization == null ? "—" : `${utilization}%`} detail={capacity ? `${formatNumber(capacity)} hour weekly capacity` : "Capacity not available"} icon={<CheckCircle2 size={17} />} accent={utilization != null && utilization >= 100 ? "amber" : "teal"} />
      </section>
      <section className="overview-operations workspace-sections">
        <article className="panel overview-operation-panel"><PanelHeader eyebrow="Your entries" title="My timesheets" action={<Link href="/time-tracking" className="text-link">View all <ArrowRight size={14} /></Link>} />
          {recent.length ? <div className="workspace-entry-list">{recent.map((entry) => <div className="workspace-entry" key={entry.id}><span><strong>{entry.projectReference?.name ?? "Project"}</strong><small>{entry.workDate} · {entry.hours} hrs · {entry.billingClassification}</small></span><span className={`workspace-status status-${entry.status.toLowerCase()}`}>{entry.status}</span></div>)}</div> : <EmptyState title="No time entries yet" description="Log your first entry to start your weekly timesheet." />}
        </article>
        <article className="panel overview-operation-panel"><PanelHeader eyebrow="From your entries" title="My projects" />
          {projects.length ? <ul className="workspace-project-list">{projects.map((project) => <li key={project.id}><strong>{project.name}</strong><span>{project.status}</span></li>)}</ul> : <EmptyState title="No project history yet" description="Projects will appear here after time has been recorded against them." />}
          <Link href="/time-tracking" className="button button-quiet workspace-secondary-action"><Timer size={14} />Open timesheets</Link>
        </article>
      </section>
    </>}
  </main></AppShell>;
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
