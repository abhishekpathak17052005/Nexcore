import type { Client, Consultant, DashboardMetrics, OperationalAlert, Project, RevenuePoint, Retainer, TimeEntry, UtilizationPoint } from "@/types";

export const developmentDataNotice = "Development sample data · Not connected to production records";

export const dashboardMetrics: DashboardMetrics = {
  activeConsultants: 48,
  consultantDelta: 6.4,
  averageUtilization: 78.4,
  utilizationTarget: 75,
  billableHours: 1286,
  billableHoursDelta: 8.7,
  estimatedRevenue: 284600,
  revenueDelta: 12.2,
  activeRetainers: 14,
  retainersAtRisk: 3,
};

type ConsultantSeed = Pick<Consultant, "id" | "employeeCode" | "firstName" | "lastName" | "email" | "role" | "department" | "employmentStatus" | "weeklyCapacityHours" | "billingRate" | "currency" | "startDate" | "assignedProjects" | "createdAt" | "updatedAt" | "billableHours" | "status" | "color"> & Partial<Pick<Consultant, "availableHours" | "revenue" | "nonBillableHours">>;

function createConsultant(seed: ConsultantSeed): Consultant {
  const name = `${seed.firstName} ${seed.lastName}`;
  const availableHours = seed.availableHours ?? seed.weeklyCapacityHours * 4;
  const utilization = availableHours > 0 ? Math.round((seed.billableHours / availableHours) * 1000) / 10 : 0;
  return {
    ...seed,
    name,
    initials: `${seed.firstName[0]}${seed.lastName[0]}`,
    availableHours,
    utilization,
    revenue: seed.revenue ?? seed.billableHours * seed.billingRate,
  };
}

export const consultants: Consultant[] = [
  createConsultant({ id: "c-101", employeeCode: "NS-0101", firstName: "Maya", lastName: "Chen", email: "maya.chen@example.test", role: "Principal Consultant", department: "Strategy", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 360, currency: "USD", startDate: "2023-04-17", assignedProjects: ["Northwind Health transformation", "Aster Labs growth office"], createdAt: "2026-01-05", updatedAt: "2026-04-22", availableHours: 160, billableHours: 145, revenue: 52200, status: "On track", color: "#0F9D91" }),
  createConsultant({ id: "c-102", employeeCode: "NS-0102", firstName: "Jon", lastName: "Bell", email: "jon.bell@example.test", role: "Senior Consultant", department: "Technology", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 300, currency: "USD", startDate: "2022-09-12", assignedProjects: ["Meridian Works platform review"], createdAt: "2026-01-05", updatedAt: "2026-04-22", availableHours: 160, billableHours: 136, revenue: 40800, status: "On track", color: "#2D6CDF" }),
  createConsultant({ id: "c-103", employeeCode: "NS-0103", firstName: "Elena", lastName: "Rossi", email: "elena.rossi@example.test", role: "Engagement Lead", department: "Operations", employmentStatus: "Active", weeklyCapacityHours: 38, billingRate: 305, currency: "USD", startDate: "2024-01-08", assignedProjects: ["Lumen Retail operating model"], createdAt: "2026-01-05", updatedAt: "2026-04-22", availableHours: 152, billableHours: 117, revenue: 35700, status: "On track", color: "#D99518" }),
  createConsultant({ id: "c-104", employeeCode: "NS-0104", firstName: "Tobias", lastName: "Reed", email: "tobias.reed@example.test", role: "Consultant", department: "Strategy", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 250, currency: "USD", startDate: "2025-02-03", assignedProjects: ["Aster Labs growth office"], createdAt: "2026-01-05", updatedAt: "2026-04-22", availableHours: 160, billableHours: 101, revenue: 25250, status: "Watch", color: "#8A63D2" }),
  createConsultant({ id: "c-105", employeeCode: "NS-0105", firstName: "Priya", lastName: "Nair", email: "priya.nair@example.test", role: "Senior Consultant", department: "Data & AI", employmentStatus: "Active", weeklyCapacityHours: 36, billingRate: 350, currency: "USD", startDate: "2023-11-06", assignedProjects: ["Northwind Health transformation", "Meridian Works platform review"], createdAt: "2026-01-05", updatedAt: "2026-04-22", availableHours: 144, billableHours: 132, revenue: 46200, status: "Over capacity", color: "#D64545" }),
  createConsultant({ id: "c-106", employeeCode: "NS-0106", firstName: "Lucas", lastName: "Martin", email: "lucas.martin@example.test", role: "Consultant", department: "Technology", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 250, currency: "USD", startDate: "2025-07-14", assignedProjects: ["Meridian Works platform review"], createdAt: "2026-01-05", updatedAt: "2026-04-22", availableHours: 160, billableHours: 118, revenue: 29500, status: "Watch", color: "#16865B" }),
  createConsultant({ id: "c-107", employeeCode: "NS-0107", firstName: "Sofia", lastName: "Grant", email: "sofia.grant@example.test", role: "Principal Consultant", department: "Operations", employmentStatus: "Active", weeklyCapacityHours: 38, billingRate: 310, currency: "USD", startDate: "2022-05-23", assignedProjects: ["Lumen Retail operating model", "Northwind Health transformation"], createdAt: "2026-01-05", updatedAt: "2026-04-22", availableHours: 152, billableHours: 128, revenue: 39700, status: "On track", color: "#C25B91" }),
  createConsultant({ id: "c-108", employeeCode: "NS-0108", firstName: "Owen", lastName: "Wright", email: "owen.wright@example.test", role: "Consultant", department: "Data & AI", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 240, currency: "USD", startDate: "2025-10-20", assignedProjects: [], createdAt: "2026-01-05", updatedAt: "2026-04-22", availableHours: 160, billableHours: 92, revenue: 22100, status: "Watch", color: "#557086" }),
];

export const utilizationSeries: UtilizationPoint[] = [
  { label: "Mar 04", utilization: 72, target: 75, billableHours: 1080 },
  { label: "Mar 11", utilization: 76, target: 75, billableHours: 1150 },
  { label: "Mar 18", utilization: 74, target: 75, billableHours: 1115 },
  { label: "Mar 25", utilization: 79, target: 75, billableHours: 1210 },
  { label: "Apr 01", utilization: 77, target: 75, billableHours: 1198 },
  { label: "Apr 08", utilization: 82, target: 75, billableHours: 1264 },
  { label: "Apr 15", utilization: 78, target: 75, billableHours: 1240 },
  { label: "Apr 22", utilization: 81, target: 75, billableHours: 1286 },
];

export const revenueSeries: RevenuePoint[] = [
  { label: "Mar 04", estimated: 18200, invoiced: 17600 },
  { label: "Mar 11", estimated: 19600, invoiced: 18800 },
  { label: "Mar 18", estimated: 21400, invoiced: 20500 },
  { label: "Mar 25", estimated: 22800, invoiced: 21900 },
  { label: "Apr 01", estimated: 23800, invoiced: 22600 },
  { label: "Apr 08", estimated: 25200, invoiced: 24100 },
  { label: "Apr 15", estimated: 26800, invoiced: 25300 },
  { label: "Apr 22", estimated: 28460, invoiced: 26900 },
];

export const retainers: Retainer[] = [
  { id: "r-201", client: "Northwind Health", name: "Advisory hours · Q2", type: "Hours", contracted: 320, consumed: 291, remaining: 29, consumedPercent: 90.9, expiry: "May 31, 2026", severity: "Critical" },
  { id: "r-202", client: "Aster Labs", name: "Growth partner retainer", type: "Amount", contracted: 48000, consumed: 38200, remaining: 9800, consumedPercent: 79.6, expiry: "Jun 15, 2026", severity: "Attention" },
  { id: "r-203", client: "Meridian Works", name: "Transformation office", type: "Hours", contracted: 240, consumed: 179, remaining: 61, consumedPercent: 74.6, expiry: "Jun 30, 2026", severity: "Attention" },
  { id: "r-204", client: "Lumen Retail", name: "Strategy support", type: "Amount", contracted: 36000, consumed: 17200, remaining: 18800, consumedPercent: 47.8, expiry: "Jul 31, 2026", severity: "Healthy" },
];

export const alerts: OperationalAlert[] = [
  { id: "a-301", type: "Retainer threshold", severity: "Critical", related: "Northwind Health", description: "29 hours remain on Advisory hours · Q2.", time: "12 min ago", status: "Open", actionLabel: "Review retainer" },
  { id: "a-302", type: "Utilization below target", severity: "Attention", related: "Tobias Reed", description: "63.1% utilization is 11.9 pts below the configured target.", time: "38 min ago", status: "In review", actionLabel: "View consultant" },
  { id: "a-303", type: "Timesheet approval", severity: "Info", related: "Week ending Apr 22", description: "18 time entries are waiting for manager approval.", time: "2 hr ago", status: "Open", actionLabel: "Open time tracking" },
  { id: "a-304", type: "Capacity check", severity: "Attention", related: "Priya Nair", description: "Billable plan is 8 hours above available capacity.", time: "Yesterday", status: "Open", actionLabel: "View consultant" },
];


export const clients: Client[] = [
  { id: "cl-201", name: "Northwind Health", status: "Active", defaultCurrency: "USD" },
  { id: "cl-202", name: "Aster Labs", status: "Active", defaultCurrency: "USD" },
  { id: "cl-203", name: "Meridian Works", status: "Active", defaultCurrency: "USD" },
  { id: "cl-204", name: "Lumen Retail", status: "Active", defaultCurrency: "USD" },
];

export const projects: Project[] = [
  { id: "pr-301", clientId: "cl-201", name: "Transformation program", status: "Active", billingCurrency: "USD" },
  { id: "pr-302", clientId: "cl-202", name: "Growth office", status: "Active", billingCurrency: "USD" },
  { id: "pr-303", clientId: "cl-203", name: "Platform review", status: "Active", billingCurrency: "USD" },
  { id: "pr-304", clientId: "cl-204", name: "Operating model", status: "On hold", billingCurrency: "USD" },
];

export const timeEntries: TimeEntry[] = [
  { id: "te-401", consultantId: "c-101", clientId: "cl-201", projectId: "pr-301", workDate: "2026-04-01", description: "Executive alignment and workstream planning", hours: 8, billingClassification: "Billable", status: "Approved", billingRateSnapshot: 360, currency: "USD", createdAt: "2026-04-01", updatedAt: "2026-04-02", submittedAt: "2026-04-01", reviewedAt: "2026-04-02", reviewedBy: "Development reviewer" },
  { id: "te-402", consultantId: "c-101", clientId: "cl-202", projectId: "pr-302", workDate: "2026-04-08", description: "Growth operating model review", hours: 6, billingClassification: "Billable", status: "Submitted", billingRateSnapshot: 360, currency: "USD", createdAt: "2026-04-08", updatedAt: "2026-04-08", submittedAt: "2026-04-08" },
  { id: "te-403", consultantId: "c-102", clientId: "cl-203", projectId: "pr-303", workDate: "2026-04-02", description: "Platform architecture assessment", hours: 7.5, billingClassification: "Billable", status: "Approved", billingRateSnapshot: 300, currency: "USD", createdAt: "2026-04-02", updatedAt: "2026-04-03", submittedAt: "2026-04-02", reviewedAt: "2026-04-03", reviewedBy: "Development reviewer" },
  { id: "te-404", consultantId: "c-102", clientId: "cl-203", projectId: "pr-303", workDate: "2026-04-14", description: "Technology risk workshop", hours: 4, billingClassification: "Billable", status: "Draft", billingRateSnapshot: 300, currency: "USD", createdAt: "2026-04-14", updatedAt: "2026-04-14" },
  { id: "te-405", consultantId: "c-103", clientId: "cl-204", projectId: "pr-304", workDate: "2026-04-03", description: "Operating model design session", hours: 6, billingClassification: "Billable", status: "Approved", billingRateSnapshot: 305, currency: "USD", createdAt: "2026-04-03", updatedAt: "2026-04-04", submittedAt: "2026-04-03", reviewedAt: "2026-04-04", reviewedBy: "Development reviewer" },
  { id: "te-406", consultantId: "c-104", clientId: "cl-202", projectId: "pr-302", workDate: "2026-04-07", description: "Customer research synthesis", hours: 5.5, billingClassification: "Billable", status: "Submitted", billingRateSnapshot: 250, currency: "USD", createdAt: "2026-04-07", updatedAt: "2026-04-07", submittedAt: "2026-04-07" },
  { id: "te-407", consultantId: "c-104", clientId: "cl-202", projectId: "pr-302", workDate: "2026-04-09", description: "Internal delivery enablement", hours: 2, billingClassification: "Non-billable", status: "Approved", billingRateSnapshot: null, currency: null, createdAt: "2026-04-09", updatedAt: "2026-04-10", submittedAt: "2026-04-09", reviewedAt: "2026-04-10", reviewedBy: "Development reviewer" },
  { id: "te-408", consultantId: "c-105", clientId: "cl-201", projectId: "pr-301", workDate: "2026-04-10", description: "Data product discovery", hours: 8, billingClassification: "Billable", status: "Approved", billingRateSnapshot: 350, currency: "USD", createdAt: "2026-04-10", updatedAt: "2026-04-11", submittedAt: "2026-04-10", reviewedAt: "2026-04-11", reviewedBy: "Development reviewer" },
  { id: "te-409", consultantId: "c-105", clientId: "cl-201", projectId: "pr-301", workDate: "2026-04-17", description: "Analytics backlog prioritization", hours: 7, billingClassification: "Billable", status: "Submitted", billingRateSnapshot: 350, currency: "USD", createdAt: "2026-04-17", updatedAt: "2026-04-17", submittedAt: "2026-04-17" },
  { id: "te-410", consultantId: "c-106", clientId: "cl-203", projectId: "pr-303", workDate: "2026-04-13", description: "Integration test planning", hours: 6, billingClassification: "Billable", status: "Approved", billingRateSnapshot: 250, currency: "USD", createdAt: "2026-04-13", updatedAt: "2026-04-14", submittedAt: "2026-04-13", reviewedAt: "2026-04-14", reviewedBy: "Development reviewer" },
  { id: "te-411", consultantId: "c-107", clientId: "cl-204", projectId: "pr-304", workDate: "2026-04-15", description: "Operating model recommendation", hours: 7.5, billingClassification: "Billable", status: "Approved", billingRateSnapshot: 310, currency: "USD", createdAt: "2026-04-15", updatedAt: "2026-04-16", submittedAt: "2026-04-15", reviewedAt: "2026-04-16", reviewedBy: "Development reviewer" },
  { id: "te-412", consultantId: "c-108", clientId: "cl-201", projectId: "pr-301", workDate: "2026-04-16", description: "Data quality assessment", hours: 5, billingClassification: "Billable", status: "Rejected", billingRateSnapshot: 240, currency: "USD", createdAt: "2026-04-16", updatedAt: "2026-04-17", submittedAt: "2026-04-16", reviewedAt: "2026-04-17", reviewedBy: "Development reviewer", rejectionReason: "Please add the affected data sources to the description." },
  { id: "te-413", consultantId: "c-108", clientId: "cl-201", projectId: "pr-301", workDate: "2026-04-21", description: "Data quality assessment follow-up", hours: 5, billingClassification: "Billable", status: "Draft", billingRateSnapshot: 240, currency: "USD", createdAt: "2026-04-21", updatedAt: "2026-04-21" },
];
