import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Save, X } from "lucide-react";
import { validateTimeEntryForm, timeEntryFormValues, type TimeEntryValidationErrors } from "@/lib/timeEntryService";
import type { Client, Consultant, Project, TimeEntry, TimeEntryFormValues } from "@/types";

interface TimeEntryFormProps {
  record?: TimeEntry;
  records: TimeEntry[];
  consultants: Consultant[];
  clients: Client[];
  projects: Project[];
  onSubmit: (values: TimeEntryFormValues) => void;
  onCancel: () => void;
}

export function TimeEntryForm({ record, records, consultants, clients, projects, onSubmit, onCancel }: TimeEntryFormProps) {
  const [values, setValues] = useState<TimeEntryFormValues>(() => timeEntryFormValues(record, consultants, projects));
  const [errors, setErrors] = useState<TimeEntryValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const availableProjects = useMemo(() => projects.filter((project) => project.clientId === values.clientId && project.status !== "Closed"), [projects, values.clientId]);

  useEffect(() => { setValues(timeEntryFormValues(record, consultants, projects)); setErrors({}); }, [record, consultants, projects]);

  const update = <K extends keyof TimeEntryFormValues>(key: K, value: TimeEntryFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value, ...(key === "clientId" ? { projectId: "" } : {}) }));
    const errorKey = key as keyof TimeEntryValidationErrors;
    if (errors[errorKey]) setErrors((current) => ({ ...current, [errorKey]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateTimeEntryForm(values, consultants, clients, projects, records, record?.id);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try { onSubmit(values); } finally { setSubmitting(false); }
  };

  const selectedProject = projects.find((project) => project.id === values.projectId);

  return <form className="consultant-form" onSubmit={submit} noValidate>
    <div className="drawer-form-header"><div><span className="panel-eyebrow">{record ? "Edit draft" : "New time entry"}</span><h2>{record ? "Edit time entry" : "Add time entry"}</h2><p>Development state only · approved history keeps its captured billing rate.</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Close time entry form"><X size={18} /></button></div>
    <div className="form-section"><div className="form-section-heading"><strong>Work context</strong><span>Stable consultant, client, and project relationships</span></div><div className="form-grid two-col"><Field label="Consultant" required error={errors.consultantId}><select value={values.consultantId} onChange={(event) => update("consultantId", event.target.value)} aria-invalid={Boolean(errors.consultantId)}><option value="">Select consultant</option>{consultants.filter((consultant) => consultant.employmentStatus !== "Inactive").map((consultant) => <option key={consultant.id} value={consultant.id}>{consultant.name} · {consultant.employeeCode}</option>)}</select></Field><Field label="Work date" required error={errors.workDate}><input type="date" value={values.workDate} onChange={(event) => update("workDate", event.target.value)} aria-invalid={Boolean(errors.workDate)} /></Field><Field label="Client" required error={errors.clientId}><select value={values.clientId} onChange={(event) => update("clientId", event.target.value)} aria-invalid={Boolean(errors.clientId)}><option value="">Select client</option>{clients.filter((client) => client.status === "Active").map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></Field><Field label="Project" required error={errors.projectId}><select value={values.projectId} onChange={(event) => update("projectId", event.target.value)} aria-invalid={Boolean(errors.projectId)}><option value="">Select project</option>{availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.status === "On hold" ? " · On hold" : ""}</option>)}</select>{values.clientId && availableProjects.length === 0 && <span className="field-hint">No active project is available for this client.</span>}</Field><Field label="Task description" required error={errors.description} full><textarea value={values.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe the client or internal work completed." rows={3} aria-invalid={Boolean(errors.description)} /></Field></div></div>
    <div className="form-section"><div className="form-section-heading"><strong>Billing</strong><span>Rate is snapshotted on billable entry creation.</span></div><div className="form-grid two-col"><Field label="Hours" required error={errors.hours} hint="Configured maximum: 24 hours per entry."><input type="number" min="0.01" max="24" step="0.25" value={values.hours} onChange={(event) => update("hours", event.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.hours)} /></Field><Field label="Classification" required><select value={values.billingClassification} onChange={(event) => update("billingClassification", event.target.value as TimeEntryFormValues["billingClassification"])}><option>Billable</option><option>Non-billable</option></select></Field><Field label="Billing rate" error={errors.billingRate} hint={values.billingClassification === "Billable" ? "Client billing rate, not employee salary." : "Not used for non-billable work."}><input type="number" min="0" step="0.01" value={values.billingRate} disabled={values.billingClassification === "Non-billable"} onChange={(event) => update("billingRate", event.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.billingRate)} /></Field><Field label="Currency" error={errors.currency}><select value={values.currency} disabled={values.billingClassification === "Non-billable"} onChange={(event) => update("currency", event.target.value as TimeEntryFormValues["currency"])} aria-invalid={Boolean(errors.currency)}><option>USD</option><option>EUR</option><option>GBP</option></select>{selectedProject && <span className="field-hint">Project currency: {selectedProject.billingCurrency}</span>}</Field></div></div>
    {errors.duplicate && <div className="form-error-summary"><AlertCircle size={16} /><span>{errors.duplicate}</span></div>}
    {Object.keys(errors).length > 0 && !errors.duplicate && <div className="form-error-summary"><AlertCircle size={16} /><span>Review the highlighted fields before saving.</span></div>}
    <div className="drawer-form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary" disabled={submitting}><Save size={15} />{submitting ? "Validating…" : record ? "Update draft" : "Save draft"}</button></div>
  </form>;
}

function Field({ label, required, error, hint, full, children }: { label: string; required?: boolean; error?: string; hint?: string; full?: boolean; children: ReactNode }) {
  return <label className={`form-field ${full ? "full" : ""}`}><span className="form-label">{label}{required && <b> *</b>}</span>{children}{error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</label>;
}
