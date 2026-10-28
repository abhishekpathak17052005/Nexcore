import { useState } from "react";
import { Link, Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/views/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./views/Home";
import Consultants from "./views/Consultants";
import TimeTracking from "./views/TimeTracking";
import Utilization from "./views/Utilization";
import RevenueAnalytics from "./views/RevenueAnalytics";
import ClientsProjects from "./views/ClientsProjects";
import Alerts from "./views/Alerts";
import Retainers from "./views/Retainers";
import Reports from "./views/Reports";
import Settings from "./views/Settings";
import LandingPage from "./views/LandingPage";
import { OnboardingPage } from "./views/OnboardingPage";
import { PendingApprovalView } from "./views/PendingApprovalView";
import { trpc } from "@/lib/trpc";
import type { BackendStatus } from "@/lib/backendService";
import { AuthProvider, useAuth, type ClientPermission } from "@/contexts/AuthContext";
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import type {
  ReportingPeriod,
  Consultant,
  ConsultantFormValues,
  TimeEntry,
  TimeEntryFormValues,
  TimeEntryStatus,
  Client,
  Project,
  CurrencyCode,
} from "@/types";

interface RouterProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  consultants: Consultant[];
  timeEntries: TimeEntry[];
  clients: Client[];
  projects: Project[];
  backendStatus: BackendStatus;
  onCreateConsultant: (values: ConsultantFormValues) => Promise<void>;
  onUpdateConsultant: (id: string, values: ConsultantFormValues) => Promise<void>;
  onCreateClient: (data: { clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode }) => Promise<void>;
  onUpdateClient: (id: string, data: { clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode }) => Promise<void>;
  onCreateProject: (data: { clientId: string; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate?: string | null; endDate?: string | null }) => Promise<void>;
  onUpdateProject: (id: string, data: { clientId: string; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate?: string | null; endDate?: string | null }) => Promise<void>;
  onTimeEntryCreate: (values: TimeEntryFormValues) => Promise<void>;
  onTimeEntryUpdate: (id: string, values: TimeEntryFormValues) => Promise<void>;
  onTimeEntryTransition: (id: string, nextStatus: TimeEntryStatus, rejectionReason?: string) => Promise<string | null>;
  onRetry: () => void;
}

function ProtectedView({
  permission,
  children,
}: {
  permission?: ClientPermission;
  children: React.ReactNode;
}) {
  const { user, loading, can } = useAuth();

  if (loading) {
    return (
      <div className="landing-container" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#38BDF8" }}>
          <Loader2 size={24} className="spin" />
          <span>Verifying session...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="landing-container" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "20px" }}>
        <div className="auth-modal-card" style={{ textAlign: "center", maxWidth: "460px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "rgba(14, 165, 233, 0.15)", color: "#38BDF8", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <Lock size={24} />
          </div>
          <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>Authentication Required</h3>
          <p style={{ color: "#94A3B8", fontSize: "14px", lineHeight: "1.5", marginBottom: "24px" }}>
            This section contains restricted operations. Please sign in to verify your credentials.
          </p>
          <Link href="/" className="btn-auth-submit" style={{ display: "inline-flex", width: "100%", justifyContent: "center" }}>
            Return to Landing & Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (user.membershipStatus === "pending" || user.membershipStatus === "rejected") {
    return <PendingApprovalView />;
  }

  if (user.membershipStatus === "unassigned") {
    return <OnboardingPage />;
  }

  if (permission && !can(permission)) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center", maxWidth: "560px", margin: "40px auto" }}>
        <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "rgba(239, 68, 68, 0.12)", color: "#EF4444", display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
          <ShieldAlert size={28} />
        </div>
        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0F172A", marginBottom: "8px" }}>Access Restricted</h2>
        <p style={{ color: "#64748B", fontSize: "14px", lineHeight: "1.5", marginBottom: "24px" }}>
          Your assigned role (<strong>{user.role}</strong>) does not have permission to view or manage this section.
        </p>
        <Link href="/" className="btn-auth-submit" style={{ display: "inline-flex", padding: "10px 24px" }}>
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

function Router({
  period,
  onPeriodChange,
  consultants,
  timeEntries,
  clients,
  projects,
  backendStatus,
  onCreateConsultant,
  onUpdateConsultant,
  onCreateClient,
  onUpdateClient,
  onCreateProject,
  onUpdateProject,
  onTimeEntryCreate,
  onTimeEntryUpdate,
  onTimeEntryTransition,
  onRetry,
}: RouterProps) {
  const { user, loading } = useAuth();

  return (
    <Switch>
      <Route path="/landing">
        {() => <LandingPage />}
      </Route>
      <Route path="/welcome">
        {() => <LandingPage />}
      </Route>
      <Route path="/onboarding">
        {() => <OnboardingPage />}
      </Route>
      <Route path="/pending">
        {() => <PendingApprovalView />}
      </Route>
      <Route path="/">
        {() => {
          if (loading) {
            return (
              <div className="landing-container" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "#38BDF8" }}>
                  <Loader2 size={24} className="spin" />
                  <span>Loading workspace...</span>
                </div>
              </div>
            );
          }
          if (!user) {
            return <LandingPage />;
          }
          if (user.membershipStatus === "pending" || user.membershipStatus === "rejected") {
            return <PendingApprovalView />;
          }
          if (user.membershipStatus === "unassigned") {
            return <OnboardingPage />;
          }
          return (
            <Home
              period={period}
              onPeriodChange={onPeriodChange}
              consultants={consultants}
              clients={clients}
              projects={projects}
              timeEntries={timeEntries}
            />
          );
        }}
      </Route>
      <Route path="/consultants">
        {() => (
          <ProtectedView permission="consultants.read">
            <Consultants
              period={period}
              onPeriodChange={onPeriodChange}
              records={consultants}
              timeEntries={timeEntries}
              clients={clients}
              projects={projects}
              backendStatus={backendStatus}
              onCreate={onCreateConsultant}
              onUpdate={onUpdateConsultant}
              onRetry={onRetry}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/time-tracking">
        {() => (
          <ProtectedView permission="time.read">
            <TimeTracking
              period={period}
              onPeriodChange={onPeriodChange}
              records={timeEntries}
              consultants={consultants}
              clients={clients}
              projects={projects}
              backendStatus={backendStatus}
              onCreate={onTimeEntryCreate}
              onUpdate={onTimeEntryUpdate}
              onTransition={onTimeEntryTransition}
              onRetry={onRetry}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/utilization">
        {() => (
          <ProtectedView permission="metrics.utilization">
            <Utilization
              period={period}
              onPeriodChange={onPeriodChange}
              consultants={consultants}
              timeEntries={timeEntries}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/revenue">
        {() => (
          <ProtectedView permission="metrics.financial">
            <RevenueAnalytics
              period={period}
              onPeriodChange={onPeriodChange}
              consultants={consultants}
              clients={clients}
              projects={projects}
              timeEntries={timeEntries}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/clients-projects">
        {() => (
          <ProtectedView permission="clients.read">
            <ClientsProjects
              period={period}
              onPeriodChange={onPeriodChange}
              clients={clients}
              projects={projects}
              backendStatus={backendStatus}
              onCreateClient={onCreateClient}
              onUpdateClient={onUpdateClient}
              onCreateProject={onCreateProject}
              onUpdateProject={onUpdateProject}
              onRetry={onRetry}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/alerts">
        {() => (
          <ProtectedView>
            <Alerts
              period={period}
              onPeriodChange={onPeriodChange}
              consultants={consultants}
              clients={clients}
              projects={projects}
              timeEntries={timeEntries}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/retainers">
        {() => (
          <ProtectedView>
            <Retainers
              period={period}
              onPeriodChange={onPeriodChange}
              clients={clients}
              projects={projects}
              timeEntries={timeEntries}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/reports">
        {() => (
          <ProtectedView>
            <Reports
              period={period}
              onPeriodChange={onPeriodChange}
              consultants={consultants}
              clients={clients}
              projects={projects}
              timeEntries={timeEntries}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/settings">
        {() => (
          <ProtectedView permission="users.manage">
            <Settings
              period={period}
              onPeriodChange={onPeriodChange}
              consultants={consultants}
            />
          </ProtectedView>
        )}
      </Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [period, setPeriod] = useState<ReportingPeriod>("this-month");
  const authQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const logoutMutation = trpc.auth.logout.useMutation();

  const isConsultant = authQuery.data?.role === "consultant";
  const isAuthenticated = Boolean(authQuery.data);

  // Real backend queries across all screens - only fire when authenticated
  const consultantQuery = trpc.consultants.list.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const clientQuery = trpc.clients.list.useQuery(undefined, { enabled: isAuthenticated && !isConsultant, retry: false });
  const projectQuery = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated && !isConsultant, retry: false });
  const timeEntryQuery = trpc.timeEntries.list.useQuery({ page: 1, pageSize: 200 }, { enabled: isAuthenticated, retry: false });

  // Mutations
  const consultantCreate = trpc.consultants.create.useMutation();
  const consultantUpdate = trpc.consultants.update.useMutation();
  const clientCreate = trpc.clients.create.useMutation();
  const clientUpdate = trpc.clients.update.useMutation();
  const projectCreate = trpc.projects.create.useMutation();
  const projectUpdate = trpc.projects.update.useMutation();
  const timeEntryCreate = trpc.timeEntries.create.useMutation();
  const timeEntryUpdate = trpc.timeEntries.update.useMutation();
  const timeEntrySubmit = trpc.timeEntries.submit.useMutation();
  const timeEntryApprove = trpc.timeEntries.approve.useMutation();
  const timeEntryReject = trpc.timeEntries.reject.useMutation();
  const timeEntryReturn = trpc.timeEntries.returnToDraft.useMutation();

  const refetchBackend = async () => {
    if (!isAuthenticated) return;
    await Promise.all([
      consultantQuery.refetch(),
      !isConsultant ? clientQuery.refetch() : Promise.resolve(),
      !isConsultant ? projectQuery.refetch() : Promise.resolve(),
      timeEntryQuery.refetch(),
    ]);
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // Silently continue
    } finally {
      try {
        sessionStorage.removeItem("manus-cookie");
      } catch {}
      await authQuery.refetch();
    }
  };

  const backendStatus: BackendStatus = {
    enabled: true,
    loading:
      isAuthenticated &&
      (consultantQuery.isLoading ||
        (!isConsultant && clientQuery.isLoading) ||
        (!isConsultant && projectQuery.isLoading) ||
        timeEntryQuery.isLoading),
    error:
      consultantQuery.error ??
      (!isConsultant ? clientQuery.error : null) ??
      (!isConsultant ? projectQuery.error : null) ??
      timeEntryQuery.error,
    ready:
      isAuthenticated &&
      consultantQuery.isSuccess &&
      (isConsultant || (clientQuery.isSuccess && projectQuery.isSuccess)) &&
      timeEntryQuery.isSuccess,
  };

  const consultants = backendStatus.ready ? (consultantQuery.data ?? []) : [];
  const clients = backendStatus.ready ? (clientQuery.data ?? []) : [];
  const projects = backendStatus.ready ? (projectQuery.data ?? []) : [];
  const timeEntries = backendStatus.ready ? (timeEntryQuery.data?.items ?? []) : [];

  const handleCreateConsultant = async (values: ConsultantFormValues) => {
    await consultantCreate.mutateAsync(values);
    await consultantQuery.refetch();
  };

  const handleUpdateConsultant = async (id: string, values: ConsultantFormValues) => {
    await consultantUpdate.mutateAsync({ id, data: values });
    await consultantQuery.refetch();
  };

  const handleCreateClient = async (data: { clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode }) => {
    await clientCreate.mutateAsync(data);
    await clientQuery.refetch();
  };

  const handleUpdateClient = async (id: string, data: { clientCode: string; name: string; status: "Active" | "Inactive"; defaultCurrency: CurrencyCode }) => {
    await clientUpdate.mutateAsync({ id, data });
    await clientQuery.refetch();
  };

  const handleCreateProject = async (data: { clientId: string; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate?: string | null; endDate?: string | null }) => {
    await projectCreate.mutateAsync(data);
    await projectQuery.refetch();
  };

  const handleUpdateProject = async (id: string, data: { clientId: string; name: string; status: "Active" | "On hold" | "Closed"; billingCurrency: CurrencyCode; startDate?: string | null; endDate?: string | null }) => {
    await projectUpdate.mutateAsync({ id, data });
    await projectQuery.refetch();
  };

  const toApiTimeEntry = (values: TimeEntryFormValues) => ({
    ...values,
    hours: Number(values.hours),
    billingRate: values.billingClassification === "Billable" ? Number(values.billingRate) : null,
    currency: values.billingClassification === "Billable" ? values.currency : null,
  });

  const handleCreateTimeEntry = async (values: TimeEntryFormValues) => {
    await timeEntryCreate.mutateAsync(toApiTimeEntry(values));
    await timeEntryQuery.refetch();
  };

  const handleUpdateTimeEntry = async (id: string, values: TimeEntryFormValues) => {
    await timeEntryUpdate.mutateAsync({ id, data: toApiTimeEntry(values) });
    await timeEntryQuery.refetch();
  };

  const handleTransitionTimeEntry = async (
    id: string,
    nextStatus: TimeEntryStatus,
    rejectionReason?: string
  ) => {
    try {
      if (nextStatus === "Submitted") {
        await timeEntrySubmit.mutateAsync({ id });
      } else if (nextStatus === "Approved") {
        await timeEntryApprove.mutateAsync({ id });
      } else if (nextStatus === "Rejected") {
        await timeEntryReject.mutateAsync({ id, reason: rejectionReason ?? "" });
      } else {
        await timeEntryReturn.mutateAsync({ id });
      }
      await timeEntryQuery.refetch();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "The time-entry operation failed.";
    }
  };

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AuthProvider
            value={{
              user: authQuery.data ?? null,
              loading: authQuery.isLoading,
              refresh: () => authQuery.refetch(),
              logout: handleLogout,
            }}
          >
            <Router
              period={period}
              onPeriodChange={setPeriod}
              consultants={consultants}
              timeEntries={timeEntries}
              clients={clients}
              projects={projects}
              backendStatus={backendStatus}
              onCreateConsultant={handleCreateConsultant}
              onUpdateConsultant={handleUpdateConsultant}
              onCreateClient={handleCreateClient}
              onUpdateClient={handleUpdateClient}
              onCreateProject={handleCreateProject}
              onUpdateProject={handleUpdateProject}
              onTimeEntryCreate={handleCreateTimeEntry}
              onTimeEntryUpdate={handleUpdateTimeEntry}
              onTimeEntryTransition={handleTransitionTimeEntry}
              onRetry={refetchBackend}
            />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
