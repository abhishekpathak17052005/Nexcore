import { alerts, consultants as developmentConsultants, dashboardMetrics, developmentDataNotice, revenueSeries, retainers, utilizationSeries } from "@/data/mockData";
import { availableWorkingHours, calculateConsultantUtilization, calculateEstimatedBillableRevenue } from "@/lib/calculations";
import type { Consultant, ConsultantFormValues, DashboardMetrics } from "@/types";

export interface ConsultantDataSource {
  list(): Consultant[];
  create(values: ConsultantFormValues): Consultant;
  update(id: string, values: ConsultantFormValues, currentRecord?: Consultant): Consultant | null;
}

function timestamp() {
  return new Date().toISOString().slice(0, 10);
}

function makeId() {
  return `c-${Date.now().toString(36)}`;
}

function toConsultant(values: ConsultantFormValues, existing?: Consultant): Consultant {
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const weeklyCapacityHours = Number(values.weeklyCapacityHours);
  const billingRate = Number(values.billingRate);
  const availableHours = existing?.availableHours ?? weeklyCapacityHours * 4;
  const billableHours = existing?.billableHours ?? 0;
  const utilization = calculateConsultantUtilization(billableHours, availableHours) ?? 0;
  return {
    id: existing?.id ?? makeId(),
    employeeCode: values.employeeCode.trim(),
    firstName,
    lastName,
    email: values.email.trim(),
    name: `${firstName} ${lastName}`,
    initials: `${firstName[0] ?? "?"}${lastName[0] ?? "?"}`.toUpperCase(),
    role: values.role.trim(),
    department: values.department.trim(),
    employmentStatus: values.employmentStatus,
    weeklyCapacityHours,
    billingRate,
    currency: values.currency,
    startDate: values.startDate,
    assignedProjects: values.assignedProjects.split(",").map((project) => project.trim()).filter(Boolean),
    createdAt: existing?.createdAt ?? timestamp(),
    updatedAt: timestamp(),
    availableHours,
    billableHours,
    nonBillableHours: existing?.nonBillableHours,
    utilization,
    revenue: calculateEstimatedBillableRevenue(billableHours, billingRate) ?? 0,
    status: utilization > 90 ? "Over capacity" : utilization < 75 ? "Watch" : "On track",
    color: existing?.color ?? "#0F9D91",
  };
}

/** Local development adapter. Records live in React state; this is intentionally not a persistence claim. */
export const developmentConsultantDataSource: ConsultantDataSource = {
  list: () => developmentConsultants,
  create: (values) => toConsultant(values),
  update: (id, values, currentRecord) => {
    const existing = currentRecord ?? developmentConsultants.find((record) => record.id === id);
    return existing ? toConsultant(values, existing) : null;
  },
};

export function consultantFormValues(record?: Consultant): ConsultantFormValues {
  return {
    employeeCode: record?.employeeCode ?? "",
    firstName: record?.firstName ?? "",
    lastName: record?.lastName ?? "",
    email: record?.email ?? "",
    role: record?.role ?? "",
    department: record?.department ?? "",
    employmentStatus: record?.employmentStatus ?? "Active",
    weeklyCapacityHours: record ? String(record.weeklyCapacityHours) : "40",
    billingRate: record ? String(record.billingRate) : "250",
    currency: record?.currency ?? "USD",
    startDate: record?.startDate ?? "",
    assignedProjects: record?.assignedProjects.join(", ") ?? "",
  };
}

export function deriveDashboardMetrics(records: Consultant[]): DashboardMetrics {
  const active = records.filter((record) => record.employmentStatus === "Active");
  const totalAvailable = active.reduce((sum, record) => sum + availableWorkingHours(record), 0);
  const totalBillable = active.reduce((sum, record) => sum + record.billableHours, 0);
  const averageUtilization = totalAvailable > 0 ? Math.round((totalBillable / totalAvailable) * 1000) / 10 : 0;
  const estimatedRevenue = active.reduce((sum, record) => sum + (calculateEstimatedBillableRevenue(record.billableHours, record.billingRate) ?? 0), 0);
  return {
    ...dashboardMetrics,
    activeConsultants: active.length,
    averageUtilization,
    billableHours: totalBillable,
    estimatedRevenue,
  };
}

export async function getDashboardSnapshot(consultantRecords: Consultant[] = developmentConsultants) {
  return Promise.resolve({
    metrics: deriveDashboardMetrics(consultantRecords),
    consultants: consultantRecords,
    utilizationSeries,
    revenueSeries,
    retainers,
    alerts,
    notice: developmentDataNotice,
  });
}
