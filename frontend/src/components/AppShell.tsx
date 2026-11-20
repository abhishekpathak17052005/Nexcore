import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Bell, BriefcaseBusiness, Building2, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, FileBarChart2, Gauge, LayoutDashboard, LogOut, Menu, Settings, Timer, UsersRound, WalletCards, X } from "lucide-react";
import type { ReportingPeriod } from "@/types";
import { periodLabel } from "@/lib/calculations";
import { useAuth, type ClientPermission } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { NotificationCenter } from "./NotificationCenter";

const primaryNav = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Consultants", href: "/consultants", icon: UsersRound, permission: "consultants.read" as ClientPermission },
  { label: "Timesheets", href: "/time-tracking", icon: Timer, permission: "time.read" as ClientPermission },
  { label: "Approvals", href: "/approvals", icon: CalendarClock, permission: "time.approve" as ClientPermission },
  { label: "Utilization", href: "/utilization", icon: Gauge, permission: "metrics.utilization" as ClientPermission },
  { label: "Revenue Analytics", href: "/revenue", icon: FileBarChart2, permission: "metrics.financial" as ClientPermission },
];

const workspaceNav = [
  { label: "Clients", href: "/clients", icon: Building2, permission: "clients.read" as ClientPermission },
  { label: "Projects", href: "/projects", icon: Building2, permission: "projects.read" as ClientPermission },
  { label: "Retainers", href: "/retainers", icon: WalletCards, permission: "clients.read" as ClientPermission },
  { label: "Alerts", href: "/alerts", icon: Bell, permission: "clients.read" as ClientPermission },
  { label: "Reports", href: "/reports", icon: BriefcaseBusiness, permission: "time.read" as ClientPermission },
  { label: "My Profile", href: "/settings", icon: Settings },
];

const periods: ReportingPeriod[] = ["this-week", "this-month", "last-month", "this-quarter", "custom"];

interface AppShellProps {
  children: ReactNode;
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  alertCount?: number;
}

export function AppShell({ children, period, onPeriodChange, alertCount = 0 }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const { user, can, logout } = useAuth();
  const signOutAttendanceMutation = trpc.attendance.signOut.useMutation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [onlineUserCount, setOnlineUserCount] = useState<number | null>(null);
  const [presenceUnavailable, setPresenceUnavailable] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  useEffect(() => {
    const roots = document.querySelectorAll(".content-area, .landing-container");
    if (!roots.length) return;
    const revealSelector = ".panel, .kpi-card, .settings-card, .alert-summary-card, .directory-summary-item, .retainer-panel, .report-panel, .form-section, .backend-state, .module-hero, .module-roadmap > *, .feature-box, .stat-card, .auth-modal-card, .time-entry-table tbody tr, .directory-table tbody tr, .report-panel tbody tr, .revenue-audit-panel tbody tr, .kpi-value, .directory-summary-item > strong, .alert-summary-card > strong, .overview-operation-summary > strong, .utilization-heatmap-heading > b, .drawer-metrics strong";
    if (!("IntersectionObserver" in window)) {
      roots.forEach((root) => root.querySelectorAll(revealSelector).forEach((element) => element.classList.add("is-scroll-visible")));
      return;
    }
    const intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-scroll-visible");
        intersectionObserver.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -48px 0px" });
    const observeTree = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node.matches(revealSelector)) intersectionObserver.observe(node);
      node.querySelectorAll(revealSelector).forEach((element) => intersectionObserver.observe(element));
    };
    const mutationObservers = Array.from(roots, (root) => {
      root.querySelectorAll(revealSelector).forEach((element) => intersectionObserver.observe(element));
      const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(observeTree)));
      observer.observe(root, { childList: true, subtree: true });
      return observer;
    });
    return () => {
      intersectionObserver.disconnect();
      mutationObservers.forEach((observer) => observer.disconnect());
    };
  }, [location]);

  const visiblePrimaryNav = primaryNav.filter((item) => !item.permission || can(item.permission));
  const visibleWorkspaceNav = workspaceNav.filter((item) => !item.permission || can(item.permission));
  const currentPage = [...primaryNav, ...workspaceNav].find((item) => item.href === location)?.label ?? "Overview";
  const closeMobile = () => setMobileOpen(false);

  const handleSignOut = async () => {
    setProfileOpen(false);
    try {
      await signOutAttendanceMutation.mutateAsync();
    } catch {
      // The account may already be signed out of attendance.
    }
    if (logout) {
      await logout();
    }
    setLocation("/");
  };

  const orgQuery = trpc.organizations.current.useQuery();
  const presenceMutation = trpc.presence.heartbeat.useMutation();

  useEffect(() => {
    if (!user) {
      setOnlineUserCount(null);
      return;
    }
    setOnlineUserCount(null);
    setPresenceUnavailable(false);
    let mounted = true;
    let requestPending = false;
    const heartbeat = async () => {
      if (requestPending) return;
      requestPending = true;
      try {
        const result = await presenceMutation.mutateAsync();
        if (mounted) {
          setOnlineUserCount(result.onlineCount);
          setPresenceUnavailable(false);
        }
      } catch {
        if (mounted) setPresenceUnavailable(true);
      } finally {
        requestPending = false;
      }
    };
    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [user?.id]);

  return (
    <div className="app-shell">
      <aside id="primary-navigation" className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
        <div className="sidebar-top">
          <Link href="/" className="wordmark" onClick={closeMobile} aria-label="NEXCORE overview">
            <img className="wordmark-logo" src="/nexcore-logo.png" alt="" aria-hidden="true" />
            {!collapsed && (
              <span>
                <strong>NEXCORE</strong>
                <small>{orgQuery.data?.name ?? "OPS CONSOLE"}</small>
              </span>
            )}
          </Link>
          <button className="icon-button sidebar-close-mobile" onClick={closeMobile} aria-label="Close navigation"><X size={18} /></button>
        </div>
        {!collapsed && <div className={`workspace-presence-card ${presenceUnavailable || !user ? "is-unavailable" : ""}`} role="status" aria-live="polite">
          <span className="workspace-presence-indicator" aria-hidden="true" />
          <span className="workspace-presence-copy">
            <strong>{!user ? "Sign in to see team presence" : presenceUnavailable ? "Online count unavailable" : onlineUserCount === null ? "Checking team presence..." : `${onlineUserCount} ${onlineUserCount === 1 ? "person" : "people"} online now`}</strong>
            <small><b>{!user || presenceUnavailable ? "OFFLINE" : onlineUserCount === null ? "SYNCING" : "LIVE"}</b><span>{!user ? "Sign in required" : presenceUnavailable ? "Unable to refresh status" : "Updates every 30 seconds"}</span></small>
          </span>
        </div>}
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <p className="nav-section-label">Command center</p>
          {visiblePrimaryNav.map((item) => <NavItem key={item.href} item={item} active={location === item.href} collapsed={collapsed} onClick={closeMobile} />)}
          <p className="nav-section-label">Workspace</p>
          {visibleWorkspaceNav.map((item) => <NavItem key={item.href} item={item} active={location === item.href} collapsed={collapsed} onClick={closeMobile} />)}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-mini"><div className="avatar avatar-teal">{(user?.name ?? "User").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>{!collapsed && <div className="profile-mini-copy"><strong>{user?.name ?? "Signed-out workspace"}</strong><span>{user?.role ?? "No assigned role"}</span></div>} {!collapsed && <ChevronRight size={15} className="profile-chevron" />}</div>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" onClick={closeMobile} aria-label="Close navigation overlay" />}
      <main className={`main-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded={mobileOpen}><Menu size={20} /></button>
            <div className="breadcrumbs">
              <span>{orgQuery.data?.name ?? "Workspace"}</span>
              <span className="breadcrumb-slash">/</span>
              <strong>{currentPage}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="topbar-divider" />
            <div className="period-control"><CalendarClock size={16} /><button className="period-trigger" onClick={() => setPeriodOpen((open) => !open)} aria-expanded={periodOpen}>{periodLabel(period)}<ChevronDown size={14} /></button>{periodOpen && <div className="floating-menu period-menu">{periods.map((option) => <button key={option} className={option === period ? "is-selected" : ""} onClick={() => { onPeriodChange(option); setPeriodOpen(false); }}>{periodLabel(option)}</button>)}</div>}</div>
            <NotificationCenter />
            {user && <button className="sign-out-button" onClick={handleSignOut} aria-label="Log out"><LogOut size={15} /><span>Log out</span></button>}
            <div className="profile-control"><button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}><div className="avatar avatar-teal">{(user?.name ?? "User").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><span className="profile-trigger-name">{user?.name ?? "Signed out"}</span>{user?.role && <span className="role-indicator">{user.role}</span>}<ChevronDown size={14} /></button>{profileOpen && <div className="floating-menu profile-menu"><strong>{user?.name ?? "Signed-out workspace"}</strong><span>{user?.role ?? "No assigned role"}</span><button onClick={handleSignOut}>Sign out</button></div>}</div>
          </div>
        </header>
        <button className="collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ item, active, collapsed, onClick }: { item: (typeof primaryNav)[number] | (typeof workspaceNav)[number]; active: boolean; collapsed: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <Link href={item.href} className={`nav-item ${active ? "is-active" : ""}`} onClick={onClick} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined}><Icon size={18} strokeWidth={active ? 2.3 : 1.8} /><span>{!collapsed && item.label}</span>{active && !collapsed && <span className="active-line" />}</Link>;
}
