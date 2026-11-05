"use client";

import { useEffect, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError, type DataSource, type Dataset, type MysqlTable } from "@/lib/api";
import DatasetPreviewToggle from "@/components/DatasetPreviewToggle";
import TableRowsPreview from "@/components/TableRowsPreview";

function CodeIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m8 4-6 8 6 8M16 4l6 8-6 8" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
    </svg>
  );
}

function AiSuggestBox({ placeholder, onGenerate }: { placeholder: string; onGenerate: (prompt: string) => Promise<void> }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onGenerate(prompt.trim());
      setPrompt("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-3 py-2"
      >
        <span className="shrink-0 text-[var(--accent)]">
          <SparkleIcon />
        </span>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || loading}
          className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-[var(--status-critical)]">{error}</p>}
    </div>
  );
}

type QueryResult = { columns: string[]; rows: Record<string, unknown>[] };

// Pre-filled as real, immediately-runnable default content (not just
// placeholder hint text) — schema-agnostic so it works regardless of which
// data source/dataset is selected, and shows real results on first click.
// DATABASE()/current schema filtering differs by engine (MySQL/Postgres/SQL Server), so this
// starter query deliberately omits it — works unmodified on all three, just less scoped on a
// MySQL server hosting multiple databases. Use the schema browser above for a precise table list.
const SQL_DEFAULT = `-- Lists every table and column reachable from this connection.
-- Replace with your own query once you know what's there.
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
ORDER BY table_schema, table_name, ordinal_position`;

const PYTHON_DEFAULT = `# df is a pandas DataFrame of this dataset's rows.
# Assign to \`result\` to display it (or just print()).
result = df.head(10)`;

function SchemaBrowser({
  dataSourceId,
  onInsert,
}: {
  dataSourceId: number | "";
  onInsert: (table: string) => void;
}) {
  const [tables, setTables] = useState<MysqlTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!dataSourceId) return;
    setTables(null);
    setError(null);
    api
      .getRetrying<MysqlTable[]>(`/data-sources/${dataSourceId}/tables`)
      .then(setTables)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load tables."));
  }, [dataSourceId]);

  if (!dataSourceId) return null;

  return (
    <div className="mt-3">
      <button onClick={() => setShow((s) => !s)} className="text-xs font-medium text-[var(--accent)]">
        {show ? "Hide" : "Show"} tables in this database
      </button>
      {show && (
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-[var(--border)] p-2">
          {error && <p className="p-2 text-sm text-[var(--status-critical)]">{error}</p>}
          {!tables && !error && <p className="p-2 text-sm text-[var(--text-muted)]">Loading tables...</p>}
          {tables && tables.length === 0 && (
            <p className="p-2 text-sm text-[var(--text-muted)]">No tables found in this database.</p>
          )}
          {tables?.map((t) => (
            <div key={t.table} className="border-b border-[var(--gridline)] last:border-0">
              <div className="flex items-center justify-between gap-2 py-1.5">
                <button
                  onClick={() => setExpanded((e) => (e === t.table ? null : t.table))}
                  className="text-left text-sm font-medium text-[var(--text-primary)]"
                >
                  {t.table}{" "}
                  <span className="text-xs font-normal text-[var(--text-muted)]">
                    ({t.columns.length} column{t.columns.length === 1 ? "" : "s"})
                  </span>
                </button>
                <button
                  onClick={() => onInsert(t.table)}
                  className="shrink-0 rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/10"
                >
                  Use
                </button>
              </div>
              {expanded === t.table && (
                <div className="mb-2">
                  <p className="mb-1.5 text-xs text-[var(--text-muted)]">{t.columns.join(", ")}</p>
                  <TableRowsPreview dataSourceId={dataSourceId} table={t.table} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SqlWorkbench() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataSourceId, setDataSourceId] = useState<number | "">("");
  const [allDatasets, setAllDatasets] = useState<Dataset[]>([]);
  const [previewDatasetId, setPreviewDatasetId] = useState<number | "">("");
  const [query, setQuery] = useState(SQL_DEFAULT);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getRetrying<DataSource[]>("/data-sources")
      .then((all) => {
        const databaseSources = all.filter((s) => s.type !== "csv");
        setSources(databaseSources);
        if (databaseSources[0]) setDataSourceId(databaseSources[0].id);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load data sources."))
      .finally(() => setSourcesLoaded(true));
    api.getRetrying<Dataset[]>("/datasets").then(setAllDatasets).catch(() => {});
  }, []);

  const datasetsForSource = allDatasets.filter((d) => d.data_source?.id === dataSourceId);

  useEffect(() => {
    setPreviewDatasetId(datasetsForSource[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSourceId, allDatasets]);

  async function run() {
    if (!dataSourceId || !query.trim()) return;
    setRunning(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.post<QueryResult>(`/data-sources/${dataSourceId}/notebook/run`, { query });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Query failed.");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  async function saveAsDataset() {
    if (!dataSourceId || !query.trim() || !saveName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/data-sources/${dataSourceId}/notebook/save`, { query, name: saveName });
      setSaved(true);
      setSaveName("");
      api.get<Dataset[]>("/datasets").then(setAllDatasets);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save dataset.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-[var(--status-critical)]">{loadError}</p>;
  }

  if (!sourcesLoaded) {
    return <p className="text-sm text-[var(--text-muted)]">Loading...</p>;
  }

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
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            Data source
          </label>
          <select
            value={dataSourceId}
            onChange={(e) => setDataSourceId(Number(e.target.value))}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {datasetsForSource.length > 0 && (
          <div className="w-64">
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Preview dataset
            </label>
            <select
              value={previewDatasetId}
              onChange={(e) => setPreviewDatasetId(Number(e.target.value))}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
            >
              {datasetsForSource.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <SchemaBrowser dataSourceId={dataSourceId} onInsert={(table) => setQuery(`SELECT *\nFROM ${table}`)} />

      <DatasetPreviewToggle datasetId={previewDatasetId} />

      {dataSourceId && (
        <AiSuggestBox
          placeholder='Ask AI: e.g. "total revenue per region, highest first"'
          onGenerate={async (prompt) => {
            const res = await api.post<{ sql: string }>(`/data-sources/${dataSourceId}/notebook/suggest-sql`, { prompt });
            setQuery(res.sql);
          }}
        />
      )}

      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Write a SELECT query..."
        rows={8}
        spellCheck={false}
        className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={running}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {running ? "Running..." : "Run query"}
        </button>

        {result && (
          <div className="flex items-center gap-2">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Dataset name"
              className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={saveAsDataset}
              disabled={saving || !saveName.trim()}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save as dataset"}
            </button>
          </div>
        )}
        {saved && <span className="text-sm text-[var(--status-good)]">Saved.</span>}
      </div>

      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}

      {result && (
        <div className="mt-4 overflow-x-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-left text-sm tabular-nums">
            <thead>
              <tr className="border-b border-[var(--baseline)] bg-[var(--page-plane)]">
                {result.columns.map((col) => (
                  <th key={col} className="whitespace-nowrap px-3 py-2 font-medium text-[var(--text-secondary)]">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--gridline)]">
                  {result.columns.map((col) => (
                    <td key={col} className="whitespace-nowrap px-3 py-2 text-[var(--text-primary)]">
                      {String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {result.rows.length === 0 && (
            <p className="p-4 text-center text-sm text-[var(--text-muted)]">No rows returned.</p>
          )}
        </div>
      )}
    </div>
  );
}

function PythonWorkbench() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetsLoaded, setDatasetsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [datasetId, setDatasetId] = useState<number | "">("");
  const [code, setCode] = useState(PYTHON_DEFAULT);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRetrying<Dataset[]>("/datasets")
      .then((all) => {
        setDatasets(all);
        if (all[0]) setDatasetId(all[0].id);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load datasets."))
      .finally(() => setDatasetsLoaded(true));
  }, []);

  async function run() {
    if (!datasetId || !code.trim()) return;
    setRunning(true);
    setError(null);
    setOutput(null);
    try {
      const res = await api.post<{ output: string }>(`/datasets/${datasetId}/notebook/python`, { code });
      setOutput(res.output);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Python execution failed.");
    } finally {
      setRunning(false);
    }
  }

  if (loadError) {
    return <p className="text-sm text-[var(--status-critical)]">{loadError}</p>;
  }

  if (!datasetsLoaded) {
    return <p className="text-sm text-[var(--text-muted)]">Loading...</p>;
  }

  if (datasets.length === 0) {
    return (
      <EmptyState
        icon={<CodeIcon />}
        title="No datasets yet"
        description="Upload a CSV or connect a data source to have something for Python to analyze."
      />
    );
  }

  return (
    <div>
      <div className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-3 py-2 text-xs text-[var(--text-muted)]">
        Runs on your local machine with no sandbox — the same privileges as your own user account. Fine for
        personal local use; do not expose this to other people without adding real isolation first.
      </div>

      <div className="mt-3 w-64">
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Dataset</label>
        <select
          value={datasetId}
          onChange={(e) => setDatasetId(Number(e.target.value))}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 outline-none focus:border-[var(--accent)]"
        >
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <DatasetPreviewToggle datasetId={datasetId} />

      {datasetId && (
        <AiSuggestBox
          placeholder='Ask AI: e.g. "average revenue per product, sorted descending"'
          onGenerate={async (prompt) => {
            const res = await api.post<{ code: string }>(`/datasets/${datasetId}/notebook/suggest-python`, { prompt });
            setCode(res.code);
          }}
        />
      )}

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Write Python..."
        rows={8}
        spellCheck={false}
        className="mt-3 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--accent)]"
      />

      <button
        onClick={run}
        disabled={running}
        className="mt-3 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {running ? "Running..." : "Run Python"}
      </button>

      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}

      {output !== null && (
        <pre className="mt-4 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--page-plane)] p-3 text-xs text-[var(--text-primary)]">
          {output || "(no output — assign to `result` or use print())"}
        </pre>
      )}
    </div>
  );
}

function Notebook() {
  const [mode, setMode] = useState<"sql" | "python">("sql");

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Notebook</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Run SQL against a connected data source, or Python over any dataset.
      </p>

      <div className="mt-6 inline-flex gap-1 rounded-md bg-[var(--surface-1)] border border-[var(--border)] p-1 text-sm">
        <button
          onClick={() => setMode("sql")}
          className={`rounded px-4 py-1.5 ${mode === "sql" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)]"}`}
        >
          SQL
        </button>
        <button
          onClick={() => setMode("python")}
          className={`rounded px-4 py-1.5 ${mode === "python" ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)]"}`}
        >
          Python
        </button>
      </div>

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
