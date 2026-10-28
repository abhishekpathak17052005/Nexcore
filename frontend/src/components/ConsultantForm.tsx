import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Save, X } from "lucide-react";
import { consultantFormValues } from "@/lib/dashboardService";
import { validateConsultantForm, type ConsultantValidationErrors } from "@/lib/calculations";
import type { Consultant, ConsultantFormValues, EmploymentStatus } from "@/types";

interface ConsultantFormProps {
  record?: Consultant;
  records: Consultant[];
  onSubmit: (values: ConsultantFormValues) => void;
  onCancel: () => void;
}

export function ConsultantForm({ record, records, onSubmit, onCancel }: ConsultantFormProps) {
  const [values, setValues] = useState<ConsultantFormValues>(() => consultantFormValues(record));
  const [errors, setErrors] = useState<ConsultantValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const departments = useMemo(() => [...new Set(records.map((item) => item.department))].sort(), [records]);
  const roles = useMemo(() => [...new Set(records.map((item) => item.role))].sort(), [records]);

  useEffect(() => {
    setValues(consultantFormValues(record));
    setErrors({});
  }, [record]);

  const update = <K extends keyof ConsultantFormValues>(key: K, value: ConsultantFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateConsultantForm(values, records, record?.id);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    try {
      onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  return <form className="consultant-form" onSubmit={submit} noValidate>
    <div className="drawer-form-header"><div><span className="panel-eyebrow">{record ? "Edit record" : "New record"}</span><h2>{record ? "Edit consultant" : "Add consultant"}</h2><p>Development state only · changes are not persisted after refresh.</p></div><button type="button" className="icon-button" onClick={onCancel} aria-label="Close consultant form"><X size={18} /></button></div>
    <div className="form-section"><div className="form-section-heading"><strong>Identity</strong><span>Required fields are marked *</span></div><div className="form-grid two-col"><Field label="Employee code" required error={errors.employeeCode}><input value={values.employeeCode} onChange={(event) => update("employeeCode", event.target.value)} placeholder="NS-0109" aria-invalid={Boolean(errors.employeeCode)} /></Field><Field label="Employment status" required error={errors.employmentStatus}><select value={values.employmentStatus} onChange={(event) => update("employmentStatus", event.target.value as EmploymentStatus)}><option>Active</option><option>On leave</option><option>Inactive</option></select></Field><Field label="First name" required error={errors.firstName}><input value={values.firstName} onChange={(event) => update("firstName", event.target.value)} placeholder="First name" aria-invalid={Boolean(errors.firstName)} /></Field><Field label="Last name" required error={errors.lastName}><input value={values.lastName} onChange={(event) => update("lastName", event.target.value)} placeholder="Last name" aria-invalid={Boolean(errors.lastName)} /></Field><Field label="Work email" required error={errors.email} full><input type="email" value={values.email} onChange={(event) => update("email", event.target.value)} placeholder="name@example.test" aria-invalid={Boolean(errors.email)} /></Field></div></div>
    <div className="form-section"><div className="form-section-heading"><strong>Role & capacity</strong><span>Billing rate is an hourly client billing rate.</span></div><div className="form-grid two-col"><Field label="Role" required error={errors.role}><input list="consultant-roles" value={values.role} onChange={(event) => update("role", event.target.value)} placeholder="Senior Consultant" aria-invalid={Boolean(errors.role)} /><datalist id="consultant-roles">{roles.map((role) => <option key={role} value={role} />)}</datalist></Field><Field label="Department" required error={errors.department}><input list="consultant-departments" value={values.department} onChange={(event) => update("department", event.target.value)} placeholder="Strategy" aria-invalid={Boolean(errors.department)} /><datalist id="consultant-departments">{departments.map((department) => <option key={department} value={department} />)}</datalist></Field><Field label="Weekly capacity (hours)" required error={errors.weeklyCapacityHours}><input type="number" min="0" step="0.5" value={values.weeklyCapacityHours} onChange={(event) => update("weeklyCapacityHours", event.target.value)} aria-invalid={Boolean(errors.weeklyCapacityHours)} /></Field><Field label="Billing rate" required error={errors.billingRate}><div className="input-with-select"><select value={values.currency} onChange={(event) => update("currency", event.target.value as ConsultantFormValues["currency"])} aria-label="Billing currency"><option>USD</option><option>EUR</option><option>GBP</option></select><input type="number" min="0" step="0.01" value={values.billingRate} onChange={(event) => update("billingRate", event.target.value)} aria-invalid={Boolean(errors.billingRate)} /></div></Field><Field label="Start date" required error={errors.startDate}><input type="date" value={values.startDate} onChange={(event) => update("startDate", event.target.value)} aria-invalid={Boolean(errors.startDate)} /></Field><Field label="Assigned projects" hint="Separate project names with commas."><input value={values.assignedProjects} onChange={(event) => update("assignedProjects", event.target.value)} placeholder="Northwind Health, Aster Labs" /></Field></div></div>
    {Object.keys(errors).length > 0 && <div className="form-error-summary"><AlertCircle size={16} /><span>Review the highlighted fields before saving.</span></div>}
    <div className="drawer-form-actions"><button type="button" className="button button-quiet" onClick={onCancel}>Cancel</button><button type="submit" className="button button-primary" disabled={submitting}><Save size={15} />{submitting ? "Validating…" : record ? "Update consultant" : "Add consultant"}</button></div>
  </form>;
}

function Field({ label, required, error, hint, full, children }: { label: string; required?: boolean; error?: string; hint?: string; full?: boolean; children: ReactNode }) {
  return <label className={`form-field ${full ? "full" : ""}`}><span className="form-label">{label}{required && <b> *</b>}</span>{children}{error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</label>;
}
