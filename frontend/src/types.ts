export type ReportingPeriod = "this-week" | "this-month" | "last-month" | "this-quarter" | "custom";

export type CurrencyCode = "USD" | "EUR" | "GBP";
export type ConsultantStatus = "On track" | "Watch" | "Over capacity";
export type EmploymentStatus = "Active" | "On leave" | "Inactive";
export type BillingClassification = "Billable" | "Non-billable";
export type TimeEntryStatus = "Draft" | "Submitted" | "Approved" | "Rejected";
export type RetainerType = "Hours" | "Amount";
export type AlertSeverity = "Info" | "Attention" | "Critical";
export type AlertStatus = "Open" | "In review" | "Resolved";

export interface Consultant {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  employmentStatus: EmploymentStatus;
  weeklyCapacityHours: number;
  billingRate: number;
  currency: "USD" | "EUR" | "GBP";
  startDate: string;
  assignedProjects: string[];
  createdAt: string;
  updatedAt: string;
  availableHours: number;
  billableHours: number;
  nonBillableHours?: number;
  utilization: number;
  revenue: number;
  status: ConsultantStatus;
  color: string;
}

export type ConsultantSortKey = "name" | "employeeCode" | "role" | "department" | "availableHours" | "utilization" | "billableHours" | "revenue";

export interface ConsultantFormValues {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  department: string;
  employmentStatus: EmploymentStatus;
  weeklyCapacityHours: string;
  billingRate: string;
  currency: "USD" | "EUR" | "GBP";
  startDate: string;
  assignedProjects: string;
}

export interface UtilizationPoint {
  label: string;
  utilization: number;
  target: number;
  billableHours: number;
}

export interface RevenuePoint {
  label: string;
  estimated: number;
  invoiced: number;
}

export interface Retainer {
  id: string;
  client: string;
  name: string;
  type: RetainerType;
  contracted: number;
  consumed: number;
  remaining: number;
  consumedPercent: number;
  expiry: string;
  severity: "Healthy" | "Attention" | "Critical";
}

export interface OperationalAlert {
  id: string;
  type: string;
  severity: AlertSeverity;
  related: string;
  description: string;
  time: string;
  status: AlertStatus;
  actionLabel: string;
}

export interface DashboardMetrics {
  activeConsultants: number;
  consultantDelta: number;
  averageUtilization: number;
  utilizationTarget: number;
  billableHours: number;
  billableHoursDelta: number;
  estimatedRevenue: number;
  revenueDelta: number;
  activeRetainers: number;
  retainersAtRisk: number;
}

export type UserRole = "admin" | "manager" | "finance" | "consultant" | "user";

export interface Client {
  id: string;
  clientCode?: string;
  name: string;
  status: "Active" | "Inactive";
  defaultCurrency: CurrencyCode;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  status: "Active" | "On hold" | "Closed";
  billingCurrency: CurrencyCode;
  startDate?: string | null;
  endDate?: string | null;
}

export interface TimeEntry {
  id: string;
  consultantId: string;
  clientId: string;
  projectId: string;
  workDate: string;
  description: string;
  hours: number;
  billingClassification: BillingClassification;
  status: TimeEntryStatus;
  billingRateSnapshot: number | null;
  currency: CurrencyCode | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
}

export interface TimeEntryFormValues {
  consultantId: string;
  clientId: string;
  projectId: string;
  workDate: string;
  description: string;
  hours: string;
  billingClassification: BillingClassification;
  billingRate: string;
  currency: CurrencyCode;
}

export type TimeEntrySortKey = "workDate" | "consultant" | "client" | "project" | "hours" | "billingClassification" | "status" | "estimatedRevenue";

export interface TimeEntryDateRange {
  from: string;
  to: string;
}
