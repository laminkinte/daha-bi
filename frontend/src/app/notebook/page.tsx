"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError, type DataSource, type Dataset, type MysqlTable } from "@/lib/api";
import { PageHeader, PAGE_CONTAINER } from "@/components/PageHeader";

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
type Output =
  | { kind: "result"; grid: GridData; ms: number }
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
  if (grid.rows.length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">No rows returned.</p>;
  }
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-left text-[13px] tabular-nums">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 w-10 border-b border-r border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 text-right font-mono text-[11px] font-normal text-[var(--text-muted)]">
              #
            </th>
            {grid.columns.map((col) => (
              <th
                key={col.key}
                className="sticky top-0 z-10 whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, i) => (
            <tr key={i} className="hover:bg-[var(--accent-soft)]/40">
              <td className="sticky left-0 border-b border-r border-[var(--gridline)] bg-[var(--surface-1)] px-2 py-1.5 text-right font-mono text-[11px] text-[var(--text-muted)]">
                {i + 1}
              </td>
              {grid.columns.map((col) => {
                const v = row[col.key];
                const numeric = typeof v === "number" || (typeof v === "string" && v !== "" && !isNaN(Number(v)) && v.length < 16);
                return (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap border-b border-[var(--gridline)] px-3 py-1.5 ${
                      numeric ? "text-right" : ""
                    } ${v === null || v === undefined ? "italic text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}
                  >
                    {v === null || v === undefined ? "null" : String(v)}
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
  let label = "Results";
  let meta: string | null = null;
  if (output?.kind === "result") meta = `${output.grid.rows.length} row${output.grid.rows.length === 1 ? "" : "s"} · ${output.grid.columns.length} columns · ${output.ms} ms`;
  if (output?.kind === "text") {
    label = "Output";
    meta = `${output.ms} ms`;
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
                : error
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
        <div className="space-y-2 p-4" aria-label="Running">
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
            Tip: press <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono">Ctrl</kbd> +{" "}
            <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 font-mono">Enter</kbd> in the editor
          </p>
        </div>
      ) : output.kind === "text" ? (
        <pre className="max-h-[28rem] overflow-auto p-4 font-mono text-xs leading-5 text-[var(--text-primary)]">
          {output.text || "(no output — assign to `result` or use print())"}
        </pre>
      ) : output.kind === "preview" && output.error ? (
        <p className="p-4 text-sm text-[var(--status-critical)]">{output.error}</p>
      ) : output.kind === "preview" && !output.grid ? (
        <p className="p-4 text-sm text-[var(--text-muted)]">Loading preview…</p>
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
      setAiError(errorText(err, "Failed to generate."));
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
            {lineCount} line{lineCount === 1 ? "" : "s"}
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
          {running ? "Running…" : runLabel}
          {!running && !disabledReason && (
            <kbd className="ml-1 hidden rounded bg-white/20 px-1 font-mono text-[10px] sm:inline">Ctrl ↵</kbd>
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
          {generating ? "Writing…" : "Ask AI"}
        </button>
      </form>
      {aiError && <p className="border-b border-[var(--border)] px-3 py-1.5 text-xs text-[var(--status-critical)]">{aiError}</p>}

      <div className="flex" style={{ height }}>
        <div
          ref={gutter}
          aria-hidden
          className="shrink-0 select-none overflow-hidden border-r border-[var(--gridline)] bg-[var(--surface-2)]/60 py-3 pl-3 pr-2.5 text-right font-mono text-[12px] leading-6 text-[var(--text-muted)]"
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
          aria-label={`${language} editor`}
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
        className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-left lg:pointer-events-none"
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
    <div className="flex flex-wrap gap-1 px-3 pb-2.5 pl-9">
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
      .catch((err) => setLoadError(errorText(err, "Failed to load data sources.")));
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
      setError(errorText(err, "Query failed."));
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
      setError(errorText(err, "Failed to save dataset."));
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
        title="No database data sources yet"
        description="The SQL workbench needs a connected MySQL, PostgreSQL, or SQL Server data source to run queries against."
      />
    );
  }

  return (
    <div className={WORKBENCH_GRID}>
      <Explorer title="Explorer" summary={tables ? `${tables.length} tables` : source?.name ?? ""}>
        <div className="border-b border-[var(--border)] p-3">
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">Connection</label>
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
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Tables</p>
          {tablesError && <p className="px-3 py-2 text-xs text-[var(--status-critical)]">{tablesError}</p>}
          {!tables && !tablesError && (
            <div className="space-y-1.5 px-3 py-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-6 rounded bg-[var(--surface-2)]" />
              ))}
            </div>
          )}
          {tables?.length === 0 && <p className="px-3 py-2 text-xs text-[var(--text-muted)]">No tables in this database.</p>}
          {tables?.map((t) => {
            const open = expanded === t.table;
            return (
              <div key={t.table} className={open ? "bg-[var(--surface-2)]/50" : ""}>
                <div className="group flex items-center gap-1 pr-2">
                  <button
                    onClick={() => setExpanded(open ? null : t.table)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:text-[var(--accent)]"
                    aria-expanded={open}
                  >
                    <span className="text-[var(--text-muted)]">
                      <ChevronIcon open={open} />
                    </span>
                    <span className="text-[var(--text-muted)]">
                      <TableIcon />
                    </span>
                    <span className="truncate font-mono text-[13px]">{t.table}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">{t.columns.length}</span>
                  </button>
                </div>
                {open && (
                  <>
                    <ColumnChips columns={t.columns} />
                    <div className="flex gap-1.5 px-3 pb-3 pl-9">
                      <button
                        onClick={() => queryTable(t.table)}
                        className="inline-flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-white"
                      >
                        <PlayIcon /> Query
                      </button>
                      <button
                        onClick={() => previewTable(t.table)}
                        className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        Preview rows
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
                Saved datasets
              </p>
              {datasetsForSource.map((d) => (
                <button
                  key={d.id}
                  onClick={() => previewDataset(d)}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm text-[var(--text-primary)] hover:text-[var(--accent)]"
                  title="Preview this dataset"
                >
                  <span className="pl-[18px] text-[var(--text-muted)]">
                    <LayersIcon />
                  </span>
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">{d.row_count.toLocaleString()}</span>
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
          runLabel="Run"
          placeholder="Write a SELECT query…"
          aiPlaceholder='Describe the query, e.g. "total revenue per region, highest first"'
          onGenerate={async (prompt) => {
            const res = await api.post<{ sql: string }>(`/data-sources/${dataSourceId}/notebook/suggest-sql`, { prompt });
            setQuery(res.sql);
          }}
        />

        <OutputPanel
          output={output}
          running={running}
          error={error}
          emptyHint="Run a query to see results here."
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
                  <span className="text-xs font-medium text-[var(--status-good)]">Saved as dataset ✓</span>
                ) : (
                  <>
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Dataset name"
                      className="w-32 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)] sm:w-40"
                    />
                    <button
                      type="submit"
                      disabled={saving || !saveName.trim()}
                      className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save as dataset"}
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

const PYTHON_DEFAULT = `# df is a pandas DataFrame of this dataset's rows.
# Assign to \`result\` to display it (or just print()).
result = df.head(10)`;

function PythonWorkbench() {
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<number | "">("");
  const [code, setCode] = useState(PYTHON_DEFAULT);
  const [output, setOutput] = useState<Output>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

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
      .catch((err) => setLoadError(errorText(err, "Failed to load datasets.")));
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
      const res = await api.post<{ output: string }>(`/datasets/${datasetId}/notebook/python`, { code });
      setOutput({ kind: "text", text: res.output, ms: Math.round(now() - started) });
    } catch (err) {
      setError(errorText(err, "Python execution failed."));
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
        title="No datasets yet"
        description="Upload a CSV or connect a data source to have something for Python to analyze."
      />
    );
  }

  const selected = datasets.find((d) => d.id === datasetId);

  return (
    <div className={WORKBENCH_GRID}>
      <Explorer title="Datasets" summary={`${datasets.length} available`}>
        <div className="max-h-[22rem] overflow-y-auto py-1 lg:max-h-[calc(100vh-14rem)]">
          {datasets.map((d) => {
            const active = d.id === datasetId;
            return (
              <div key={d.id} className={active ? "bg-[var(--accent-soft)]/60" : ""}>
                <button
                  onClick={() => selectDataset(d)}
                  className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-sm ${
                    active
                      ? "border-[var(--accent)] font-medium text-[var(--accent)]"
                      : "border-transparent text-[var(--text-primary)] hover:text-[var(--accent)]"
                  }`}
                >
                  <span className={active ? "" : "text-[var(--text-muted)]"}>
                    <LayersIcon />
                  </span>
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] font-normal text-[var(--text-muted)]">
                    {d.row_count.toLocaleString()} rows
                  </span>
                </button>
                {active && <ColumnChips columns={d.columns.map((c) => c.name)} />}
              </div>
            );
          })}
        </div>
      </Explorer>

      <div className="min-w-0 space-y-4">
        {!user?.is_admin && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-xs leading-5 text-[var(--text-secondary)]">
            <span className="mt-0.5 shrink-0 text-[var(--text-muted)]">
              <LockIcon />
            </span>
            <p>
              <strong className="font-semibold text-[var(--text-primary)]">Python is limited to administrators</strong> on this
              server for security. You can still explore and preview datasets here, and use the SQL tab or AI Chat to analyze
              your data.
            </p>
          </div>
        )}

        <CodeCell
          language="Python"
          value={code}
          onChange={setCode}
          onRun={run}
          running={running}
          runLabel="Run"
          placeholder="Write Python… your data is available as the pandas DataFrame `df`"
          aiPlaceholder='Describe the analysis, e.g. "average revenue per product, sorted descending"'
          onGenerate={async (prompt) => {
            const res = await api.post<{ code: string }>(`/datasets/${datasetId}/notebook/suggest-python`, { prompt });
            setCode(res.code);
          }}
        />

        <OutputPanel
          output={output}
          running={running}
          error={error}
          emptyHint={selected ? `Run your code against “${selected.name}”.` : "Pick a dataset to start."}
          actions={
            output?.kind === "text" && selected ? (
              <button
                onClick={() => preview(selected)}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Show data
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
        title="Notebook"
        description="Query a connected database with SQL, or analyze any dataset with Python."
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
