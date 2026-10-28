/**
 * Unified type exports.
 * Import shared platform types from this single entry point.
 */

export type UserRole = "admin" | "manager" | "finance" | "consultant" | "user";

export interface User {
  id: string;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: UserRole;
  consultantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export interface InsertUser {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: UserRole;
  consultantId?: string | null;
  lastSignedIn?: Date;
}

export * from "./_core/errors";
