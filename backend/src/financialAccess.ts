import { hasPermission } from "./authorization";
import type { User } from "./types";

/** Central backend response gate for fields protected by metrics.financial. */
export function canViewFinancialData(actor: Pick<User, "role">): boolean {
  return hasPermission(actor.role, "metrics.financial");
}

export function redactFinancialValues<T extends object, K extends keyof T>(
  values: T,
  actor: Pick<User, "role">,
  keys: readonly K[],
): Omit<T, K> & { [P in K]: T[P] | null } {
  if (canViewFinancialData(actor)) return values;
  const redacted = { ...values } as Omit<T, K> & { [P in K]: T[P] | null };
  for (const key of keys) (redacted as Record<keyof T, unknown>)[key] = null;
  return redacted;
}
