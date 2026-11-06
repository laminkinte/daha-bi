"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { EmptyState } from "@/components/EmptyState";
import { RowSkeleton } from "@/components/Skeleton";
import {
  api,
  ApiError,
  type DataQualityReport,
  type Dataset,
  type Organization,
  type RowFilterOperator,
  type RowLevelPolicy,
} from "@/lib/api";
import { PageHeader, PAGE_CONTAINER } from "@/components/PageHeader";

const RLS_ROLES = ["admin", "analyst", "viewer"] as const;
const RLS_OPERATORS: RowFilterOperator[] = ["=", "!=", ">", "<", ">=", "<=", "contains"];

function RowLevelSecurityPanel({ dataset, canManage }: { dataset: Dataset; canManage: boolean }) {
  const [policies, setPolicies] = useState<RowLevelPolicy[] | null>(null);
  const [role, setRole] = useState<(typeof RLS_ROLES)[number]>("viewer");
  const [field, setField] = useState(dataset.columns[0]?.name ?? "");
  const [operator, setOperator] = useState<RowFilterOperator>("=");
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<RowLevelPolicy[]>(`/datasets/${dataset.id}/row-level-policies`)
      .then(setPolicies)
      .catch(() => setPolicies([]));
  }

  useEffect(load, [dataset.id]);

  async function addPolicy() {
    if (!value) return;
    setAdding(true);
    setError(null);
    try {
      await api.post(`/datasets/${dataset.id}/row-level-policies`, { role, field, operator, value });
      setValue("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add policy.");
    } finally {
      setAdding(false);
    }
  }

  async function removePolicy(id: number) {
    try {
      await api.del(`/row-level-policies/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove policy.");
    }
  }

  return (
    <div className="border-t border-[var(--border)] p-4">
      <h3 className="text-sm font-medium text-[var(--text-primary)]">Row-level security</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Restrict which rows a role can see in every chart built on this dataset. Owners always see
        everything.
      </p>

      {policies === null && <p className="mt-3 text-xs text-[var(--text-muted)]">Loading...</p>}

      {policies && policies.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {policies.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--page-plane)] px-2.5 py-1.5 text-xs"
            >
              <span className="text-[var(--text-secondary)]">
                <span className="capitalize font-medium text-[var(--text-primary)]">{p.role}</span> can
                only see rows where <code>{p.field}</code> {p.operator} &ldquo;{p.value}&rdquo;
              </span>
              {canManage && (
                <button
                  onClick={() => removePolicy(p.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {policies && policies.length === 0 && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">No restrictions — every role sees all rows.</p>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof RLS_ROLES)[number])}
            className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs capitalize"
          >
            {RLS_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs"
          >
            {dataset.columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value as RowFilterOperator)}
            className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs"
          >
            {RLS_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value"
            className="w-24 rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs"
          />
          <button
            onClick={addPolicy}
            disabled={adding || !value}
            className="rounded bg-[var(--accent)] px-2 py-1 text-xs text-white disabled:opacity-60"
          >
            {adding ? "Adding..." : "Add"}
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-[var(--status-critical)]">{error}</p>}
    </div>
  );
}

function LayersIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

type Preview = { columns: { name: string; label: string }[]; rows: Record<string, unknown>[] };

function DatasetPreviewPanel({ dataset }: { dataset: Dataset }) {
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    setPreview(null);
    api.get<Preview>(`/datasets/${dataset.id}/preview`).then(setPreview);
  }, [dataset.id]);

  if (!preview) {
    return <p className="p-4 text-sm text-[var(--text-muted)]">Loading preview...</p>;
  }

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full text-left text-sm tabular-nums">
        <thead>
          <tr className="border-b border-[var(--baseline)]">
            {preview.columns.map((col) => (
              <th key={col.name} className="whitespace-nowrap px-2 py-1 font-medium text-[var(--text-secondary)]">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--gridline)]">
              {preview.columns.map((col) => (
                <td key={col.name} className="whitespace-nowrap px-2 py-1 text-[var(--text-primary)]">
                  {String(row[col.name] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {preview.rows.length === 0 && (
        <p className="py-4 text-center text-sm text-[var(--text-muted)]">No rows to preview.</p>
      )}
    </div>
  );
}

function DataQualityPanel({ dataset, canManage }: { dataset: Dataset; canManage: boolean }) {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<DataQualityReport>(`/datasets/${dataset.id}/quality-report`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to analyze this dataset."))
      .finally(() => setLoading(false));
  }

  async function onRemoveDuplicates() {
    setCleaning(true);
    setError(null);
    try {
      await api.post(`/datasets/${dataset.id}/remove-duplicates`, {});
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove duplicates.");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="border-t border-[var(--border)] p-4 text-sm">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-[var(--text-primary)]">Data quality</h4>
        {!report && (
          <button
            onClick={load}
            disabled={loading}
            className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {loading ? "Analyzing..." : "Run analysis"}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
      {report && (
        <div className="mt-2 flex flex-col gap-2">
          {report.summary && <p className="text-[var(--text-secondary)]">{report.summary}</p>}
          <p className="text-xs text-[var(--text-muted)]">
            {report.total_rows} rows &middot; {report.duplicate_row_count} exact duplicate
            {report.duplicate_row_count === 1 ? "" : "s"}
          </p>
          <ul className="flex flex-col gap-0.5 text-xs">
            {report.columns
              .filter((c) => c.missing_count > 0)
              .map((c) => (
                <li key={c.name} className="text-[var(--text-secondary)]">
                  {c.name}: {c.missing_count} missing ({c.missing_pct}%)
                </li>
              ))}
            {report.columns.every((c) => c.missing_count === 0) && (
              <li className="text-[var(--text-muted)]">No missing values in any column.</li>
            )}
          </ul>
          <div className="flex items-center gap-2">
            {canManage && report.duplicate_row_count > 0 && (
              <button
                onClick={onRemoveDuplicates}
                disabled={cleaning}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
              >
                {cleaning ? "Removing..." : `Remove ${report.duplicate_row_count} duplicate row(s)`}
              </button>
            )}
            <button onClick={load} disabled={loading} className="text-xs text-[var(--accent)] hover:underline disabled:opacity-60">
              Re-run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DatasetsList() {
  const { user } = useAuth();
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    api.get<Dataset[]>("/datasets").then(setDatasets).catch(() => setDatasets([]));
  }, []);

  useEffect(() => {
    if (!user?.current_organization_id) return;
    api
      .get<Organization[]>("/organizations")
      .then((orgs) => {
        const role = orgs.find((o) => o.id === user.current_organization_id)?.role;
        setCanManage(role === "owner" || role === "admin");
      })
      .catch(() => {});
  }, [user?.current_organization_id]);

  return (
    <div className={`${PAGE_CONTAINER} max-w-5xl`}>
      <PageHeader
        icon="layers"
        title="Datasets"
        description="Every dataset imported from your data sources, ready to power charts."
        actions={
          <Link
            href="/data-sources"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add data
          </Link>
        }
      />

      <div className="mt-6 grid gap-3">
        {datasets === null && (
          <>
            <RowSkeleton />
            <RowSkeleton />
          </>
        )}
        {datasets?.length === 0 && (
          <EmptyState
            icon={<LayersIcon />}
            title="No datasets yet"
            description="Upload a CSV or connect a MySQL table from Data Sources to create your first dataset."
          />
        )}
        {datasets?.map((d) => {
          const isOpen = expanded === d.id;
          return (
            <div
              key={d.id}
              className={`overflow-hidden rounded-xl border bg-[var(--surface-1)] transition-colors ${
                isOpen ? "border-[var(--accent)]/40" : "border-[var(--border)] hover:border-[var(--accent)]/30"
              }`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : d.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 10h18M9 10v10" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-semibold tracking-tight text-[var(--text-primary)]">{d.name}</span>
                    <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--text-secondary)]">
                      {d.row_count.toLocaleString()} rows
                    </span>
                    <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--text-secondary)]">
                      {d.columns.length} columns
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-[var(--text-muted)]">
                    from {d.data_source?.name ?? "unknown source"}
                    <span className="hidden sm:inline">
                      {" · "}
                      {d.columns.slice(0, 5).map((c) => c.label).join(", ")}
                      {d.columns.length > 5 ? `, +${d.columns.length - 5} more` : ""}
                    </span>
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--accent)]">
                  <span className="hidden sm:inline">{isOpen ? "Hide" : "Explore"}</span>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-[var(--border)]">
                  <DatasetPreviewPanel dataset={d} />
                  <DataQualityPanel dataset={d} canManage={canManage} />
                  <RowLevelSecurityPanel dataset={d} canManage={canManage} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DatasetsPage() {
  return (
    <RequireAuth>
      <DatasetsList />
    </RequireAuth>
  );
}
