import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { serializeConsultantResponse } from "./erpDb";
import type { ConsultantDocument } from "./mongo";
import type { User } from "./types";

const consultantId = new ObjectId();
const record: ConsultantDocument = {
  _id: consultantId,
  organizationId: null,
  employeeCode: "C-100",
  firstName: "Test",
  lastName: "Consultant",
  email: "consultant@example.test",
  role: "Consultant",
  department: "Delivery",
  employmentStatus: "Active",
  weeklyCapacityHours: 40,
  billingRate: 225,
  currency: "USD",
  startDate: "2026-01-01",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function actor(role: User["role"]): User {
  return {
    id: new ObjectId().toHexString(),
    openId: "serializer-test",
    name: "Test user",
    email: "test@example.test",
    loginMethod: "test",
    role,
    consultantId: role === "consultant" ? consultantId.toHexString() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

describe("consultant response serialization", () => {
  it.each(["admin", "finance"] as const)("preserves authorized billing rate for %s", (role) => {
    const response = serializeConsultantResponse(record, actor(role));
    expect(response.billingRate).toBe(225);
  });

  it.each(["manager", "consultant"] as const)("redacts billing rate and omits placeholders for %s", (role) => {
    const response = serializeConsultantResponse(record, actor(role));
    expect(response.billingRate).toBeNull();
    expect(response).not.toHaveProperty("assignedProjects");
    expect(response).not.toHaveProperty("availableHours");
    expect(response).not.toHaveProperty("billableHours");
    expect(response).not.toHaveProperty("nonBillableHours");
    expect(response).not.toHaveProperty("utilization");
    expect(response).not.toHaveProperty("revenue");
    expect(response).not.toHaveProperty("status");
  });
});
