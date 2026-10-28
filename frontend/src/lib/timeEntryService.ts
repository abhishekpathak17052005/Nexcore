import { clients as developmentClients, projects as developmentProjects, timeEntries as developmentTimeEntries } from "@/data/mockData";
import { availableWorkingHours, calculateConsultantUtilization, calculateEstimatedBillableRevenue, periodDateRange } from "@/lib/calculations";
import type { BillingClassification, Client, Consultant, CurrencyCode, Project, ReportingPeriod, TimeEntry, TimeEntryDateRange, TimeEntryFormValues, TimeEntryStatus } from "@/types";

export const MAX_HOURS_PER_ENTRY = 24;
export const DEVELOPMENT_REVIEWER = "Development reviewer";

export interface TimeEntryDataSource {
  list(): TimeEntry[];
  create(values: TimeEntryFormValues, consultants: Consultant[], clients: Client[], projects: Project[]): TimeEntry;
  update(id: string, values: TimeEntryFormValues, current: TimeEntry, consultants: Consultant[], clients: Client[], projects: Project[]): TimeEntry | null;
  transition(entry: TimeEntry, nextStatus: TimeEntryStatus, rejectionReason?: string): { entry?: TimeEntry; error?: string };
}

export interface TimeEntryValidationErrors {
  consultantId?: string;
  clientId?: string;
  projectId?: string;
  workDate?: string;
  description?: string;
  hours?: string;
  billingRate?: string;
  currency?: string;
  duplicate?: string;
}

export const approvalTransitions: Record<TimeEntryStatus, TimeEntryStatus[]> = {
  Draft: ["Submitted"],
  Submitted: ["Approved", "Rejected"],
  Approved: [],
  Rejected: ["Draft"],
};

function now() {
  return new Date().toISOString();
}

function makeId() {
  return `te-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function entrySignature(values: Pick<TimeEntryFormValues, "consultantId" | "clientId" | "projectId" | "workDate" | "description" | "hours" | "billingClassification">) {
  return [values.consultantId, values.clientId, values.projectId, values.workDate, values.description.trim().toLowerCase(), Number(values.hours).toFixed(2), values.billingClassification].join("|");
}

function recordSignature(entry: TimeEntry) {
  return entrySignature({ ...entry, hours: String(entry.hours) });
}

export function validateTimeEntryForm(values: TimeEntryFormValues, consultants: Consultant[], clients: Client[], projects: Project[], existing: TimeEntry[], editingId?: string, maxHours = MAX_HOURS_PER_ENTRY): TimeEntryValidationErrors {
  const errors: TimeEntryValidationErrors = {};
  const consultant = consultants.find((record) => record.id === values.consultantId);
  const client = clients.find((record) => record.id === values.clientId);
  const project = projects.find((record) => record.id === values.projectId);
  const hours = Number(values.hours);
  const rate = Number(values.billingRate);
  if (!consultant) errors.consultantId = "Choose a valid consultant.";
  if (!client) errors.clientId = "Choose a valid client.";
  if (!project) errors.projectId = "Choose a valid project.";
  else if (project.clientId !== values.clientId) errors.projectId = "Project must belong to the selected client.";
  if (!validDate(values.workDate)) errors.workDate = "Enter a valid work date.";
  if (!values.description.trim()) errors.description = "A task description is required.";
  if (!Number.isFinite(hours) || hours <= 0) errors.hours = "Hours must be greater than zero.";
  else if (hours > maxHours) errors.hours = `Hours cannot exceed the configured ${maxHours}-hour entry maximum.`;
  if (values.billingClassification === "Billable") {
    if (!Number.isFinite(rate) || rate < 0 || values.billingRate.trim() === "") errors.billingRate = "Enter a non-negative billing rate for billable work.";
    if (!project || values.currency !== project.billingCurrency) errors.currency = "Currency must match the project's billing currency.";
  }
  if (values.billingClassification === "Non-billable" && values.billingRate.trim() && (!Number.isFinite(rate) || rate < 0)) errors.billingRate = "Billing rate must be empty or non-negative.";
  const signature = entrySignature(values);
  if (existing.some((entry) => entry.id !== editingId && recordSignature(entry) === signature)) errors.duplicate = "An identical time entry already exists.";
  return errors;
}

export function timeEntryFormValues(entry?: TimeEntry, consultants: Consultant[] = [], projects: Project[] = []): TimeEntryFormValues {
  const project = projects.find((record) => record.id === entry?.projectId);
  const consultant = consultants.find((record) => record.id === entry?.consultantId);
  return {
    consultantId: entry?.consultantId ?? consultant?.id ?? "",
    clientId: entry?.clientId ?? project?.clientId ?? "",
    projectId: entry?.projectId ?? "",
    workDate: entry?.workDate ?? new Date().toISOString().slice(0, 10),
    description: entry?.description ?? "",
    hours: entry ? String(entry.hours) : "",
    billingClassification: entry?.billingClassification ?? "Billable",
    billingRate: entry?.billingRateSnapshot == null ? consultant ? String(consultant.billingRate) : "" : String(entry.billingRateSnapshot),
    currency: entry?.currency ?? project?.billingCurrency ?? consultant?.currency ?? "USD",
  };
}

export function createTimeEntry(values: TimeEntryFormValues, consultants: Consultant[], clients: Client[], projects: Project[]): TimeEntry {
  const consultant = consultants.find((record) => record.id === values.consultantId);
  const timestamp = now();
  return {
    id: makeId(),
    consultantId: values.consultantId,
    clientId: values.clientId,
    projectId: values.projectId,
    workDate: values.workDate,
    description: values.description.trim(),
    hours: Number(values.hours),
    billingClassification: values.billingClassification,
    status: "Draft",
    billingRateSnapshot: values.billingClassification === "Billable" ? Number(values.billingRate) : null,
    currency: values.billingClassification === "Billable" ? values.currency : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
  };
}

export function updateTimeEntry(values: TimeEntryFormValues, current: TimeEntry, consultants: Consultant[], clients: Client[], projects: Project[]): TimeEntry {
  const updated = createTimeEntry(values, consultants, clients, projects);
  return { ...updated, id: current.id, status: current.status, createdAt: current.createdAt, submittedAt: current.submittedAt, reviewedAt: current.reviewedAt, reviewedBy: current.reviewedBy, rejectionReason: current.rejectionReason };
}

export const developmentTimeEntryDataSource: TimeEntryDataSource = {
  list: () => developmentTimeEntries,
  create: (values, consultants, clients, projects) => createTimeEntry(values, consultants, clients, projects),
  update: (_id, values, current, consultants, clients, projects) => updateTimeEntry(values, current, consultants, clients, projects),
  transition: (entry, nextStatus, rejectionReason) => transitionTimeEntry(entry, nextStatus, rejectionReason),
};

export function transitionTimeEntry(entry: TimeEntry, nextStatus: TimeEntryStatus, rejectionReason = "") {
  if (!approvalTransitions[entry.status].includes(nextStatus)) return { error: `Cannot move an entry from ${entry.status} to ${nextStatus}.` };
  if (nextStatus === "Rejected" && !rejectionReason.trim()) return { error: "A rejection reason is required." };
  const timestamp = now();
  const updated: TimeEntry = { ...entry, status: nextStatus, updatedAt: timestamp, rejectionReason: nextStatus === "Rejected" ? rejectionReason.trim() : nextStatus === "Draft" ? null : entry.rejectionReason };
  if (nextStatus === "Submitted") updated.submittedAt = timestamp;
  if (nextStatus === "Approved" || nextStatus === "Rejected") { updated.reviewedAt = timestamp; updated.reviewedBy = DEVELOPMENT_REVIEWER; }
  if (nextStatus === "Draft") { updated.submittedAt = null; updated.reviewedAt = null; updated.reviewedBy = null; }
  return { entry: updated };
}

export function eligibleForOperationalMetrics(entry: TimeEntry) {
  return entry.status === "Submitted" || entry.status === "Approved";
}

export function estimatedRevenueForEntry(entry: TimeEntry) {
  if (!eligibleForOperationalMetrics(entry) || entry.billingClassification !== "Billable" || entry.billingRateSnapshot == null || entry.currency == null) return null;
  return calculateEstimatedBillableRevenue(entry.hours, entry.billingRateSnapshot);
}

export function timeEntryMetrics(entries: TimeEntry[]) {
  const eligible = entries.filter(eligibleForOperationalMetrics);
  const billableHours = eligible.filter((entry) => entry.billingClassification === "Billable").reduce((total, entry) => total + entry.hours, 0);
  const nonBillableHours = eligible.filter((entry) => entry.billingClassification === "Non-billable").reduce((total, entry) => total + entry.hours, 0);
  const estimatedRevenueByCurrency = eligible.reduce<Partial<Record<CurrencyCode, number>>>((totals, entry) => {
    const revenue = estimatedRevenueForEntry(entry);
    if (revenue == null || entry.currency == null) return totals;
    totals[entry.currency] = Math.round(((totals[entry.currency] ?? 0) + revenue) * 100) / 100;
    return totals;
  }, {});
  return { billableHours, nonBillableHours, estimatedRevenueByCurrency, pendingApproval: entries.filter((entry) => entry.status === "Submitted").length };
}

export function deriveConsultantsFromTimeEntries(
  consultants: Consultant[],
  entries: TimeEntry[],
  period?: ReportingPeriod,
  dateRange?: TimeEntryDateRange
) {
  const range = dateRange ?? (period ? periodDateRange(period) : undefined);
  return consultants.map((consultant) => {
    const related = entries.filter((entry) => {
      if (entry.consultantId !== consultant.id || !eligibleForOperationalMetrics(entry)) return false;
      if (range?.from && entry.workDate < range.from) return false;
      if (range?.to && entry.workDate > range.to) return false;
      return true;
    });
    const billableHours = related.filter((entry) => entry.billingClassification === "Billable").reduce((total, entry) => total + entry.hours, 0);
    const nonBillableHours = related.filter((entry) => entry.billingClassification === "Non-billable").reduce((total, entry) => total + entry.hours, 0);
    const availableHours = availableWorkingHours(consultant, period, range);
    const utilization = calculateConsultantUtilization(billableHours, availableHours) ?? 0;
    const revenue = related.filter((entry) => entry.billingClassification === "Billable" && entry.currency === consultant.currency).reduce((total, entry) => total + (estimatedRevenueForEntry(entry) ?? 0), 0);
    return {
      ...consultant,
      availableHours,
      billableHours,
      nonBillableHours,
      utilization,
      revenue,
      status: utilization > 90 ? ("Over capacity" as const) : utilization < 75 ? ("Watch" as const) : ("On track" as const),
    };
  });
}

export function filterTimeEntries(entries: TimeEntry[], query: string, filters: { consultantId: string; clientId: string; projectId: string; billingClassification: string; status: string; dateRange: TimeEntryDateRange }, consultants: Consultant[], clients: Client[], projects: Project[]) {
  const normalized = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const consultant = consultants.find((record) => record.id === entry.consultantId);
    const client = clients.find((record) => record.id === entry.clientId);
    const project = projects.find((record) => record.id === entry.projectId);
    const searchable = [consultant?.name, client?.name, project?.name, entry.description].filter(Boolean).join(" ").toLowerCase();
    return (!normalized || searchable.includes(normalized)) && (!filters.consultantId || entry.consultantId === filters.consultantId) && (!filters.clientId || entry.clientId === filters.clientId) && (!filters.projectId || entry.projectId === filters.projectId) && (!filters.billingClassification || entry.billingClassification === filters.billingClassification) && (!filters.status || entry.status === filters.status) && (!filters.dateRange.from || entry.workDate >= filters.dateRange.from) && (!filters.dateRange.to || entry.workDate <= filters.dateRange.to);
  });
}

export function sortTimeEntries(entries: TimeEntry[], key: string, direction: "asc" | "desc", consultants: Consultant[], clients: Client[], projects: Project[]) {
  return [...entries].sort((a, b) => {
    const projectA = projects.find((project) => project.id === a.projectId);
    const projectB = projects.find((project) => project.id === b.projectId);
    const clientA = clients.find((client) => client.id === a.clientId);
    const clientB = clients.find((client) => client.id === b.clientId);
    const consultantA = consultants.find((consultant) => consultant.id === a.consultantId);
    const consultantB = consultants.find((consultant) => consultant.id === b.consultantId);
    const values: Record<string, string | number> = { workDate: a.workDate, consultant: consultantA?.name ?? "", client: clientA?.name ?? "", project: projectA?.name ?? "", hours: a.hours, billingClassification: a.billingClassification, status: a.status, estimatedRevenue: estimatedRevenueForEntry(a) ?? 0 };
    const other: Record<string, string | number> = { workDate: b.workDate, consultant: consultantB?.name ?? "", client: clientB?.name ?? "", project: projectB?.name ?? "", hours: b.hours, billingClassification: b.billingClassification, status: b.status, estimatedRevenue: estimatedRevenueForEntry(b) ?? 0 };
    const first = values[key] ?? "";
    const second = other[key] ?? "";
    const result = typeof first === "string" ? first.localeCompare(String(second)) : Number(first) - Number(second);
    return direction === "asc" ? result : -result;
  });
}

export { periodDateRange } from "@/lib/calculations";
