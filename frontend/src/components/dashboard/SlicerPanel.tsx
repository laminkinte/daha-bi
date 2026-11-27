"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type ChartFilter } from "@/lib/api";

/** What one slicer currently has selected: a set of values, or a date range. Empty = "All". */
export type SlicerSelection = { kind: "in"; values: string[] } | { kind: "range"; from: string; to: string };

export type SlicerColumn = { name: string; label: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function isActive(sel: SlicerSelection | undefined): boolean {
  if (!sel) return false;
  return sel.kind === "in" ? sel.values.length > 0 : !!(sel.from || sel.to);
}

function nextDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Turns the panel's selections into the chart-data filters every chart understands. */
export function selectionsToFilters(selections: Record<string, SlicerSelection>): ChartFilter[] {
  const filters: ChartFilter[] = [];
  for (const [field, sel] of Object.entries(selections)) {
    if (sel.kind === "in" && sel.values.length > 0) filters.push({ field, operator: "in", value: sel.values });
    if (sel.kind === "range") {
      if (sel.from) filters.push({ field, operator: ">=", value: sel.from });
      // "< next day" keeps datetimes on the last day (e.g. "2025-03-31 18:00") inside the range.
      if (sel.to) filters.push({ field, operator: "<", value: nextDay(sel.to) });
    }
  }
  return filters;
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z" />
    </svg>
  );
}

const CONTROL =
  "flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-left text-sm text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--baseline)] focus-visible:border-[var(--accent)]";

/** Range presets are anchored to the newest date in the data, not today — datasets are often historical. */
function rangePresets(maxDate: string): { label: string; from: string; to: string }[] {
  const end = new Date(`${maxDate.slice(0, 10)}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const back = (days: number) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - days + 1);
    return iso(d);
  };
  const to = iso(end);
  return [
    { label: "Last 30 days", from: back(30), to },
    { label: "Last 90 days", from: back(90), to },
    { label: "Last 12 months", from: back(365), to },
    { label: `Year ${end.getUTCFullYear()}`, from: `${end.getUTCFullYear()}-01-01`, to },
  ];
}

function Slicer({
  dashboardId,
  column,
  selection,
  onChange,
  onRemove,
}: {
  dashboardId: number;
  column: SlicerColumn;
  selection: SlicerSelection | undefined;
  onChange: (sel: SlicerSelection | undefined) => void;
  onRemove?: () => void;
}) {
  const [values, setValues] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getRetrying<{ values: string[] }>(`/dashboards/${dashboardId}/slicer-values?field=${encodeURIComponent(column.name)}`)
      .then((r) => !cancelled && setValues(r.values))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : "Couldn't load values."));
    return () => {
      cancelled = true;
    };
  }, [dashboardId, column.name]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isDate = !!values && values.length > 0 && values.every((v) => DATE_RE.test(v));
  const active = isActive(selection);
  const picked = selection?.kind === "in" ? selection.values : [];
  const shown = useMemo(
    () => (values ?? []).filter((v) => v.toLowerCase().includes(query.trim().toLowerCase())),
    [values, query],
  );

  function toggle(v: string) {
    const next = picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v];
    onChange(next.length ? { kind: "in", values: next } : undefined);
  }

  const summary = picked.length === 0 ? "All" : picked.length === 1 ? picked[0] : `${picked.length} selected`;

  return (
    <div ref={box} className="relative min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-[var(--text-secondary)]" title={column.label}>
          {column.label}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {active && (
            <button onClick={() => onChange(undefined)} className="text-[11px] font-medium text-[var(--accent)] hover:underline">
              Clear
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              title="Remove this filter from the dashboard"
              aria-label={`Remove ${column.label} filter`}
              className="text-[var(--text-muted)] hover:text-[var(--status-critical)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </span>
      </div>

      {error ? (
        <p className="text-xs text-[var(--status-critical)]">{error}</p>
      ) : values === null ? (
        <div className="h-9 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      ) : isDate ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {(["from", "to"] as const).map((end) => (
              <input
                key={end}
                type="date"
                aria-label={`${column.label} ${end}`}
                min={values[0].slice(0, 10)}
                max={values[values.length - 1].slice(0, 10)}
                value={selection?.kind === "range" ? selection[end] : ""}
                onChange={(e) => {
                  const cur = selection?.kind === "range" ? selection : { kind: "range" as const, from: "", to: "" };
                  const next = { ...cur, [end]: e.target.value };
                  onChange(next.from || next.to ? next : undefined);
                }}
                className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {rangePresets(values[values.length - 1]).map((p) => {
              const on = selection?.kind === "range" && selection.from === p.from && selection.to === p.to;
              return (
                <button
                  key={p.label}
                  onClick={() => onChange(on ? undefined : { kind: "range", from: p.from, to: p.to })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={`${CONTROL} ${active ? "border-[var(--accent)]/60 bg-[var(--accent-soft)]/40" : ""}`}
          >
            <span className={`truncate ${active ? "font-medium" : ""}`}>{summary}</span>
            <span className="shrink-0 text-[var(--text-muted)]">
              <ChevronDown />
            </span>
          </button>
          {open && (
            <div className="absolute left-0 right-0 top-full z-40 mt-1.5 min-w-[14rem] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-pop)]">
              {values.length > 8 && (
                <div className="border-b border-[var(--border)] p-2">
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${column.label.toLowerCase()}…`}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                  />
                </div>
              )}
              <div role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto p-1">
                <button
                  onClick={() => onChange(undefined)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[var(--surface-2)]"
                >
                  <Check on={picked.length === 0} />
                  <span className="font-medium">All</span>
                </button>
                {shown.map((v) => (
                  <button
                    key={v}
                    role="option"
                    aria-selected={picked.includes(v)}
                    onClick={() => toggle(v)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                  >
                    <Check on={picked.includes(v)} />
                    <span className="truncate">{v}</span>
                  </button>
                ))}
                {shown.length === 0 && <p className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">No matches.</p>}
              </div>
              {values.length === 200 && (
                <p className="border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--text-muted)]">Showing the first 200 values.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        on ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--baseline)]"
      }`}
    >
      {on && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 5 5 9-10" />
        </svg>
      )}
    </span>
  );
}

/**
 * Dashboard-wide filter panel (slicers). Each slicer filters every chart whose dataset has that
 * field. Editors choose which fields appear; that choice is saved with the dashboard, while the
 * selected values stay per viewer.
 */
export default function SlicerPanel({
  dashboardId,
  slicers,
  columns,
  selections,
  canEdit,
  onSelect,
  onSlicersChange,
  onReset,
}: {
  dashboardId: number;
  slicers: string[];
  columns: SlicerColumn[];
  selections: Record<string, SlicerSelection>;
  canEdit: boolean;
  onSelect: (field: string, sel: SlicerSelection | undefined) => void;
  onSlicersChange: (fields: string[]) => void;
  onReset: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const available = columns.filter((c) => !slicers.includes(c.name));
  const activeCount = slicers.filter((f) => isActive(selections[f])).length;

  return (
    // A filter bar across the top of the dashboard: the charts keep the full width below it.
    <aside className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 shadow-[var(--shadow-card)] lg:flex-row lg:items-start">
      <div className="flex shrink-0 items-center justify-between gap-3 lg:w-28 lg:flex-col lg:items-start lg:gap-1 lg:pt-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <span className="text-[var(--accent)]">
            <FilterIcon />
          </span>
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 py-px text-[10px] font-semibold text-white">{activeCount}</span>
          )}
        </h2>
        {activeCount > 0 && (
          <button onClick={onReset} className="text-xs font-medium text-[var(--accent)] hover:underline">
            Reset all
          </button>
        )}
      </div>

      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {slicers.map((field) => {
          const column = columns.find((c) => c.name === field) ?? { name: field, label: field.replace(/_/g, " ") };
          return (
            <Slicer
              key={field}
              dashboardId={dashboardId}
              column={column}
              selection={selections[field]}
              onChange={(sel) => onSelect(field, sel)}
              onRemove={canEdit ? () => onSlicersChange(slicers.filter((f) => f !== field)) : undefined}
            />
          );
        })}

        {slicers.length === 0 && (
          <p className="text-xs leading-5 text-[var(--text-muted)] sm:col-span-2 lg:col-span-2">
            {canEdit
              ? "Add a filter to slice every chart on this dashboard at once — by region, product, date…"
              : "No filters have been set up for this dashboard."}
          </p>
        )}

        {canEdit && slicers.length < 8 && available.length > 0 && (
          // Lines up with the controls beside it (below their labels).
          <div className={slicers.length ? "sm:pt-[22px]" : "sm:col-span-2"}>
            {adding ? (
              <select
                autoFocus
                defaultValue=""
                onBlur={() => setAdding(false)}
                onChange={(e) => {
                  if (e.target.value) onSlicersChange([...slicers, e.target.value]);
                  setAdding(false);
                }}
                className="w-full rounded-lg border border-[var(--accent)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none"
              >
                <option value="">Choose a field…</option>
                {available.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--accent)]/60 hover:text-[var(--accent)]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add filter
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
