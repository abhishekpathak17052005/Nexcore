import { describe, expect, it } from "vitest";
import { redactFinancialValues } from "./financialAccess";
import type { User } from "./types";

const roles: User["role"][] = ["admin", "finance", "manager", "consultant"];
const payload = {
  billingRate: 225,
  billingRateSnapshot: 225,
  revenue: 1800,
  contractedAmount: 12000,
};

describe("backend financial response redaction", () => {
  it.each(roles)("applies the financial permission to %s responses", (role) => {
    const result = redactFinancialValues(payload, { role }, [
      "billingRate",
      "billingRateSnapshot",
      "revenue",
      "contractedAmount",
    ]);

    if (role === "admin" || role === "finance") {
      expect(result).toEqual(payload);
    } else {
      expect(result).toEqual({
        billingRate: null,
        billingRateSnapshot: null,
        revenue: null,
        contractedAmount: null,
      });
    }
  });

  it("does not mutate the source response object", () => {
    redactFinancialValues(payload, { role: "manager" }, ["billingRate"]);
    expect(payload.billingRate).toBe(225);
  });
});
