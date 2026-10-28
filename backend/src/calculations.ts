export type ReportingPeriod = "this-week" | "this-month" | "last-month" | "this-quarter" | "custom";
export type CurrencyCode = "USD" | "EUR" | "GBP";

export function utilizationFormula(billableHours: number, availableHours: number): number | null {
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
        return weeklyCapacityHours * 1;
      case "this-month":
      case "last-month":
        return Math.round(dailyCapacity * 22 * 10) / 10;
      case "this-quarter":
        return weeklyCapacityHours * 13;
      default:
        return weeklyCapacityHours * 4;
    }
  }

  return weeklyCapacityHours * 4;
}

export function availableWorkingHours(
  consultant: { weeklyCapacityHours: number; availableHours?: number },
  period?: ReportingPeriod,
  dateRange?: { from?: string; to?: string }
): number {
  if (period || dateRange) {
    return calculatePeriodCapacity(consultant.weeklyCapacityHours, period, dateRange);
  }
  return Number.isFinite(consultant.availableHours) ? (consultant.availableHours as number) : consultant.weeklyCapacityHours * 4;
}

export function calculateConsultantUtilization(billableHours: number, availableHours: number): number | null {
  return utilizationFormula(billableHours, availableHours);
}

export function calculateEstimatedBillableRevenue(billableHours: number, billingRate: number): number | null {
  if (!Number.isFinite(billableHours) || !Number.isFinite(billingRate) || billableHours < 0 || billingRate < 0) return null;
  return Math.round(billableHours * billingRate * 100) / 100;
}
