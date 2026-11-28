"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError, type DataSource, type Dataset, type MysqlTable } from "@/lib/api";
import { PageHeader, PAGE_CONTAINER } from "@/components/PageHeader";
import { useT, uiLocaleTag } from "@/i18n/ui";

/* ───────────────────────────── icons ───────────────────────────── */

const svg = (size: number, body: ReactNode, fill = false) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ? "currentColor" : "none"}
    stroke={fill ? "none" : "currentColor"}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {body}
  </svg>
);
const CodeIcon = () => svg(28, <path d="m8 4-6 8 6 8M16 4l6 8-6 8" />);
const PlayIcon = () => svg(11, <path d="M6 4l14 8-14 8V4Z" />, true);
const SparkleIcon = () => svg(14, <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />, true);
const TableIcon = () =>
  svg(
    15,
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10" />
    </>,
  );
const LayersIcon = () => svg(15, <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />);
const ChevronIcon = ({ open }: { open: boolean }) => (
  <span className={`inline-flex transition-transform ${open ? "rotate-90" : ""}`}>{svg(12, <path d="m9 6 6 6-6 6" />)}</span>
);
const LockIcon = () =>
  svg(
    14,
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>,
  );

/* ─────────────────────────── shared bits ─────────────────────────── */

type GridColumn = { key: string; label: string };
type GridData = { columns: GridColumn[]; rows: Record<string, unknown>[] };

/** What the bottom panel is currently showing: a query/script result, or a preview of a table/dataset. */
/** What the sandboxed Python runner returns (see resources/python/runner.py). */
type PyRun = {
  ok: boolean;
  stdout: string;
  result:
    | { type: "table"; columns: string[]; rows: Record<string, unknown>[]; total_rows: number; truncated: boolean }
    | { type: "text"; value: string }
    | { type: "json"; value: unknown }
    | null;
  figures: string[];
  error: { type: string; message: string; where: string[] } | null;
  duration_ms: number;
  rows_loaded: number;
};

type Output =
  | { kind: "result"; grid: GridData; ms: number }
  | { kind: "python"; run: PyRun; ms: number }
  | { kind: "text"; text: string; ms: number }
  | { kind: "preview"; title: string; grid: GridData | null; error?: string }
  | null;

const SELECT_CLASS =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

/** Wall-clock timer for "ran in N ms"; only ever called from event handlers. */
const now = () => performance.now();

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Data grid with a row-number gutter, sticky header and right-aligned numbers. */
function DataGrid({ grid }: { grid: GridData }) {
  const tr = useT();
  if (grid.rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">{tr("No rows returned.")}</p>;
  }
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-start text-[13px] tabular-nums">
        <thead>
          <tr>
            <th className="sticky start-0 top-0 z-20 w-10 border-b border-e border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 text-end font-mono text-[11px] font-normal text-[var(--text-muted)]">
              #
            </th>
            {grid.columns.map((col) => (
              <th
                key={col.key}
                className="sticky top-0 z-10 whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
              >
                {tr(col.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, i) => (
            <tr key={i} className="hover:bg-[var(--accent-soft)]/40">
              <td className="sticky start-0 border-b border-e border-[var(--gridline)] bg-[var(--surface-1)] px-2 py-1.5 text-end font-mono text-[11px] text-[var(--text-muted)]">
                {i + 1}
              </td>
              {grid.columns.map((col) => {
                const v = row[col.key];
                const numeric = typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)) && v.length < 16);
                return (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap border-b border-[var(--gridline)] px-3 py-1.5 ${
                      numeric ? "text-end" : ""
                    } ${v === null || v === undefined ? "italic text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}
                  >
                    {v === null || v === undefined ? tr("null") : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A Python cell's result: error, printed output, the `result` value, and any charts. */
function PythonRunView({ run }: { run: PyRun }) {
  const tr = useT();
  const r = run.result;
  const nothing = run.ok && !r && !run.stdout && run.figures.length === 0;
  return (
    <div className="divide-y divide-[var(--border)]">
      {run.error && (
        <div className="bg-[var(--status-critical)]/5 p-4">
          <p className="font-mono text-sm font-semibold text-[var(--status-critical)]">
            {run.error.type}: <span className="font-normal">{run.error.message}</span>
          </p>
          {run.error.where.map((w, i) => (
            <p key={i} className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
              {w}
            </p>
          ))}
          {run.error.type === "KeyError" && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">{tr("Tip: column names are case-sensitive. Check the list on the left.")}</p>
          )}
        </div>
      )}
      {run.stdout && <pre className="max-h-64 overflow-auto p-4 font-mono text-xs leading-5 text-[var(--text-primary)]">{run.stdout}</pre>}
      {r?.type === "table" && <DataGrid grid={{ columns: r.columns.map((c) => ({ key: c, label: c })), rows: r.rows }} />}
      {r?.type === "text" && <pre className="max-h-64 overflow-auto p-4 font-mono text-sm text-[var(--text-primary)]">{r.value}</pre>}
      {r?.type === "json" && <pre className="max-h-64 overflow-auto p-4 font-mono text-xs text-[var(--text-primary)]">{JSON.stringify(r.value, null, 2)}</pre>}
      {run.figures.length > 0 && (
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {run.figures.map((png, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- base64 chart rendered by matplotlib
            <img key={i} src={`data:image/png;base64,${png}`} alt={tr("Chart {v0}", { v0: i + 1 })} className="w-full rounded-lg border border-[var(--border)] bg-white" />
          ))}
        </div>
      )}
      {nothing && (
        <p className="p-4 text-sm text-[var(--text-muted)]">
          {tr("Ran fine, but there is nothing to show. Assign a value to")} <code>{tr("result")}</code>{tr(", use print(), or draw a chart with plt.")}
        </p>
      )}
    </div>
  );
}

/** Bottom panel: results of the last run, a preview, or a hint when nothing has run yet. */
function OutputPanel({
  output,
  running,
  error,
  emptyHint,
  actions,
}: {
  output: Output;
  running: boolean;
  error: string | null;
  emptyHint: string;
  actions?: ReactNode;
}) {
  const tr = useT();
  let label = tr("Results");
  let meta: string | null = null;
  if (output?.kind === "result") meta = `${output.grid.rows.length} row${output.grid.rows.length === 1 ? "" : "s"} · ${output.grid.columns.length} columns · ${output.ms} ms`;
  if (output?.kind === "text") {
    label = tr("Output");
    meta = `${output.ms} ms`;
  }
  if (output?.kind === "python") {
    label = output.run.ok ? tr("Output") : tr("Error");
    const r = output.run.result;
    meta = [
      r?.type === "table" ? `${r.total_rows.toLocaleString(uiLocaleTag())} row${r.total_rows === 1 ? "" : "s"}${r.truncated ? ` (showing ${r.rows.length})` : ""}` : null,
      `ran on ${output.run.rows_loaded.toLocaleString(uiLocaleTag())} rows`,
      `${output.ms} ms`,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (output?.kind === "preview") {
    label = `Preview · ${output.title}`;
    if (output.grid) meta = `first ${output.grid.rows.length} rows`;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              running
                ? "animate-pulse bg-[var(--status-warning)]"
                : error || (output?.kind === "python" && !output.run.ok)
                  ? "bg-[var(--status-critical)]"
                  : output
                    ? "bg-[var(--status-good)]"
                    : "bg-[var(--border)]"
            }`}
          />
          <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{label}</h2>
          {meta && !running && <span className="truncate text-[11px] text-[var(--text-muted)]">{meta}</span>}
        </div>
        {actions}
      </header>

      {running ? (
        <div className="space-y-2 p-4" aria-label={tr("Running")}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-5 rounded bg-[var(--surface-2)]" style={{ width: `${90 - i * 12}%` }} />
          ))}
        </div>
      ) : error ? (
        <pre className="overflow-x-auto whitespace-pre-wrap bg-[var(--status-critical)]/5 p-4 font-mono text-xs leading-5 text-[var(--status-critical)]">
          {error}
        </pre>
      ) : !output ? (
        <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
          <span className="text-[var(--text-muted)]">{svg(22, <path d="M4 5h16M4 12h16M4 19h10" />)}</span>
          <p className="text-sm text-[var(--text-secondary)]">{emptyHint}</p>
          <p className="hidden text-xs text-[var(--text-muted)] sm:block">
            {tr("Tip: press")} <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono">{tr("Ctrl")}</kbd> +{" "}
            <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono">{tr("Enter")}</kbd> {tr("in the editor")}
          </p>
        </div>
      ) : output.kind === "python" ? (
        <PythonRunView run={output.run} />
      ) : output.kind === "text" ? (
        <pre className="max-h-[28rem] overflow-auto p-4 font-mono text-xs leading-5 text-[var(--text-primary)]">
          {tr(output.text) || tr("(no output — assign to `result` or use print())")}
        </pre>
      ) : output.kind === "preview" && output.error ? (
        <p className="p-4 text-sm text-[var(--status-critical)]">{output.error}</p>
      ) : output.kind === "preview" && !output.grid ? (
        <p className="p-4 text-sm text-[var(--text-muted)]">{tr("Loading preview…")}</p>
      ) : (
        <DataGrid grid={output.grid!} />
      )}
    </section>
  );
}

/**
 * Editor cell: header (language, line count, Run), an optional "Ask AI" row, and a code area with a
 * line-number gutter. Ctrl/Cmd+Enter runs; Tab indents instead of leaving the field.
 */
function CodeCell({
  language,
  value,
  onChange,
  onRun,
  running,
  runLabel,
  placeholder,
  aiPlaceholder,
  onGenerate,
  disabledReason,
}: {
  language: string;
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  running: boolean;
  runLabel: string;
  placeholder: string;
  aiPlaceholder: string;
  onGenerate: (prompt: string) => Promise<void>;
  disabledReason?: string;
}) {
  const tr = useT();
  const gutter = useRef<HTMLDivElement>(null);
  const lineCount = Math.max(1, value.split("\n").length);
  const height = Math.min(432, Math.max(216, (lineCount + 1) * 24 + 24));

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setAiError(null);
    try {
      await onGenerate(prompt.trim());
      setPrompt("");
    } catch (err) {
      setAiError(errorText(err, tr("Failed to generate.")));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm focus-within:border-[var(--accent)]/60">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
            {language}
          </span>
          <span className="truncate text-[11px] text-[var(--text-muted)]">
            {lineCount} {tr("line")}{lineCount === 1 ? "" : tr("s")}
          </span>
        </div>
        <button
          onClick={onRun}
          disabled={running || !!disabledReason}
          title={disabledReason}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-50"
        >
          {running ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
          ) : disabledReason ? (
            <LockIcon />
          ) : (
            <PlayIcon />
          )}
          {running ? tr("Running…") : runLabel}
          {!running && !disabledReason && (
            <kbd className="ms-1 hidden rounded bg-white/20 px-1 font-mono text-[10px] sm:inline">{tr("Ctrl ↵")}</kbd>
          )}
        </button>
      </header>

      <form onSubmit={generate} className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="shrink-0 text-[var(--accent)]">
          <SparkleIcon />
        </span>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={aiPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || generating}
          className="shrink-0 rounded-md border border-[var(--accent)]/40 px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
        >
          {generating ? tr("Writing…") : tr("Ask AI")}
        </button>
      </form>
      {aiError && <p className="border-b border-[var(--border)] px-3 py-1.5 text-xs text-[var(--status-critical)]">{aiError}</p>}

      <div className="flex" style={{ height }}>
        <div
          ref={gutter}
          aria-hidden
          className="shrink-0 select-none overflow-hidden border-e border-[var(--gridline)] bg-[var(--surface-2)]/60 py-3 ps-3 pe-2.5 text-end font-mono text-[12px] leading-6 text-[var(--text-muted)]"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              if (!running && !disabledReason) onRun();
            } else if (e.key === "Tab" && !e.shiftKey) {
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: s, selectionEnd: end } = el;
              onChange(value.slice(0, s) + "    " + value.slice(end));
              requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
            }
          }}
          placeholder={placeholder}
          wrap="off"
          spellCheck={false}
          aria-label={tr("{language} editor", { language: language })}
          className="block min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-3 font-mono text-[13px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:outline-none"
        />
      </div>
    </section>
  );
}

/** Left-hand explorer card. On phones it collapses behind a toggle so the editor stays in reach. */
function Explorer({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm lg:sticky lg:top-6 lg:self-start">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-start lg:pointer-events-none"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{title}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          {summary}
          <span className="lg:hidden">
            <ChevronIcon open={open} />
          </span>
        </span>
      </button>
      <div className={`${open ? "block" : "hidden"} lg:block`}>{children}</div>
    </aside>
  );
}

function ColumnChips({ columns }: { columns: string[] }) {
  return (
    <div className="flex flex-wrap gap-1 px-3 pb-2.5 ps-9">
      {columns.map((c) => (
        <span
          key={c}
          className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]"
        >
          {c}
        </span>
      ))}
    </div>
  );
}

const WORKBENCH_GRID = "grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]";

/* ─────────────────────────── SQL workbench ─────────────────────────── */

// Real, immediately-runnable default content. Schema-agnostic so it works on MySQL, PostgreSQL and
// SQL Server alike; the explorer gives a precise table list.
const SQL_DEFAULT = `-- Lists every table and column reachable from this connection.
-- Pick a table on the left, or ask AI to write a query for you.
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
ORDER BY table_schema, table_name, ordinal_position`;

function SqlWorkbench() {
  const tr = useT();
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataSourceId, setDataSourceId] = useState<number | "">("");
  const [tables, setTables] = useState<MysqlTable[] | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [allDatasets, setAllDatasets] = useState<Dataset[]>([]);

  const [query, setQuery] = useState(SQL_DEFAULT);
  // The last query we filled in ourselves; while the editor still holds it, switching connection may replace it.
  const autoQuery = useRef(SQL_DEFAULT);
  const [output, setOutput] = useState<Output>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function loadTables(id: number) {
    setTables(null);
    setTablesError(null);
    setExpanded(null);
    api
      .getRetrying<MysqlTable[]>(`/data-sources/${id}/tables`)
      .then((list) => {
        setTables(list);
        const starter = list[0] ? `-- Pick a table on the left, or ask AI to write a query for you.
SELECT *
FROM ${list[0].table}` : SQL_DEFAULT;
        const previous = autoQuery.current; // captured now: the updater below runs on the next render
        autoQuery.current = starter;
        setQuery((q) => (q === previous ? starter : q));
      })
      .catch((err) => setTablesError(errorText(err, "Failed to load tables.")));
  }

  useEffect(() => {
    api
      .getRetrying<DataSource[]>("/data-sources")
      .then((all) => {
        const databaseSources = all.filter((s) => s.type !== "csv" && s.type !== "rest_api");
        setSources(databaseSources);
        if (databaseSources[0]) {
          setDataSourceId(databaseSources[0].id);
          loadTables(databaseSources[0].id);
        }
      })
      .catch((err) => setLoadError(errorText(err, tr("Failed to load data sources."))));
    api.getRetrying<Dataset[]>("/datasets").then(setAllDatasets).catch(() => {});
  }, []);

  const source = sources?.find((s) => s.id === dataSourceId);
  const datasetsForSource = allDatasets.filter((d) => d.data_source?.id === dataSourceId);

  function selectSource(id: number) {
    setDataSourceId(id);
    setOutput(null);
    setError(null);
    loadTables(id);
  }

  async function run(sql = query) {
    if (!dataSourceId || !sql.trim()) return;
    autoQuery.current = ""; // once something has run, never swap the editor contents underneath the user
    setRunning(true);
    setError(null);
    setSaved(false);
    const started = now();
    try {
      const res = await api.post<{ columns: string[]; rows: Record<string, unknown>[] }>(
        `/data-sources/${dataSourceId}/notebook/run`,
        { query: sql },
      );
      setOutput({
        kind: "result",
        grid: { columns: res.columns.map((c) => ({ key: c, label: c })), rows: res.rows },
        ms: Math.round(now() - started),
      });
    } catch (err) {
      setError(errorText(err, tr("Query failed.")));
      setOutput(null);
    } finally {
      setRunning(false);
    }
  }

  function queryTable(table: string) {
    const sql = `SELECT *\nFROM ${table}`;
    setQuery(sql);
    run(sql);
  }

  function previewTable(table: string) {
    if (!dataSourceId) return;
    setError(null);
    setOutput({ kind: "preview", title: table, grid: null });
    api
      .getRetrying<{ columns: string[]; rows: Record<string, unknown>[] }>(
        `/data-sources/${dataSourceId}/tables/${encodeURIComponent(table)}/preview`,
      )
      .then((p) =>
        setOutput({ kind: "preview", title: table, grid: { columns: p.columns.map((c) => ({ key: c, label: c })), rows: p.rows } }),
      )
      .catch((err) => setOutput({ kind: "preview", title: table, grid: null, error: errorText(err, "Failed to load preview.") }));
  }

  function previewDataset(d: Dataset) {
    setError(null);
    setOutput({ kind: "preview", title: d.name, grid: null });
    api
      .getRetrying<{ columns: { name: string; label: string }[]; rows: Record<string, unknown>[] }>(`/datasets/${d.id}/preview`)
      .then((p) =>
        setOutput({ kind: "preview", title: d.name, grid: { columns: p.columns.map((c) => ({ key: c.name, label: c.label })), rows: p.rows } }),
      )
      .catch((err) => setOutput({ kind: "preview", title: d.name, grid: null, error: errorText(err, "Failed to load preview.") }));
  }

  async function saveAsDataset() {
    if (!dataSourceId || !query.trim() || !saveName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/data-sources/${dataSourceId}/notebook/save`, { query, name: saveName });
      setSaved(true);
      setSaveName("");
      api.get<Dataset[]>("/datasets").then(setAllDatasets).catch(() => {});
    } catch (err) {
      setError(errorText(err, tr("Failed to save dataset.")));
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <p className="text-sm text-[var(--status-critical)]">{loadError}</p>;
  if (!sources) return <WorkbenchSkeleton />;
  if (sources.length === 0) {
    return (
      <EmptyState
        icon={<CodeIcon />}
        title={tr("No database data sources yet")}
        description={tr("The SQL workbench needs a connected MySQL, PostgreSQL, or SQL Server data source to run queries against.")}
      />
    );
  }

  return (
    <div className={WORKBENCH_GRID}>
      <Explorer title={tr("Explorer")} summary={tables ? tr("{length} tables", { length: tables.length }) : source?.name ?? ""}>
        <div className="border-b border-[var(--border)] p-3">
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">{tr("Connection")}</label>
          <select value={dataSourceId} onChange={(e) => selectSource(Number(e.target.value))} className={SELECT_CLASS}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {source && (
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-wide text-[var(--text-muted)]">{source.type}</p>
          )}
        </div>

        <div className="max-h-[22rem] overflow-y-auto py-1 lg:max-h-[calc(100vh-20rem)]">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{tr("Tables")}</p>
          {tablesError && <p className="px-3 py-2 text-xs text-[var(--status-critical)]">{tablesError}</p>}
          {!tables && !tablesError && (
            <div className="space-y-1.5 px-3 py-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-6 rounded bg-[var(--surface-2)]" />
              ))}
            </div>
          )}
          {tables?.length === 0 && <p className="px-3 py-2 text-xs text-[var(--text-muted)]">{tr("No tables in this database.")}</p>}
          {tables?.map((t) => {
            const open = expanded === t.table;
            return (
              <div key={t.table} className={open ? "bg-[var(--surface-2)]/50" : ""}>
                <div className="group flex items-center gap-1 pe-2">
                  <button
                    onClick={() => setExpanded(open ? null : t.table)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-1.5 text-start text-sm text-[var(--text-primary)] hover:text-[var(--accent)]"
                    aria-expanded={open}
                  >
                    <span className="text-[var(--text-muted)]">
                      <ChevronIcon open={open} />
                    </span>
                    <span className="text-[var(--text-muted)]">
                      <TableIcon />
                    </span>
                    <span className="truncate font-mono text-[13px]">{t.table}</span>
                    <span className="ms-auto shrink-0 text-[11px] text-[var(--text-muted)]">{t.columns.length}</span>
                  </button>
                </div>
                {open && (
                  <>
                    <ColumnChips columns={t.columns} />
                    <div className="flex gap-1.5 px-3 pb-3 ps-9">
                      <button
                        onClick={() => queryTable(t.table)}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-white"
                      >
                        <PlayIcon /> {tr("Query")}
                      </button>
                      <button
                        onClick={() => previewTable(t.table)}
                        className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {tr("Preview rows")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {datasetsForSource.length > 0 && (
            <>
              <p className="mt-2 border-t border-[var(--border)] px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {tr("Saved datasets")}
              </p>
              {datasetsForSource.map((d) => (
                <button
                  key={d.id}
                  onClick={() => previewDataset(d)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-start text-sm text-[var(--text-primary)] hover:text-[var(--accent)]"
                  title={tr("Preview this dataset")}
                >
                  <span className="ps-[18px] text-[var(--text-muted)]">
                    <LayersIcon />
                  </span>
                  <span className="truncate">{d.name}</span>
                  <span className="ms-auto shrink-0 text-[11px] text-[var(--text-muted)]">{d.row_count.toLocaleString(uiLocaleTag())}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </Explorer>

      <div className="min-w-0 space-y-4">
        <CodeCell
          language="SQL"
          value={query}
          onChange={setQuery}
          onRun={() => run()}
          running={running}
          runLabel={tr("Run")}
          placeholder={tr("Write a SELECT query…")}
          aiPlaceholder={tr("Describe the query, e.g. \"total revenue per region, highest first\"")}
          onGenerate={async (prompt) => {
            const res = await api.post<{ sql: string }>(`/data-sources/${dataSourceId}/notebook/suggest-sql`, { prompt });
            setQuery(res.sql);
          }}
        />

        <OutputPanel
          output={output}
          running={running}
          error={error}
          emptyHint={tr("Run a query to see results here.")}
          actions={
            output?.kind === "result" && output.grid.rows.length > 0 ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveAsDataset();
                }}
                className="flex items-center gap-1.5"
              >
                {saved ? (
                  <span className="text-xs font-medium text-[var(--status-good)]">{tr("Saved as dataset ✓")}</span>
                ) : (
                  <>
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder={tr("Dataset name")}
                      className="w-32 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)] sm:w-40"
                    />
                    <button
                      type="submit"
                      disabled={saving || !saveName.trim()}
                      className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      {saving ? tr("Saving…") : tr("Save as dataset")}
                    </button>
                  </>
                )}
              </form>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

/* ─────────────────────────── Python workbench ─────────────────────────── */

const PYTHON_DEFAULT = `# df is a pandas DataFrame of this dataset (pd, np and plt are ready to use).
# Assign to \`result\` to show a table, print() for text, or draw a chart with plt.
result = df.describe(include="all").T`;

/** One-click starters that adapt to the dataset's own numeric, text and date-like columns. */
function pythonExamples(cols: string[]): { label: string; code: string }[] {
  // Whole-word name matching ("count" must not match "country").
  const word = (re: string) => new RegExp(`(^|_)(${re})(_|$)`, "i");
  const isNum = word("revenue|sales|amount|total|price|value|quantity|qty|profit|cost|count|units|spend|income");
  const isCat = word("country|region|city|state|category|product|channel|status|type|segment|method|name|brand|store");
  const date = cols.find((c) => word("date|time|day|month|created|updated|at").test(c));
  const num =
    ["revenue", "sales", "amount", "total"].map((n) => cols.find((c) => word(n).test(c))).find(Boolean) ??
    cols.find((c) => isNum.test(c) && !/(^|_)id$/i.test(c)) ??
    "value";
  const cat = cols.find((c) => isCat.test(c)) ?? cols.find((c) => c !== num && c !== date) ?? "category";
  const list: { label: string; code: string }[] = [
    { label: "Summary statistics", code: 'result = df.describe(include="all").T' },
    {
      label: `Top 10 ${cat} by ${num}`,
      code: `result = (df.groupby("${cat}")["${num}"].sum()\n          .sort_values(ascending=False).head(10))`,
    },
    {
      label: `Bar chart of ${num} by ${cat}`,
      code: `top = df.groupby("${cat}")["${num}"].sum().sort_values().tail(10)\nax = top.plot(kind="barh", figsize=(8, 4), color="#0b7a5e", title="${num} by ${cat}")\nax.set_xlabel("${num}")\nresult = top.sort_values(ascending=False)`,
    },
    { label: "Missing values", code: 'result = df.isna().sum().rename("missing").to_frame().assign(pct=lambda t: (100 * t.missing / len(df)).round(1))' },
  ];
  if (date) {
    list.splice(3, 0, {
      label: `Monthly trend of ${num}`,
      code: `monthly = (df.assign(month=pd.to_datetime(df["${date}"], errors="coerce").dt.to_period("M").astype(str))\n             .groupby("month")["${num}"].sum())\nmonthly.plot(figsize=(8, 3.5), marker="o", color="#0b7a5e", title="Monthly ${num}")\nresult = monthly`,
    });
  }
  return list;
}

function PythonWorkbench() {
  const tr = useT();
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<number | "">("");
  const [code, setCode] = useState(PYTHON_DEFAULT);
  const [output, setOutput] = useState<Output>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ allowed: boolean; reason: string | null } | null>(null);

  useEffect(() => {
    api
      .get<{ allowed: boolean; reason: string | null }>("/notebook/python-status")
      .then(setStatus)
      .catch(() => setStatus({ allowed: false, reason: "unknown" }));
  }, []);

  function preview(d: Dataset) {
    setError(null);
    setOutput({ kind: "preview", title: d.name, grid: null });
    api
      .getRetrying<{ columns: { name: string; label: string }[]; rows: Record<string, unknown>[] }>(`/datasets/${d.id}/preview`)
      .then((p) =>
        setOutput({ kind: "preview", title: d.name, grid: { columns: p.columns.map((c) => ({ key: c.name, label: c.label })), rows: p.rows } }),
      )
      .catch((err) => setOutput({ kind: "preview", title: d.name, grid: null, error: errorText(err, "Failed to load preview.") }));
  }

  useEffect(() => {
    api
      .getRetrying<Dataset[]>("/datasets")
      .then((all) => {
        setDatasets(all);
        if (all[0]) {
          setDatasetId(all[0].id);
          preview(all[0]);
        }
      })
      .catch((err) => setLoadError(errorText(err, tr("Failed to load datasets."))));
  }, []);

  function selectDataset(d: Dataset) {
    setDatasetId(d.id);
    preview(d);
  }

  async function run() {
    if (!datasetId || !code.trim()) return;
    setRunning(true);
    setError(null);
    const started = now();
    try {
      const res = await api.post<{ output: string; run?: PyRun }>(`/datasets/${datasetId}/notebook/python`, { code });
      setOutput(
        res.run
          ? { kind: "python", run: res.run, ms: Math.round(now() - started) }
          : { kind: "text", text: res.output, ms: Math.round(now() - started) },
      );
    } catch (err) {
      setError(errorText(err, tr("Python execution failed.")));
    } finally {
      setRunning(false);
    }
  }

  if (loadError) return <p className="text-sm text-[var(--status-critical)]">{loadError}</p>;
  if (!datasets) return <WorkbenchSkeleton />;
  if (datasets.length === 0) {
    return (
      <EmptyState
        icon={<CodeIcon />}
        title={tr("No datasets yet")}
        description={tr("Upload a CSV or connect a data source to have something for Python to analyze.")}
      />
    );
  }

  const selected = datasets.find((d) => d.id === datasetId);

  return (
    <div className={WORKBENCH_GRID}>
      <Explorer title={tr("Datasets")} summary={tr("{length} available", { length: datasets.length })}>
        <div className="max-h-[22rem] overflow-y-auto py-1 lg:max-h-[calc(100vh-14rem)]">
          {datasets.map((d) => {
            const active = d.id === datasetId;
            return (
              <div key={d.id} className={active ? "bg-[var(--accent-soft)]/60" : ""}>
                <button
                  onClick={() => selectDataset(d)}
                  className={`flex w-full items-center gap-2 border-s-2 px-3 py-2 text-start text-sm ${
                    active
                      ? "border-[var(--accent)] font-medium text-[var(--accent)]"
                      : "border-transparent text-[var(--text-primary)] hover:text-[var(--accent)]"
                  }`}
                >
                  <span className={active ? "" : "text-[var(--text-muted)]"}>
                    <LayersIcon />
                  </span>
                  <span className="truncate">{d.name}</span>
                  <span className="ms-auto shrink-0 text-[11px] font-normal text-[var(--text-muted)]">
                    {d.row_count.toLocaleString(uiLocaleTag())} {tr("rows")}
                  </span>
                </button>
                {active && <ColumnChips columns={d.columns.map((c) => c.name)} />}
              </div>
            );
          })}
        </div>
      </Explorer>

      <div className="min-w-0 space-y-4">
        {status && !status.allowed && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
            <span className="mt-0.5 shrink-0 text-[var(--text-muted)]">
              <LockIcon />
            </span>
            <p>
              <strong className="font-semibold text-[var(--text-primary)]">
                {status.reason === "disabled" ? tr("Python is turned off on this server.") : tr("Python is limited to platform administrators on this server.")}
              </strong>{" "}
              {tr("You can still explore and preview datasets here, and use the SQL tab or AI Chat to analyze your data.")}
            </p>
          </div>
        )}
        {status?.allowed && selected && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">{tr("Try:")}</span>
            {pythonExamples(selected.columns.map((c) => c.name)).map((ex) => (
              <button
                key={ex.label}
                onClick={() => setCode(ex.code)}
                className="max-w-[16rem] truncate rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {tr(ex.label)}
              </button>
            ))}
          </div>
        )}

        <CodeCell
          language="Python"
          value={code}
          onChange={setCode}
          onRun={run}
          running={running}
          runLabel={tr("Run")}
          placeholder={tr("Write Python… your data is available as the pandas DataFrame `df`")}
          aiPlaceholder={tr("Describe the analysis, e.g. \"average revenue per product, sorted descending\"")}
          onGenerate={async (prompt) => {
            const res = await api.post<{ code: string }>(`/datasets/${datasetId}/notebook/suggest-python`, { prompt });
            setCode(res.code);
          }}
        />

        <OutputPanel
          output={output}
          running={running}
          error={error}
          emptyHint={selected ? tr("Run your code against “{name}”.", { name: selected.name }) : tr("Pick a dataset to start.")}
          actions={
            (output?.kind === "text" || output?.kind === "python") && selected ? (
              <button
                onClick={() => preview(selected)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {tr("Show data")}
              </button>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

function WorkbenchSkeleton() {
  return (
    <div className={WORKBENCH_GRID}>
      <div className="h-64 animate-pulse rounded-xl bg-[var(--surface-2)]" />
      <div className="space-y-4">
        <div className="h-72 animate-pulse rounded-xl bg-[var(--surface-2)]" />
        <div className="h-40 animate-pulse rounded-xl bg-[var(--surface-2)]" />
      </div>
    </div>
  );
}

/* ─────────────────────────────── page ─────────────────────────────── */

function Notebook() {
  const tr = useT();
  const [mode, setMode] = useState<"sql" | "python">("sql");

  const tab = (value: "sql" | "python", label: string) => (
    <button
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
        mode === value
          ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm"
          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`${PAGE_CONTAINER} max-w-7xl`}>
      <PageHeader
        icon="notebook"
        title={tr("Notebook")}
        description={tr("Query a connected database with SQL, or analyze any dataset with Python.")}
        actions={
          <div className="inline-flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1">
            {tab("sql", "SQL")}
            {tab("python", "Python")}
          </div>
        }
      />

      <div className="mt-6">{mode === "sql" ? <SqlWorkbench /> : <PythonWorkbench />}</div>
    </div>
  );
}

export default function NotebookPage() {
  return (
    <RequireAuth>
      <Notebook />
    </RequireAuth>
  );
}
