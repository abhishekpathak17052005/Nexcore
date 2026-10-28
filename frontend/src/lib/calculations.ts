import type { Consultant, ConsultantFormValues, ConsultantSortKey, CurrencyCode, ReportingPeriod } from "@/types";

export type { ConsultantSortKey } from "@/types";

export function formatCurrency(value: number, compact = false, currency: CurrencyCode = "USD") {
  if (compact && value >= 1000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatRetainerValue(value: number, type: "Hours" | "Amount") {
  return type === "Hours" ? `${formatNumber(value)} hrs` : formatCurrency(value, true);
}

export function utilizationFormula(billableHours: number, availableHours: number) {
  return availableHours > 0 ? Math.round((billableHours / availableHours) * 1000) / 10 : null;
}

/**
 * Computes deterministic ISO date range (YYYY-MM-DD) for standard reporting periods.
 * Supports reference date injection for reproducible auditing and deterministic testing.
 */
export function periodDateRange(
  period: ReportingPeriod,
  referenceDate: Date | string = new Date()
): { from: string; to: string } {
  const ref = typeof referenceDate === "string" ? new Date(`${referenceDate}T12:00:00Z`) : new Date(referenceDate);
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const day = ref.getUTCDate();

  const formatDate = (y: number, m: number, d: number) =>
    `${y.toString().padStart(4, "0")}-${(m + 1).toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;

  switch (period) {
    case "this-week": {
      const dayOfWeek = ref.getUTCDay();
      const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      const monday = new Date(Date.UTC(year, month, day - (isoDay - 1)));
      const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
      return {
        from: formatDate(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
        to: formatDate(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate()),
      };
    }
    case "this-month": {
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return {
        from: formatDate(year, month, 1),
        to: formatDate(year, month, lastDay),
      };
    }
    case "last-month": {
      const prevMonthLastDate = new Date(Date.UTC(year, month, 0));
      const prevYear = prevMonthLastDate.getUTCFullYear();
      const prevMonth = prevMonthLastDate.getUTCMonth();
      const prevLastDay = prevMonthLastDate.getUTCDate();
      return {
        from: formatDate(prevYear, prevMonth, 1),
        to: formatDate(prevYear, prevMonth, prevLastDay),
      };
    }
    case "this-quarter": {
      const quarterIndex = Math.floor(month / 3);
      const qStartMonth = quarterIndex * 3;
      const qEndMonth = qStartMonth + 2;
      const qLastDay = new Date(Date.UTC(year, qEndMonth + 1, 0)).getUTCDate();
      return {
        from: formatDate(year, qStartMonth, 1),
        to: formatDate(year, qEndMonth, qLastDay),
      };
    }
    case "custom":
    default: {
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return {
        from: formatDate(year, month, 1),
        to: formatDate(year, month, lastDay),
      };
    }
  }
}

/**
 * Calculates the number of working business days (Monday to Friday inclusive)
 * between two ISO date strings (YYYY-MM-DD). Both start and end dates are inclusive.
 * 
 * Note on Holidays & Leave:
 * Public holidays and individual approved leaves are not currently modeled in the database schema.
 * Capacity assumes all Monday-to-Friday weekdays are standard working days. Consultants on "On leave"
 * status have their status visually surfaced on dashboards and utilization reports.
 */
export function countBusinessDays(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getUTCDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return count;
}

/**
 * Standard business periods map to expected business days.
 * When dateRange is supplied, exact business days are counted.
 * Note: Individual leave bookings and public holidays are not currently tracked in the database schema.
 */
export function calculatePeriodCapacity(
  weeklyCapacityHours: number,
  period?: ReportingPeriod,
  dateRange?: { from?: string; to?: string }
): number {
  if (!Number.isFinite(weeklyCapacityHours) || weeklyCapacityHours <= 0) return 0;
  const dailyCapacity = weeklyCapacityHours / 5;

  if (dateRange?.from && dateRange?.to) {
    const businessDays = countBusinessDays(dateRange.from, dateRange.to);
    return Math.round(dailyCapacity * businessDays * 10) / 10;
  }

  if (period) {
    switch (period) {
      case "this-week":
        return weeklyCapacityHours * 1; // 1 week (5 business days)
      case "this-month":
      case "last-month":
        return Math.round(dailyCapacity * 22 * 10) / 10; // Standard 22 business days
      case "this-quarter":
        return weeklyCapacityHours * 13; // 13 standard weeks (65 business days)
      default:
        return weeklyCapacityHours * 4;
    }
  }

  // Baseline 4-week nominal capacity
  return weeklyCapacityHours * 4;
}

/**
 * Returns available capacity in hours for a consultant adjusted for the reporting period or date range.
 * Limitation: Public holidays and individual approved leaves are not currently modeled in the schema.
 */
export function availableWorkingHours(
  consultant: Pick<Consultant, "weeklyCapacityHours"> & { availableHours?: number },
  period?: ReportingPeriod,
  dateRange?: { from?: string; to?: string }
): number {
  if (period || dateRange) {
    return calculatePeriodCapacity(consultant.weeklyCapacityHours, period, dateRange);
  }
  return Number.isFinite(consultant.availableHours) ? (consultant.availableHours as number) : consultant.weeklyCapacityHours * 4;
}

export function calculateConsultantUtilization(billableHours: number, availableHours: number) {
  return utilizationFormula(billableHours, availableHours);
}

export function calculateEstimatedBillableRevenue(billableHours: number, billingRate: number) {
  if (!Number.isFinite(billableHours) || !Number.isFinite(billingRate) || billableHours < 0 || billingRate < 0) return null;
  return Math.round(billableHours * billingRate * 100) / 100;
}

export function periodLabel(period: ReportingPeriod) {
  return {
    "this-week": "This week",
    "this-month": "This month",
    "last-month": "Last month",
    "this-quarter": "This quarter",
    custom: "Custom range",
  }[period];
}

export function filterConsultants(records: Consultant[], query: string, department: string, role = "All roles", employmentStatus = "All statuses") {
  const normalized = query.trim().toLowerCase();
  return records.filter((record) => {
    const matchesQuery = !normalized || [record.name, record.employeeCode, record.email, record.role, record.department].some((value) => value.toLowerCase().includes(normalized));
    const matchesDepartment = department === "All teams" || record.department === department;
    const matchesRole = role === "All roles" || record.role === role;
    const matchesStatus = employmentStatus === "All statuses" || record.employmentStatus === employmentStatus;
    return matchesQuery && matchesDepartment && matchesRole && matchesStatus;
  });
}

export function sortConsultants(records: Consultant[], key: ConsultantSortKey, direction: "asc" | "desc") {
  return [...records].sort((a, b) => {
    const first = a[key];
    const second = b[key];
    const result = typeof first === "string" ? first.localeCompare(second as string) : (first as number) - (second as number);
    return direction === "asc" ? result : -result;
  });
}

export function consultantsToCsv(records: Consultant[]) {
  const header = ["Employee Code", "Consultant", "Email", "Role", "Department", "Employment Status", "Weekly Capacity", "Billing Rate", "Currency", "Available Hours", "Billable Hours", "Utilization", "Revenue", "Performance Status"];
  const rows = records.map((record) => [record.employeeCode, record.name, record.email, record.role, record.department, record.employmentStatus, record.weeklyCapacityHours, record.billingRate, record.currency, record.availableHours, record.billableHours, `${record.utilization}%`, record.revenue, record.status]);
  return [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

export type ConsultantValidationErrors = Partial<Record<keyof ConsultantFormValues, string>>;

export function validateConsultantForm(values: ConsultantFormValues, existing: Consultant[], editingId?: string): ConsultantValidationErrors {
  const errors: ConsultantValidationErrors = {};
  const employeeCode = values.employeeCode.trim().toLowerCase();
  const email = values.email.trim().toLowerCase();
  if (!employeeCode) errors.employeeCode = "Employee code is required.";
  else if (existing.some((record) => record.id !== editingId && record.employeeCode.toLowerCase() === employeeCode)) errors.employeeCode = "Employee code must be unique.";
  if (!values.firstName.trim()) errors.firstName = "First name is required.";
  if (!values.lastName.trim()) errors.lastName = "Last name is required.";
  if (!email) errors.email = "Email is required.";
  else if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
  else if (existing.some((record) => record.id !== editingId && record.email.toLowerCase() === email)) errors.email = "Email address is already in use.";
  if (!values.role.trim()) errors.role = "Role is required.";
  if (!values.department.trim()) errors.department = "Department is required.";
  if (!(Number(values.weeklyCapacityHours) >= 0) || values.weeklyCapacityHours.trim() === "") errors.weeklyCapacityHours = "Enter a non-negative weekly capacity.";
  if (!(Number(values.billingRate) >= 0) || values.billingRate.trim() === "") errors.billingRate = "Enter a valid non-negative billing rate.";
  if (!["Active", "On leave", "Inactive"].includes(values.employmentStatus)) errors.employmentStatus = "Choose a valid employment status.";
  if (!values.startDate || Number.isNaN(new Date(values.startDate).getTime())) errors.startDate = "Enter a valid start date.";
  else if (new Date(values.startDate).getTime() > Date.now()) errors.startDate = "Start date cannot be in the future.";
  return errors;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
