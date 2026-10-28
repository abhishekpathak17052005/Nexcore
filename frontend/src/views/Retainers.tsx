import { useMemo, useState } from "react";
import { Link } from "wouter";
import { WalletCards, AlertCircle, ArrowUpRight, FileCode, CheckCircle2, Building2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PanelHeader } from "@/components/DashboardPrimitives";
import type { Client, Project, ReportingPeriod, TimeEntry } from "@/types";
import { formatCurrency, formatNumber } from "@/lib/calculations";

interface RetainersProps {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  clients: Client[];
  projects: Project[];
  timeEntries: TimeEntry[];
}

export default function Retainers({
  period,
  onPeriodChange,
  clients,
  projects,
  timeEntries,
}: RetainersProps) {
  // Aggregate real delivery hours and captured rate value per client
  const clientEngagementHours = useMemo(() => {
    return clients.map((client) => {
      const clientProjects = projects.filter((p) => p.clientId === client.id);
      const cEntries = timeEntries.filter((e) => e.clientId === client.id && e.billingClassification === "Billable");
      const approvedHours = cEntries.filter((e) => e.status === "Approved").reduce((sum, e) => sum + e.hours, 0);
      const submittedHours = cEntries.filter((e) => e.status === "Submitted").reduce((sum, e) => sum + e.hours, 0);
      const totalEstimatedValue = cEntries.filter((e) => e.status === "Approved").reduce((sum, e) => sum + (e.billingRateSnapshot ?? 0) * e.hours, 0);

      return {
        ...client,
        projectCount: clientProjects.length,
        approvedHours,
        submittedHours,
        totalEstimatedValue,
        timeEntryCount: cEntries.length,
      };
    });
  }, [clients, projects, timeEntries]);

  return (
    <AppShell period={period} onPeriodChange={onPeriodChange}>
      <div className="dashboard-page">
        <div className="page-heading-row">
          <div>
            <p className="eyebrow">Contract governance <span className="eyebrow-dot" /></p>
            <h1>Retainer Engagements</h1>
            <p className="page-subtitle">
              Client retainer drawdown, burn analysis, and contract balance monitoring.
            </p>
          </div>
        </div>

        {/* Phase G Explicit Architectural Disclosure Callout */}
        <div className="panel" style={{ padding: "18px 20px", marginBottom: "24px", background: "linear-gradient(to right, #FEFCBF, #FEF9E7)", border: "1px solid #F6E05E", borderLeft: "4px solid #D69E2E" }}>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <AlertCircle size={20} style={{ color: "#B7791F", flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#744210", margin: "0 0 8px 0" }}>
                Retainer Contract Schema Dependency Notice (Phase G Compliance)
              </h3>
              <p style={{ fontSize: "12.5px", color: "#744210", lineHeight: 1.65, margin: 0 }}>
                The current MongoDB data model stores <code style={{ background: "#FEF5E7", padding: "2px 5px", borderRadius: 3, fontSize: "11.5px" }}>clients</code>, <code style={{ background: "#FEF5E7", padding: "2px 5px", borderRadius: 3, fontSize: "11.5px" }}>projects</code>, <code style={{ background: "#FEF5E7", padding: "2px 5px", borderRadius: 3, fontSize: "11.5px" }}>consultants</code>, and <code style={{ background: "#FEF5E7", padding: "2px 5px", borderRadius: 3, fontSize: "11.5px" }}>timeEntries</code>.
                Contractual retainer agreements (contracted baseline hours, fixed prepaid fees, rollover terms, and drawdown thresholds) are not currently defined as an independent database collection.
                Per project specifications, retainer limits and remaining balances are <strong>not fabricated</strong>. Below is the live delivery engagement data alongside the proposed production schema.
              </p>
            </div>
          </div>
        </div>

        {/* Supported Delivery Data: Client Engagement Hours */}
        <article className="panel" style={{ marginBottom: "24px" }}>
          <PanelHeader
            eyebrow="Supported Delivery Data"
            title="Client Billable Engagement Hours"
            detail="Aggregated from approved time entries and active projects currently in MongoDB"
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Client Code</th>
                  <th>Client Name</th>
                  <th>Active Projects</th>
                  <th>Default Currency</th>
                  <th>Approved Billable Hours</th>
                  <th>Submitted Hours</th>
                  <th>Estimated Value</th>
                  <th>Retainer Agreement Status</th>
                </tr>
              </thead>
              <tbody>
                {clientEngagementHours.map((client) => (
                  <tr key={client.id}>
                    <td><code>{client.clientCode}</code></td>
                    <td><strong>{client.name}</strong></td>
                    <td>{client.projectCount} projects</td>
                    <td><span className="badge badge-currency">{client.defaultCurrency}</span></td>
                    <td className="number-cell" style={{ fontWeight: 600 }}>{formatNumber(client.approvedHours)}h</td>
                    <td className="number-cell" style={{ color: "#718096" }}>{formatNumber(client.submittedHours)}h</td>
                    <td className="revenue-cell">{formatCurrency(client.totalEstimatedValue, false, client.defaultCurrency)}</td>
                    <td>
                      <span className="badge" style={{ background: "#EDF2F7", color: "#4A5568" }}>
                        Pending Agreement Schema
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {/* Proposed Schema & Balance Calculation Specification */}
        <article className="panel" style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <FileCode size={20} color="#2B6CB0" />
            <h2 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "#2D3748" }}>Proposed Retainer Production Specification</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
            <div>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#2D3748", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ background: "#2B6CB0", color: "white", width: "20px", height: "20px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700 }}>1</span>
                Required Schema (<code style={{ fontSize: "11px" }}>retainerAgreements</code> collection):
              </h3>
              <pre style={{ background: "#1A202C", color: "#E2E8F0", padding: "14px 16px", borderRadius: "6px", fontSize: "11px", lineHeight: 1.7, overflowX: "auto", margin: 0, border: "1px solid #2D3748" }}>
{`interface RetainerAgreement {
  _id: ObjectId;
  clientId: ObjectId;
  projectId?: ObjectId;
  type: "Hours" | "Amount";
  contractedQuota: number;       // e.g. 80 hrs or $15,000
  currency: "USD" | "EUR" | "GBP";
  billingFrequency: "Monthly" | "Quarterly";
  startDate: string;              // YYYY-MM-DD
  endDate: string;                // YYYY-MM-DD
  rolloverAllowed: boolean;
  alertThresholdPercent: number;  // e.g. 80%
  status: "Active" | "Expired" | "Terminated";
  createdAt: Date;
  updatedAt: Date;
}`}
              </pre>
            </div>

            <div>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#2D3748", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ background: "#2B6CB0", color: "white", width: "20px", height: "20px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700 }}>2</span>
                Balance & Drawdown Calculation Rules:
              </h3>
              <div style={{ fontSize: "12.5px", color: "#4A5568", lineHeight: 1.7 }}>
                <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: "#2D3748" }}>Hour-based Retainers:</p>
                <code style={{ display: "block", background: "#EDF2F7", padding: "10px 12px", borderRadius: 4, margin: "4px 0 16px 0", fontSize: "11px", border: "1px solid #E2E8F0", color: "#2D3748", lineHeight: 1.5 }}>
                  Remaining Hours = Contracted Hours - Approved Billable Hours in Period
                </code>
                
                <p style={{ margin: "0 0 6px 0", fontWeight: 600, color: "#2D3748" }}>Amount-based Retainers:</p>
                <code style={{ display: "block", background: "#EDF2F7", padding: "10px 12px", borderRadius: 4, margin: "4px 0 16px 0", fontSize: "11px", border: "1px solid #E2E8F0", color: "#2D3748", lineHeight: 1.5 }}>
                  Remaining Balance = Contracted Amount - Invoiced Fees (or Estimated Approved Hours × Captured Rate)
                </code>
                
                <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.6 }}>
                  <strong style={{ color: "#2D3748" }}>Invoices & Payments Impact:</strong> Prepayment invoices establish the starting credit balance; delivery logs draw down the balance; and reconciliation invoices bill any overage hours at the agreed upon surplus rate.
                </p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </AppShell>
  );
}
