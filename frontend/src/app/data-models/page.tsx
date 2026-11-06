"use client";

import { useEffect, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { RowSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  api,
  ApiError,
  type DataModel,
  type DataModelSchedule,
  type Dataset,
  type DeriveOperator,
  type JoinType,
  type PipelineStep,
} from "@/lib/api";
import { PageHeader, PAGE_CONTAINER } from "@/components/PageHeader";

const FILTER_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "contains"];
const DERIVE_OPERATORS: DeriveOperator[] = ["+", "-", "*", "/"];
const SCHEDULES: DataModelSchedule[] = ["manual", "hourly", "daily"];

const STATUS_COLORS: Record<DataModel["status"], string> = {
  ready: "var(--status-good)",
  running: "var(--series-4)",
  pending: "var(--text-muted)",
  failed: "var(--status-critical)",
};

function FlowIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M7.2 7.2 15.8 10.8M7.2 16.8 15.8 13.2" />
    </svg>
  );
}

function StatusBadge({ status }: { status: DataModel["status"] }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: STATUS_COLORS[status] }}
    >
      {status}
    </span>
  );
}

const selectClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]";
const labelClass = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";

function FieldInput({
  value,
  onSet,
  placeholder,
  columnOptions,
}: {
  value: string;
  onSet: (v: string) => void;
  placeholder?: string;
  columnOptions: string[] | null;
}) {
  if (columnOptions) {
    return (
      <select value={value} onChange={(e) => onSet(e.target.value)} className={selectClass}>
        <option value="">Select field...</option>
        {columnOptions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onSet(e.target.value)}
      placeholder={placeholder ?? "field name"}
      className={selectClass}
    />
  );
}

function StepEditor({
  step,
  index,
  datasets,
  sourceColumns,
  onChange,
  onRemove,
}: {
  step: PipelineStep;
  index: number;
  datasets: Dataset[];
  sourceColumns: string[];
  onChange: (patch: Partial<PipelineStep>) => void;
  onRemove: () => void;
}) {
  const columnOptions = sourceColumns.length > 0 ? sourceColumns : null;

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium uppercase text-[var(--text-muted)]">
          {index + 1}. {step.type}
        </span>
        <button type="button" onClick={onRemove} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]">
          Remove
        </button>
      </div>

      {step.type === "join" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Join dataset</label>
            <select
              value={step.dataset_id ?? ""}
              onChange={(e) => onChange({ dataset_id: Number(e.target.value) })}
              className={selectClass}
            >
              <option value="">Select...</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Join type</label>
            <select
              value={step.join_type ?? "inner"}
              onChange={(e) => onChange({ join_type: e.target.value as JoinType })}
              className={selectClass}
            >
              <option value="inner">Inner</option>
              <option value="left">Left</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Left field (this pipeline)</label>
            <FieldInput value={step.left_field ?? ""} onSet={(v) => onChange({ left_field: v })} columnOptions={columnOptions} />
          </div>
          <div>
            <label className={labelClass}>Right field (joined dataset)</label>
            <input
              value={step.right_field ?? ""}
              onChange={(e) => onChange({ right_field: e.target.value })}
              placeholder="e.g. id"
              className={selectClass}
            />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Column prefix (optional)</label>
            <input
              value={step.prefix ?? ""}
              onChange={(e) => onChange({ prefix: e.target.value })}
              placeholder="e.g. customer"
              className={selectClass}
            />
          </div>
        </div>
      )}

      {step.type === "filter" && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <label className={labelClass}>Field</label>
            <FieldInput value={step.field ?? ""} onSet={(v) => onChange({ field: v })} columnOptions={columnOptions} />
          </div>
          <div>
            <label className={labelClass}>Operator</label>
            <select value={step.operator ?? "="} onChange={(e) => onChange({ operator: e.target.value })} className={selectClass}>
              {FILTER_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Value</label>
            <input value={step.value ?? ""} onChange={(e) => onChange({ value: e.target.value })} className={selectClass} />
          </div>
        </div>
      )}

      {step.type === "rename" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>From</label>
            <FieldInput value={step.from ?? ""} onSet={(v) => onChange({ from: v })} columnOptions={columnOptions} />
          </div>
          <div>
            <label className={labelClass}>To</label>
            <input value={step.to ?? ""} onChange={(e) => onChange({ to: e.target.value })} className={selectClass} />
          </div>
        </div>
      )}

      {step.type === "select" && (
        <div className="mt-2">
          <label className={labelClass}>Fields to keep (comma-separated)</label>
          <input
            value={(step.fields ?? []).join(", ")}
            onChange={(e) => onChange({ fields: e.target.value.split(",").map((f) => f.trim()).filter(Boolean) })}
            placeholder="e.g. order_id, amount, customer.name"
            className={selectClass}
          />
        </div>
      )}

      {step.type === "derive" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>New column name</label>
            <input value={step.name ?? ""} onChange={(e) => onChange({ name: e.target.value })} className={selectClass} />
          </div>
          <div>
            <label className={labelClass}>Operator</label>
            <select
              value={step.operator ?? "+"}
              onChange={(e) => onChange({ operator: e.target.value as DeriveOperator })}
              className={selectClass}
            >
              {DERIVE_OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Left field</label>
            <FieldInput value={step.left_field ?? ""} onSet={(v) => onChange({ left_field: v })} columnOptions={columnOptions} />
          </div>
          <div>
            <label className={labelClass}>Right field (or leave blank to use a constant)</label>
            <FieldInput value={step.right_field ?? ""} onSet={(v) => onChange({ right_field: v || undefined })} columnOptions={columnOptions} />
          </div>
          {!step.right_field && (
            <div>
              <label className={labelClass}>Constant</label>
              <input
                type="number"
                value={step.constant ?? ""}
                onChange={(e) => onChange({ constant: e.target.value ? Number(e.target.value) : undefined })}
                className={selectClass}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineBuilder({
  datasets,
  editing,
  onDone,
  onCancel,
}: {
  datasets: Dataset[];
  editing: DataModel | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [schedule, setSchedule] = useState<DataModelSchedule>(editing?.schedule ?? "manual");
  const [steps, setSteps] = useState<PipelineStep[]>(
    editing?.pipeline ?? [{ type: "source", dataset_id: undefined }]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceDataset = datasets.find((d) => d.id === steps[0]?.dataset_id);
  const sourceColumns = sourceDataset ? sourceDataset.columns.map((c) => c.name) : [];

  function updateStep(index: number, patch: Partial<PipelineStep>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep(type: PipelineStep["type"]) {
    setSteps((prev) => [...prev, { type }]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !steps[0]?.dataset_id) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = { name, schedule, pipeline: steps };
      if (editing) {
        await api.put(`/data-models/${editing.id}`, payload);
      } else {
        await api.post("/data-models", payload);
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save this data model.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm">
      <h3 className="mb-3 font-medium text-[var(--text-primary)]">{editing ? "Edit data model" : "New data model"}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className={selectClass} />
        </div>
        <div>
          <label className={labelClass}>Schedule</label>
          <select value={schedule} onChange={(e) => setSchedule(e.target.value as DataModelSchedule)} className={selectClass}>
            {SCHEDULES.map((s) => (
              <option key={s} value={s}>
                {s === "manual" ? "Manual (run on demand)" : `Auto-refresh ${s}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className={labelClass}>Source dataset</label>
        <select
          value={steps[0]?.dataset_id ?? ""}
          onChange={(e) => updateStep(0, { dataset_id: Number(e.target.value) })}
          className={selectClass}
          required
        >
          <option value="">Select...</option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {sourceColumns.length > 0 && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">Columns: {sourceColumns.join(", ")}</p>
        )}
      </div>

      {steps.length > 1 && (
        <div className="mt-3 flex flex-col gap-2">
          {steps.slice(1).map((step, i) => (
            <StepEditor
              key={i + 1}
              step={step}
              index={i + 1}
              datasets={datasets}
              sourceColumns={sourceColumns}
              onChange={(patch) => updateStep(i + 1, patch)}
              onRemove={() => removeStep(i + 1)}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(["join", "filter", "rename", "select", "derive"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => addStep(type)}
            className="rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            + {type}
          </button>
        ))}
      </div>

      {editing?.output_dataset && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Current output has {editing.output_dataset.row_count} row(s) with columns:{" "}
          {editing.output_dataset.columns.map((c) => c.name).join(", ")}
        </p>
      )}

      {error && <p className="mt-3 text-[var(--status-critical)]">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {submitting ? "Running..." : "Save & Run"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

function DataModelsList() {
  const [models, setModels] = useState<DataModel[] | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editing, setEditing] = useState<DataModel | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);

  function load() {
    api.get<DataModel[]>("/data-models").then(setModels).catch(() => setModels([]));
  }

  useEffect(() => {
    load();
    api.get<Dataset[]>("/datasets").then(setDatasets).catch(() => {});
  }, []);

  async function onRun(id: number) {
    setRunningId(id);
    setActionError(null);
    try {
      await api.post(`/data-models/${id}/run`, {});
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to run this data model.");
    } finally {
      setRunningId(null);
      load();
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this data model and its output dataset?")) return;
    setActionError(null);
    try {
      await api.del(`/data-models/${id}`);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete this data model.");
    }
  }

  return (
    <div className={`${PAGE_CONTAINER} max-w-4xl`}>
      <PageHeader
        icon="flow"
        title="Data Models"
        description="Join datasets together, filter and reshape them, and derive new columns — the result becomes a normal, chartable dataset."
      />

      <div className="mt-6">
        {showBuilder || editing ? (
          <PipelineBuilder
            datasets={datasets}
            editing={editing}
            onDone={() => {
              setShowBuilder(false);
              setEditing(null);
              load();
            }}
            onCancel={() => {
              setShowBuilder(false);
              setEditing(null);
            }}
          />
        ) : (
          <button
            onClick={() => setShowBuilder(true)}
            className="rounded-md border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            + New data model
          </button>
        )}
      </div>

      {actionError && <p className="mt-4 text-sm text-[var(--status-critical)]">{actionError}</p>}

      <div className="mt-8 grid gap-3">
        {models === null && (
          <>
            <RowSkeleton />
            <RowSkeleton />
          </>
        )}
        {models?.length === 0 && (
          <EmptyState
            icon={<FlowIcon />}
            title="No data models yet"
            description="Build one above to join or transform your datasets into a new chartable dataset."
          />
        )}
        {models?.map((m) => (
          <div key={m.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {m.name}
                  <StatusBadge status={m.status} />
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {m.pipeline.length} step(s) &middot; {m.schedule}
                  {m.output_dataset ? ` · ${m.output_dataset.row_count} rows` : ""}
                  {m.last_run_at ? ` · last run ${new Date(m.last_run_at).toLocaleString()}` : ""}
                </div>
                {m.error_message && <div className="text-xs text-[var(--status-critical)]">{m.error_message}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRun(m.id)}
                  disabled={runningId === m.id}
                  className="rounded-md border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
                >
                  {runningId === m.id ? "Running..." : "Run now"}
                </button>
                <button
                  onClick={() => setEditing(m)}
                  className="rounded-md border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(m.id)}
                  className="rounded-md border border-[var(--border)] px-3 py-1 text-sm text-[var(--status-critical)]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DataModelsPage() {
  return (
    <RequireAuth>
      <DataModelsList />
    </RequireAuth>
  );
}
