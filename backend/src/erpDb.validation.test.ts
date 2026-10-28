import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConsultant, createTimeEntry } from "./erpDb";

describe("ERP backend validation boundary", () => {
  beforeEach(() => vi.stubEnv("MONGODB_URI", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("rejects invalid consultant capacity before database access", async () => {
    await expect(createConsultant({ employeeCode: "NS-TEST", firstName: "Test", lastName: "User", email: "test@example.com", role: "Consultant", department: "Delivery", employmentStatus: "Active", weeklyCapacityHours: 0, billingRate: 250, currency: "USD", startDate: "2026-04-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid consultant dates before database access", async () => {
    await expect(createConsultant({ employeeCode: "NS-TEST", firstName: "Test", lastName: "User", email: "test@example.com", role: "Consultant", department: "Delivery", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 250, currency: "USD", startDate: "not-a-date" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid time-entry hours before relationship lookup", async () => {
    await expect(createTimeEntry({ consultantId: "1", clientId: "1", projectId: "1", workDate: "2026-04-01", description: "Invalid", hours: 25, billingClassification: "Billable", billingRate: 250, currency: "USD" }, { id: "507f1f77bcf86cd799439001", role: "admin", consultantId: null } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not claim persistence when the database connection is absent", async () => {
    await expect(createConsultant({ employeeCode: "NS-TEST", firstName: "Test", lastName: "User", email: "test@example.com", role: "Consultant", department: "Delivery", employmentStatus: "Active", weeklyCapacityHours: 40, billingRate: 250, currency: "USD", startDate: "2026-04-01" })).rejects.toThrow("MONGODB_URI is not configured");
  });
});
