import { TRPCClientError } from "@trpc/client";
import type { AppRouter } from "../../../backend/src/routers";

export interface BackendStatus {
  enabled: boolean;
  loading: boolean;
  error: unknown;
  ready: boolean;
}

export function backendErrorMessage(error: unknown) {
  if (!error) return null;
  if (error instanceof TRPCClientError) {
    if (error.data?.code === "UNAUTHORIZED" || error.message.includes("UNAUTHORIZED")) return "Sign in is required to access persistent business records.";
    if (error.message.includes("database") || error.message.includes("Database")) return "The application database is not configured or unavailable in this environment.";
    if (/Unexpected token|doctype|Failed to fetch|fetch failed/i.test(error.message)) return "The business data service is unavailable in this environment.";
    return error.message || "The business data service returned an error.";
  }
  if (error instanceof Error) return error.message;
  return "The business data service is unavailable. No sample data was loaded as a fallback.";
}

export function disabledBackendStatus(): BackendStatus {
  return { enabled: false, loading: false, error: null, ready: false };
}
