import { describe, expect, it } from "vitest";
import { consultants } from "../data/mockData";
import { calculateConsultantUtilization, calculateEstimatedBillableRevenue, validateConsultantForm } from "./calculations";
import { consultantFormValues, developmentConsultantDataSource } from "./dashboardService";

const validNewConsultant = {
  employeeCode: "NS-0999",
  firstName: "Taylor",
  lastName: "Morgan",
  email: "taylor.morgan@example.test",
  role: "Consultant",
  department: "Strategy",
  employmentStatus: "Active" as const,
  weeklyCapacityHours: "40",
  billingRate: "250",
  currency: "USD" as const,
  startDate: "2026-01-15",
  assignedProjects: "",
};

describe("consultant business calculations", () => {
  it("calculates utilization safely and documents zero capacity as unavailable", () => {
    expect(calculateConsultantUtilization(80, 160)).toBe(50);
    expect(calculateConsultantUtilization(8, 0)).toBeNull();
  });

  it("calculates estimated current-period revenue with an hourly billing rate", () => {
    expect(calculateEstimatedBillableRevenue(12.5, 240)).toBe(3000);
    expect(calculateEstimatedBillableRevenue(-1, 240)).toBeNull();
  });
});

describe("consultant form validation", () => {
  it("accepts a valid new consultant", () => {
    expect(validateConsultantForm(validNewConsultant, consultants)).toEqual({});
  });

  it("rejects duplicate employee codes and emails", () => {
    const existing = consultants[0];
    const errors = validateConsultantForm({ ...validNewConsultant, employeeCode: existing.employeeCode, email: existing.email }, consultants);
    expect(errors.employeeCode).toBe("Employee code must be unique.");
    expect(errors.email).toBe("Email address is already in use.");
  });

  it("allows an existing consultant to retain its own unique fields when editing", () => {
    const existing = consultants[0];
    expect(validateConsultantForm(consultantFormValues(existing), consultants, existing.id)).toEqual({});
  });

  it("updates a newly created record through the local CRUD seam", () => {
    const created = developmentConsultantDataSource.create(validNewConsultant);
    const updated = developmentConsultantDataSource.update(created.id, { ...validNewConsultant, firstName: "Updated" }, created);
    expect(updated?.name).toBe("Updated Morgan");
    expect(updated?.id).toBe(created.id);
  });

  it("rejects invalid email, negative capacity, negative rate, and future dates", () => {
    const errors = validateConsultantForm({ ...validNewConsultant, email: "not-an-email", weeklyCapacityHours: "-2", billingRate: "-4", startDate: "2099-01-01" }, consultants);
    expect(errors.email).toBeTruthy();
    expect(errors.weeklyCapacityHours).toBeTruthy();
    expect(errors.billingRate).toBeTruthy();
    expect(errors.startDate).toBeTruthy();
  });
});
