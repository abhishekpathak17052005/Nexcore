import { useEffect, useState, type FormEvent } from "react";
import { X, Save, AlertCircle } from "lucide-react";
import type { Retainer, RetainerFormValues, Client, Project, RetainerType, BillingFrequency, CurrencyCode } from "@/types";

interface RetainerFormProps {
  record?: Retainer;
  records: Retainer[];
  clients: Client[];
  projects: Project[];
  onSubmit: (values: RetainerFormValues) => Promise<void>;
  onCancel: () => void;
}

interface ValidationErrors {
  clientId?: string;
  projectId?: string;
  name?: string;
  contractedHours?: string;
  contractedAmount?: string;
  startDate?: string;
  endDate?: string;
  alertThresholdPercent?: string;
}

function retainerFormValues(record: Retainer | undefined, clients: Client[]): RetainerFormValues {
  if (record) {
    return {
      clientId: record.clientId,
      projectId: record.projectId || "",
      name: record.name,
      type: record.type,
      contractedHours: record.contractedHours?.toString() || "",
      contractedAmount: record.contractedAmount?.toString() || "",
      currency: record.currency,
      billingFrequency: record.billingFrequency,
      startDate: record.startDate,
      endDate: record.endDate,
      rolloverAllowed: record.rolloverAllowed,
      alertThresholdPercent: record.alertThresholdPercent.toString(),
    };
  }

  const defaultClient = clients[0];
  return {
    clientId: defaultClient?.id || "",
    projectId: "",
    name: "",
    type: "HOURS",
    contractedHours: "",
    contractedAmount: "",
    currency: defaultClient?.defaultCurrency || "USD",
    billingFrequency: "MONTHLY",
    startDate: new Date().toISOString().split("T")[0],
    endDate: "",
    rolloverAllowed: false,
    alertThresholdPercent: "80",
  };
}

function validateRetainerForm(
  values: RetainerFormValues,
  records: Retainer[],
  recordId?: string
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!values.clientId) {
    errors.clientId = "Client is required.";
  }

  if (!values.name.trim()) {
    errors.name = "Contract name is required.";
  } else if (values.name.length > 200) {
    errors.name = "Contract name must not exceed 200 characters.";
  }

  if (values.type === "HOURS") {
    const hours = parseFloat(values.contractedHours);
    if (!values.contractedHours || isNaN(hours) || hours <= 0) {
      errors.contractedHours = "Positive contracted hours required for hour-based retainers.";
    } else if (hours > 10000) {
      errors.contractedHours = "Contracted hours must not exceed 10,000.";
    }
  } else if (values.type === "AMOUNT") {
    const amount = parseFloat(values.contractedAmount);
    if (!values.contractedAmount || isNaN(amount) || amount <= 0) {
      errors.contractedAmount = "Positive contracted amount required for amount-based retainers.";
    } else if (amount > 100000000) {
      errors.contractedAmount = "Contracted amount must not exceed 100,000,000.";
    }
  }

  if (!values.startDate) {
    errors.startDate = "Start date is required.";
  }

  if (!values.endDate) {
    errors.endDate = "End date is required.";
  }

  if (values.startDate && values.endDate && values.startDate > values.endDate) {
    errors.endDate = "End date must not be before start date.";
  }

  const threshold = parseFloat(values.alertThresholdPercent);
  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    errors.alertThresholdPercent = "Alert threshold must be between 0 and 100.";
  }

  return errors;
}

export function RetainerForm({ record, records, clients, projects, onSubmit, onCancel }: RetainerFormProps) {
  const [values, setValues] = useState<RetainerFormValues>(() => retainerFormValues(record, clients));
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValues(retainerFormValues(record, clients));
    setErrors({});
  }, [record, clients]);

  const update = <K extends keyof RetainerFormValues>(key: K, value: RetainerFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key as keyof ValidationErrors]) {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const handleTypeChange = (newType: RetainerType) => {
    update("type", newType);
    // Clear opposite field errors
    if (newType === "HOURS") {
      setErrors((current) => ({ ...current, contractedAmount: undefined }));
    } else {
      setErrors((current) => ({ ...current, contractedHours: undefined }));
    }
  };

  const handleClientChange = (clientId: string) => {
    update("clientId", clientId);
    update("projectId", ""); // Reset project when client changes

    // Update currency to match client's default
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      update("currency", client.defaultCurrency);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateRetainerForm(values, records, record?.id);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  };

  const clientProjects = projects.filter((p) => p.clientId === values.clientId);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form className="drawer-form" onSubmit={submit} noValidate>
      <div className="drawer-form-header">
        <div>
          <span className="panel-eyebrow">{record ? "Edit" : "New"} Retainer Agreement</span>
          <h2>{record ? "Update Contract" : "Create Retainer"}</h2>
          <p>Configure retainer terms, contracted limits, and billing frequency.</p>
        </div>
        <button type="button" className="icon-button" onClick={onCancel} aria-label="Close form">
          <X size={18} />
        </button>
      </div>

      <div className="drawer-form-body">
        {hasErrors && (
          <div className="form-error-summary">
            <AlertCircle size={16} />
            <span>Review the highlighted fields before saving.</span>
          </div>
        )}

        {/* Client Selection */}
        <Field label="Client" required error={errors.clientId}>
          <select
            className="form-select"
            value={values.clientId}
            onChange={(e) => handleClientChange(e.target.value)}
            disabled={submitting}
          >
            <option value="">Select client...</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} ({client.clientCode})
              </option>
            ))}
          </select>
        </Field>

        {/* Project Selection (Optional) */}
        <Field label="Project (Optional)" error={errors.projectId} hint="Leave blank for client-wide retainer">
          <select
            className="form-select"
            value={values.projectId}
            onChange={(e) => update("projectId", e.target.value)}
            disabled={submitting || !values.clientId}
          >
            <option value="">All projects for this client</option>
            {clientProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>

        {/* Contract Name */}
        <Field label="Contract Name" required error={errors.name}>
          <input
            type="text"
            className="form-input"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            disabled={submitting}
            placeholder="e.g., Q1 2026 Development Retainer"
            maxLength={200}
          />
        </Field>

        {/* Retainer Type */}
        <Field label="Retainer Type" required>
          <div className="radio-group">
            <label className="radio-option">
              <input
                type="radio"
                name="type"
                value="HOURS"
                checked={values.type === "HOURS"}
                onChange={() => handleTypeChange("HOURS")}
                disabled={submitting}
              />
              <span>
                <strong>Hour-based</strong>
                <small>Track by approved billable hours</small>
              </span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="type"
                value="AMOUNT"
                checked={values.type === "AMOUNT"}
                onChange={() => handleTypeChange("AMOUNT")}
                disabled={submitting}
              />
              <span>
                <strong>Amount-based</strong>
                <small>Track by monetary value</small>
              </span>
            </label>
          </div>
        </Field>

        {/* Conditional Fields Based on Type */}
        {values.type === "HOURS" ? (
          <Field label="Contracted Hours" required error={errors.contractedHours}>
            <input
              type="number"
              className="form-input"
              value={values.contractedHours}
              onChange={(e) => update("contractedHours", e.target.value)}
              disabled={submitting}
              placeholder="e.g., 160"
              min="0"
              max="10000"
              step="0.5"
            />
          </Field>
        ) : (
          <>
            <Field label="Contracted Amount" required error={errors.contractedAmount}>
              <input
                type="number"
                className="form-input"
                value={values.contractedAmount}
                onChange={(e) => update("contractedAmount", e.target.value)}
                disabled={submitting}
                placeholder="e.g., 50000"
                min="0"
                max="100000000"
                step="0.01"
              />
            </Field>
            <Field label="Currency" required>
              <select
                className="form-select"
                value={values.currency}
                onChange={(e) => update("currency", e.target.value as CurrencyCode)}
                disabled={submitting}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </Field>
          </>
        )}

        {/* Billing Frequency */}
        <Field label="Billing Frequency" required>
          <select
            className="form-select"
            value={values.billingFrequency}
            onChange={(e) => update("billingFrequency", e.target.value as BillingFrequency)}
            disabled={submitting}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="ANNUALLY">Annually</option>
          </select>
        </Field>

        {/* Date Range */}
        <div className="form-row">
          <Field label="Start Date" required error={errors.startDate}>
            <input
              type="date"
              className="form-input"
              value={values.startDate}
              onChange={(e) => update("startDate", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="End Date" required error={errors.endDate}>
            <input
              type="date"
              className="form-input"
              value={values.endDate}
              onChange={(e) => update("endDate", e.target.value)}
              disabled={submitting}
            />
          </Field>
        </div>

        {/* Alert Threshold */}
        <Field
          label="Alert Threshold (%)"
          required
          error={errors.alertThresholdPercent}
          hint="Alert when utilization reaches this percentage"
        >
          <input
            type="number"
            className="form-input"
            value={values.alertThresholdPercent}
            onChange={(e) => update("alertThresholdPercent", e.target.value)}
            disabled={submitting}
            placeholder="80"
            min="0"
            max="100"
            step="1"
          />
        </Field>

        {/* Rollover Policy */}
        <Field label="Rollover Policy">
          <label className="checkbox-option">
            <input
              type="checkbox"
              checked={values.rolloverAllowed}
              onChange={(e) => update("rolloverAllowed", e.target.checked)}
              disabled={submitting}
            />
            <span>Allow unused hours/amount to roll over to next period</span>
          </label>
        </Field>
      </div>

      <div className="drawer-form-actions">
        <button type="button" className="button button-quiet" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={submitting}>
          <Save size={15} />
          {submitting ? "Saving..." : record ? "Save Changes" : "Create Retainer"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`form-field ${full ? "full" : ""}`}>
      <span className="form-label">
        {label}
        {required && <b> *</b>}
      </span>
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}
