import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleAlert, Info, MoreHorizontal, TrendingUp } from "lucide-react";

export function KpiCard({ label, value, detail, delta, deltaLabel, icon, accent = "teal", children }: { label: string; value: string; detail: string; delta?: number; deltaLabel?: string; icon: ReactNode; accent?: "teal" | "navy" | "amber" | "blue"; children?: ReactNode }) {
  return <section className={`kpi-card accent-${accent}`}><div className="kpi-card-top"><span className="kpi-label">{label}</span><span className="kpi-icon">{icon}</span></div><div className="kpi-value-row"><strong className="kpi-value">{value}</strong>{delta !== undefined && <span className={`delta ${delta >= 0 ? "positive" : "negative"}`}>{delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(delta)}%</span>}</div><div className="kpi-detail">{detail}{deltaLabel && <span className="kpi-delta-label">{deltaLabel}</span>}</div>{children}</section>;
}

export function StatusBadge({ tone, children }: { tone: "success" | "warning" | "danger" | "info" | "neutral"; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? CircleAlert : tone === "danger" ? CircleAlert : tone === "info" ? Info : null;
  return <span className={`status-badge tone-${tone}`}>{Icon && <Icon size={12} />}{children}</span>;
}

export function PanelHeader({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="panel-header"><div>{eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}<h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}

export function TinyTrend({ values, color = "#0F9D91" }: { values: number[]; color?: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${28 - ((value - min) / (max - min || 1)) * 22}`).join(" ");
  return <svg className="tiny-trend" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><polyline points={`0,30 ${points} 100,30`} fill={color} opacity="0.08" stroke="none" /></svg>;
}

export function SectionMenuButton({ label = "More options" }: { label?: string }) {
  return <button className="icon-button section-menu-button" aria-label={label}><MoreHorizontal size={18} /></button>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><TrendingUp size={20} /><strong>{title}</strong><p>{description}</p></div>;
}
