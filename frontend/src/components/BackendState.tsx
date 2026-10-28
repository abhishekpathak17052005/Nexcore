import { AlertTriangle, Database, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { backendErrorMessage } from "@/lib/backendService";

export function BackendState({ loading, error, onRetry, title = "Persistent records unavailable" }: { loading?: boolean; error?: unknown; onRetry?: () => void; title?: string }) {
  if (loading) return <div className="backend-state"><LoaderCircle className="backend-state-spinner" size={22} /><strong>Loading persistent records…</strong><span>The business data service is being queried.</span></div>;
  const message = backendErrorMessage(error) ?? "No persistent records are available for this workspace yet.";
  const requiresAuth = message.toLowerCase().includes("sign in");
  return <div className="backend-state backend-state-error"><div className="backend-state-icon">{requiresAuth ? <ShieldAlert size={20} /> : <Database size={20} />}</div><strong>{title}</strong><span>{message}</span><small>Development fixtures are intentionally not used as a silent fallback.</small>{onRetry && <button className="button button-quiet" onClick={onRetry}>{requiresAuth ? <AlertTriangle size={14} /> : <RefreshCw size={14} />}Retry connection</button>}</div>;
}
