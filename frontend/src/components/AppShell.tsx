import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Bell, BriefcaseBusiness, Building2, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, FileBarChart2, Gauge, LayoutDashboard, Menu, PanelLeftClose, Search, Settings, Timer, UsersRound, WalletCards, X } from "lucide-react";
import type { ReportingPeriod } from "@/types";
import { periodLabel } from "@/lib/calculations";
import { useAuth, type ClientPermission } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { NotificationCenter } from "./NotificationCenter";

const primaryNav = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Consultants", href: "/consultants", icon: UsersRound, permission: "consultants.read" as ClientPermission },
  { label: "Time Tracking", href: "/time-tracking", icon: Timer, permission: "time.read" as ClientPermission },
  { label: "Utilization", href: "/utilization", icon: Gauge, permission: "metrics.utilization" as ClientPermission },
  { label: "Revenue Analytics", href: "/revenue", icon: FileBarChart2, permission: "metrics.financial" as ClientPermission },
];

const workspaceNav = [
  { label: "Clients & Projects", href: "/clients-projects", icon: Building2, permission: "clients.read" as ClientPermission },
  { label: "Retainers", href: "/retainers", icon: WalletCards },
  { label: "Alerts", href: "/alerts", icon: Bell },
  { label: "Reports", href: "/reports", icon: BriefcaseBusiness },
  { label: "Settings", href: "/settings", icon: Settings, permission: "users.manage" as ClientPermission },
];

const periods: ReportingPeriod[] = ["this-week", "this-month", "last-month", "this-quarter", "custom"];

interface AppShellProps {
  children: ReactNode;
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  alertCount?: number;
}

export function AppShell({ children, period, onPeriodChange, alertCount = 4 }: AppShellProps) {
  const [location, setLocation] = useLocation();
  const { user, can, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const visiblePrimaryNav = primaryNav.filter((item) => !item.permission || can(item.permission));
  const visibleWorkspaceNav = workspaceNav.filter((item) => !item.permission || can(item.permission));
  const currentPage = [...primaryNav, ...workspaceNav].find((item) => item.href === location)?.label ?? "Overview";
  const closeMobile = () => setMobileOpen(false);

  const handleSignOut = async () => {
    setProfileOpen(false);
    if (logout) {
      await logout();
    }
    setLocation("/");
  };

  const orgQuery = trpc.organizations.current.useQuery();

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
        <div className="sidebar-top">
          <Link href="/" className="wordmark" onClick={closeMobile} aria-label="NEXCORE overview">
            <span className="wordmark-mark" aria-hidden="true"><i /><i /><i /></span>
            {!collapsed && (
              <span>
                <strong>NEXCORE</strong>
                <small>{orgQuery.data?.name ?? "OPS CONSOLE"}</small>
              </span>
            )}
          </Link>
          <button className="icon-button sidebar-close-mobile" onClick={closeMobile} aria-label="Close navigation"><X size={18} /></button>
        </div>
        {!collapsed && <p className="sidebar-caption">Consultant operations<br />& billing workspace</p>}
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <p className="nav-section-label">Command center</p>
          {visiblePrimaryNav.map((item) => <NavItem key={item.href} item={item} active={location === item.href} collapsed={collapsed} onClick={closeMobile} />)}
          <p className="nav-section-label">Workspace</p>
          {visibleWorkspaceNav.map((item) => <NavItem key={item.href} item={item} active={location === item.href} collapsed={collapsed} onClick={closeMobile} />)}
        </nav>
        <div className="sidebar-bottom">
          {!collapsed && <div className="help-card"><CircleHelp size={16} /><div><strong>Need a hand?</strong><span>View workspace guide</span></div></div>}
          <div className="profile-mini"><div className="avatar avatar-teal">{(user?.name ?? "User").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>{!collapsed && <div className="profile-mini-copy"><strong>{user?.name ?? "Signed-out workspace"}</strong><span>{user?.role ?? "No assigned role"}</span></div>} {!collapsed && <ChevronRight size={15} className="profile-chevron" />}</div>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" onClick={closeMobile} aria-label="Close navigation overlay" />}
      <main className={`main-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
        <header className="topbar">
          <div className="topbar-leading">
            <button className="icon-button mobile-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <div className="breadcrumbs">
              <span>{orgQuery.data?.name ?? "Workspace"}</span>
              <span className="breadcrumb-slash">/</span>
              <strong>{currentPage}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={17} /><span className="sr-only">Search workspace</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspace" /><kbd>⌘ K</kbd></label>
            <div className="topbar-divider" />
            <div className="period-control"><CalendarClock size={16} /><button className="period-trigger" onClick={() => setPeriodOpen((open) => !open)} aria-expanded={periodOpen}>{periodLabel(period)}<ChevronDown size={14} /></button>{periodOpen && <div className="floating-menu period-menu">{periods.map((option) => <button key={option} className={option === period ? "is-selected" : ""} onClick={() => { onPeriodChange(option); setPeriodOpen(false); }}>{periodLabel(option)}</button>)}</div>}</div>
            <NotificationCenter />
            <div className="profile-control"><button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)}><div className="avatar avatar-teal">{(user?.name ?? "User").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><span className="profile-trigger-name">{user?.name ?? "Signed out"}</span><ChevronDown size={14} /></button>{profileOpen && <div className="floating-menu profile-menu"><strong>{user?.name ?? "Signed-out workspace"}</strong><span>{user?.role ?? "No assigned role"}</span><button onClick={() => setProfileOpen(false)}>Profile settings</button><button onClick={handleSignOut}>Sign out</button></div>}</div>
          </div>
        </header>
        <button className="collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
        <div className="content-area">{children}</div>
      </main>
    </div>
  );
}

function NavItem({ item, active, collapsed, onClick }: { item: (typeof primaryNav)[number]; active: boolean; collapsed: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <Link href={item.href} className={`nav-item ${active ? "is-active" : ""}`} onClick={onClick} title={collapsed ? item.label : undefined}><Icon size={18} strokeWidth={active ? 2.3 : 1.8} /><span>{!collapsed && item.label}</span>{active && !collapsed && <span className="active-line" />}</Link>;
}
