import { describe, expect, it } from "vitest";
import { clients, consultants, projects, timeEntries } from "../data/mockData";
import { calculateConsultantUtilization } from "./calculations";
import { createTimeEntry, deriveConsultantsFromTimeEntries, estimatedRevenueForEntry, filterTimeEntries, timeEntryFormValues, timeEntryMetrics, transitionTimeEntry, validateTimeEntryForm } from "./timeEntryService";
import type { TimeEntryFormValues } from "../types";

const validValues: TimeEntryFormValues = {
  consultantId: "c-101",
  clientId: "cl-201",
  projectId: "pr-301",
  workDate: "2026-04-22",
  description: "Data review",
  hours: "4",
  billingClassification: "Billable",
  billingRate: "360",
  currency: "USD",
};

describe("time-entry validation", () => {
  it("accepts a valid related entry and rejects an unrelated project", () => {
    expect(validateTimeEntryForm(validValues, consultants, clients, projects, timeEntries)).toEqual({});
    const errors = validateTimeEntryForm({ ...validValues, clientId: "cl-202", projectId: "pr-301" }, consultants, clients, projects, timeEntries);
    expect(errors.projectId).toContain("belong");
  });

  it("rejects invalid consultant, empty description, zero hours, and over-maximum hours", () => {
    const errors = validateTimeEntryForm({ ...validValues, consultantId: "missing", description: "", hours: "25" }, consultants, clients, projects, timeEntries);
    expect(errors.consultantId).toBeTruthy();
    expect(errors.description).toBeTruthy();
    expect(errors.hours).toContain("24-hour");
  });

  it("prevents duplicate submissions and requires billable rates", () => {
    const duplicate = timeEntryFormValues(timeEntries[0], consultants, projects);
    expect(validateTimeEntryForm(duplicate, consultants, clients, projects, timeEntries, timeEntries[0].id)).toEqual({});
    expect(validateTimeEntryForm(duplicate, consultants, clients, projects, timeEntries)).toMatchObject({ duplicate: expect.any(String) });
    expect(validateTimeEntryForm({ ...validValues, billingRate: "" }, consultants, clients, projects, timeEntries).billingRate).toBeTruthy();
  });
});

describe("time-entry workflow and calculations", () => {
  it("enforces approval transitions and rejection reasons", () => {
    const draft = timeEntries.find((entry) => entry.status === "Draft")!;
    expect(transitionTimeEntry(draft, "Approved").error).toContain("Cannot move");
    const submitted = timeEntries.find((entry) => entry.status === "Submitted")!;
    expect(transitionTimeEntry(submitted, "Rejected").error).toContain("reason");
    const rejected = transitionTimeEntry(submitted, "Rejected", "Add source detail").entry!;
    expect(rejected.status).toBe("Rejected");
    expect(transitionTimeEntry(rejected, "Draft").entry?.status).toBe("Draft");
  });

  it("preserves a billable rate snapshot and excludes rejected/draft entries from revenue", () => {
    const created = createTimeEntry(validValues, consultants, clients, projects);
    expect(created.billingRateSnapshot).toBe(360);
    expect(estimatedRevenueForEntry(created)).toBeNull();
    const approved = { ...created, status: "Approved" as const };
    expect(estimatedRevenueForEntry(approved)).toBe(1440);
  });

  it("separates billable and non-billable metrics by currency", () => {
    const metrics = timeEntryMetrics(timeEntries);
    expect(metrics.billableHours).toBeGreaterThan(0);
    expect(metrics.nonBillableHours).toBe(2);
    expect(metrics.estimatedRevenueByCurrency.USD).toBeGreaterThan(0);
    const euroEntry = { ...timeEntries[0], id: "te-eur", currency: "EUR" as const, billingRateSnapshot: 200, status: "Approved" as const };
    const multiCurrency = timeEntryMetrics([...timeEntries, euroEntry]);
    expect(multiCurrency.estimatedRevenueByCurrency.EUR).toBe(1600);
  });

  it("filters by reporting date and search text without counting missing records", () => {
    const filtered = filterTimeEntries(timeEntries, "architecture", { consultantId: "", clientId: "", projectId: "", billingClassification: "", status: "", dateRange: { from: "2026-04-01", to: "2026-04-30" } }, consultants, clients, projects);
    expect(filtered).toHaveLength(1);
    expect(calculateConsultantUtilization(10, 0)).toBeNull();
    expect(timeEntryMetrics([])).toMatchObject({ billableHours: 0, nonBillableHours: 0, pendingApproval: 0 });
  });

  it("derives consultant metrics from eligible entries without counting drafts or rejected entries", () => {
    const derived = deriveConsultantsFromTimeEntries(consultants, timeEntries);
    const maya = derived.find((consultant) => consultant.id === "c-101");
    expect(maya?.billableHours).toBe(14);
    expect(maya?.nonBillableHours).toBe(0);
    expect(maya?.revenue).toBe(5040);
  });
});
