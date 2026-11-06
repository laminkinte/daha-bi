"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { RowSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  api,
  ApiError,
  type DatabaseDriver,
  type DataSource,
  type MysqlTable,
  type RestApiAuthType,
  type RestApiHeader,
} from "@/lib/api";
import TableRowsPreview from "@/components/TableRowsPreview";
import { PageHeader, PAGE_CONTAINER } from "@/components/PageHeader";

const DEFAULT_PORTS: Record<DatabaseDriver, string> = { mysql: "3306", postgres: "5432", sqlserver: "1433" };
const DRIVER_LABELS: Record<DatabaseDriver, string> = { mysql: "MySQL", postgres: "PostgreSQL", sqlserver: "SQL Server" };

function DatabaseIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

function StatusBadge({ status }: { status: DataSource["status"] }) {
  const colors: Record<DataSource["status"], string> = {
    ready: "var(--status-good)",
    syncing: "var(--status-warning)",
    pending: "var(--text-muted)",
    failed: "var(--status-critical)",
  };
  const color = colors[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "syncing" ? "animate-pulse" : ""}`}
        style={{ background: color }}
      />
      {status}
    </span>
  );
}

type ConnectorKey = "csv" | DatabaseDriver | "rest_api";

/** Recognisable mark per connector type (monogram tile — no third-party logos). */
const CONNECTOR_META: Record<string, { mark: string; tint: string; blurb: string }> = {
  csv: { mark: "CSV", tint: "#1baf7a", blurb: "File upload" },
  mysql: { mark: "My", tint: "#2a78d6", blurb: "Live database" },
  postgres: { mark: "Pg", tint: "#4a3aa7", blurb: "Live database" },
  sqlserver: { mark: "SQL", tint: "#e34948", blurb: "Live database" },
  rest_api: { mark: "API", tint: "#eb6834", blurb: "JSON endpoint" },
  data_model: { mark: "DM", tint: "#898781", blurb: "Built from a data model" },
};

function ConnectorMark({ type, size = 36 }: { type: string; size?: number }) {
  const meta = CONNECTOR_META[type] ?? { mark: type.slice(0, 3).toUpperCase(), tint: "#898781" };
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-tight"
      style={{
        width: size,
        height: size,
        // Blend toward the theme's text color so dark tints stay legible in dark mode.
        color: `color-mix(in srgb, ${meta.tint} 72%, var(--text-primary))`,
        background: `color-mix(in srgb, ${meta.tint} 14%, transparent)`,
      }}
    >
      {meta.mark}
    </span>
  );
}

function CsvUploadForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !name.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("type", "csv");
      form.append("name", name);
      form.append("file", file);
      await api.post("/data-sources", form);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to upload file.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-sm text-[var(--text-secondary)]">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-[var(--text-secondary)]">CSV or Excel file</label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="w-full text-sm"
          required
        />
      </div>
      {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Uploading..." : "Upload file"}
      </button>
    </form>
  );
}

function DatabaseConnectForm({ driver, onDone }: { driver: DatabaseDriver; onDone: () => void }) {
  const [mode, setMode] = useState<"table" | "query">("table");
  const [form, setForm] = useState({
    name: "",
    host: "127.0.0.1",
    port: DEFAULT_PORTS[driver],
    database: "",
    username: "",
    password: "",
    table: "",
    query: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { table, query, ...rest } = form;
      await api.post("/data-sources", {
        type: driver,
        ...rest,
        ...(mode === "table" ? { table } : { query }),
        port: Number(form.port),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to connect to ${DRIVER_LABELS[driver]}.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 text-sm">
      <div className="col-span-2">
        <label className="mb-1 block text-[var(--text-secondary)]">Name</label>
        <input
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-[var(--text-secondary)]">Host</label>
        <input
          value={form.host}
          onChange={(e) => update("host", e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-[var(--text-secondary)]">Port</label>
        <input
          value={form.port}
          onChange={(e) => update("port", e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-[var(--text-secondary)]">Database</label>
        <input
          value={form.database}
          onChange={(e) => update("database", e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-[var(--text-secondary)]">Username</label>
        <input
          value={form.username}
          onChange={(e) => update("username", e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          required
        />
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-[var(--text-secondary)]">Password</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </div>

      <div className="col-span-2 flex gap-1 rounded-md bg-[var(--page-plane)] p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode("table")}
          className={`flex-1 rounded py-1.5 ${mode === "table" ? "bg-[var(--surface-1)] font-medium text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)]"}`}
        >
          Pick a table
        </button>
        <button
          type="button"
          onClick={() => setMode("query")}
          className={`flex-1 rounded py-1.5 ${mode === "query" ? "bg-[var(--surface-1)] font-medium text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)]"}`}
        >
          Write SQL query
        </button>
      </div>

      {mode === "table" ? (
        <div className="col-span-2">
          <label className="mb-1 block text-[var(--text-secondary)]">Table</label>
          <input
            value={form.table}
            onChange={(e) => update("table", e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            required
          />
        </div>
      ) : (
        <div className="col-span-2">
          <label className="mb-1 block text-[var(--text-secondary)]">
            SQL query <span className="text-[var(--text-muted)]">(SELECT only)</span>
          </label>
          <textarea
            value={form.query}
            onChange={(e) => update("query", e.target.value)}
            rows={4}
            placeholder="SELECT region, SUM(revenue) AS total FROM sales GROUP BY region"
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
            required
          />
        </div>
      )}

      {error && <p className="col-span-2 text-[var(--status-critical)]">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="col-span-2 self-start rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Connecting..." : "Connect & Import"}
      </button>
    </form>
  );
}

function RestApiHeaderFields({ headers, onChange }: { headers: RestApiHeader[]; onChange: (h: RestApiHeader[]) => void }) {
  return (
    <div className="col-span-2">
      <label className="mb-1 block text-[var(--text-secondary)]">Headers (optional)</label>
      {headers.map((h, i) => (
        <div key={i} className="mb-1.5 flex gap-1.5">
          <input
            value={h.key}
            onChange={(e) => onChange(headers.map((row, j) => (j === i ? { ...row, key: e.target.value } : row)))}
            placeholder="Header name"
            className="w-1/2 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs"
          />
          <input
            value={h.value}
            onChange={(e) => onChange(headers.map((row, j) => (j === i ? { ...row, value: e.target.value } : row)))}
            placeholder="Value"
            className="w-1/2 rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(headers.filter((_, j) => j !== i))}
            className="text-[var(--text-muted)] hover:text-[var(--status-critical)]"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...headers, { key: "", value: "" }])}
        className="text-xs text-[var(--accent)] hover:underline"
      >
        + Add header
      </button>
    </div>
  );
}

function RestApiAuthFields({
  authType,
  setAuthType,
  authToken,
  setAuthToken,
  authHeaderName,
  setAuthHeaderName,
  basicUsername,
  setBasicUsername,
  basicPassword,
  setBasicPassword,
  passwordPlaceholder,
}: {
  authType: RestApiAuthType;
  setAuthType: (v: RestApiAuthType) => void;
  authToken: string;
  setAuthToken: (v: string) => void;
  authHeaderName: string;
  setAuthHeaderName: (v: string) => void;
  basicUsername: string;
  setBasicUsername: (v: string) => void;
  basicPassword: string;
  setBasicPassword: (v: string) => void;
  passwordPlaceholder?: string;
}) {
  return (
    <>
      <div className="col-span-2">
        <label className="mb-1 block text-[var(--text-secondary)]">Authentication</label>
        <select
          value={authType}
          onChange={(e) => setAuthType(e.target.value as RestApiAuthType)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
        >
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="api_key">API key header</option>
          <option value="basic">Basic auth</option>
        </select>
      </div>
      {(authType === "bearer" || authType === "api_key") && (
        <>
          {authType === "api_key" && (
            <div>
              <label className="mb-1 block text-[var(--text-secondary)]">Header name</label>
              <input
                value={authHeaderName}
                onChange={(e) => setAuthHeaderName(e.target.value)}
                placeholder="X-API-Key"
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              />
            </div>
          )}
          <div className={authType === "api_key" ? "" : "col-span-2"}>
            <label className="mb-1 block text-[var(--text-secondary)]">{authType === "bearer" ? "Token" : "Key"}</label>
            <input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder={passwordPlaceholder}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </div>
        </>
      )}
      {authType === "basic" && (
        <>
          <div>
            <label className="mb-1 block text-[var(--text-secondary)]">Username</label>
            <input
              value={basicUsername}
              onChange={(e) => setBasicUsername(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-[var(--text-secondary)]">Password</label>
            <input
              type="password"
              value={basicPassword}
              onChange={(e) => setBasicPassword(e.target.value)}
              placeholder={passwordPlaceholder}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </div>
        </>
      )}
    </>
  );
}

function RestApiConnectForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [headers, setHeaders] = useState<RestApiHeader[]>([]);
  const [authType, setAuthType] = useState<RestApiAuthType>("none");
  const [authToken, setAuthToken] = useState("");
  const [authHeaderName, setAuthHeaderName] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/data-sources", {
        type: "rest_api",
        name,
        url,
        method,
        headers,
        auth_type: authType,
        auth_token: authToken,
        auth_header_name: authHeaderName,
        basic_username: basicUsername,
        basic_password: basicPassword,
        json_path: jsonPath,
        body: method === "POST" ? body : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to connect to the API.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 text-sm">
      <div className="col-span-2">
        <label className="mb-1 block text-[var(--text-secondary)]">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          required
        />
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-[var(--text-secondary)]">Endpoint URL</label>
        <div className="flex gap-2">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as "GET" | "POST")}
            className="rounded-md border border-[var(--border)] bg-transparent px-2 py-2"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/records"
            className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            required
          />
        </div>
      </div>

      <RestApiHeaderFields headers={headers} onChange={setHeaders} />

      <RestApiAuthFields
        authType={authType}
        setAuthType={setAuthType}
        authToken={authToken}
        setAuthToken={setAuthToken}
        authHeaderName={authHeaderName}
        setAuthHeaderName={setAuthHeaderName}
        basicUsername={basicUsername}
        setBasicUsername={setBasicUsername}
        basicPassword={basicPassword}
        setBasicPassword={setBasicPassword}
      />

      {method === "POST" && (
        <div className="col-span-2">
          <label className="mb-1 block text-[var(--text-secondary)]">Request body (JSON, optional)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder='{"key": "value"}'
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
          />
        </div>
      )}

      <div className="col-span-2">
        <label className="mb-1 block text-[var(--text-secondary)]">
          JSON path to records <span className="text-[var(--text-muted)]">(optional — leave blank if the response is already a list)</span>
        </label>
        <input
          value={jsonPath}
          onChange={(e) => setJsonPath(e.target.value)}
          placeholder="e.g. data.results"
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
        />
      </div>

      {error && <p className="col-span-2 text-[var(--status-critical)]">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="col-span-2 self-start rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Connecting..." : "Connect & Import"}
      </button>
    </form>
  );
}

function EditDataSourceForm({ dataSource, onDone, onCancel }: { dataSource: DataSource; onDone: () => void; onCancel: () => void }) {
  const [loaded, setLoaded] = useState<DataSource | null>(dataSource.type === "csv" ? dataSource : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"table" | "query">("table");
  const [name, setName] = useState(dataSource.name);
  const isRestApi = dataSource.type === "rest_api";
  const isDatabase = dataSource.type !== "csv" && !isRestApi;
  const [form, setForm] = useState({
    host: "",
    port: isDatabase ? DEFAULT_PORTS[dataSource.type as DatabaseDriver] : "",
    database: "",
    username: "",
    password: "",
    table: "",
    query: "",
  });
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [headers, setHeaders] = useState<RestApiHeader[]>([]);
  const [authType, setAuthType] = useState<RestApiAuthType>("none");
  const [authToken, setAuthToken] = useState("");
  const [authHeaderName, setAuthHeaderName] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");
  const [jsonPath, setJsonPath] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    api
      .get<DataSource>(`/data-sources/${dataSource.id}`)
      .then((full) => {
        setLoaded(full);
        const c = full.connection;
        if (!c) return;
        if (isRestApi) {
          setUrl(c.url ?? "");
          setMethod(c.method ?? "GET");
          setHeaders(c.headers ?? []);
          setAuthType(c.auth_type ?? "none");
          setAuthHeaderName(c.auth_header_name ?? "");
          setBasicUsername(c.basic_username ?? "");
          setJsonPath(c.json_path ?? "");
          setBody(c.body ?? "");
        } else {
          setForm({
            host: c.host ?? "",
            port: String(c.port ?? ""),
            database: c.database ?? "",
            username: c.username ?? "",
            password: "",
            table: c.table ?? "",
            query: c.query ?? "",
          });
          setMode(c.query ? "query" : "table");
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load connection details."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource.id]);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (dataSource.type === "csv") {
        await api.put(`/data-sources/${dataSource.id}`, { name });
      } else if (isRestApi) {
        await api.put(`/data-sources/${dataSource.id}`, {
          name,
          url,
          method,
          headers,
          auth_type: authType,
          auth_token: authToken,
          auth_header_name: authHeaderName,
          basic_username: basicUsername,
          basic_password: basicPassword,
          json_path: jsonPath,
          body: method === "POST" ? body : undefined,
        });
      } else {
        const { table, query, ...rest } = form;
        await api.put(`/data-sources/${dataSource.id}`, {
          name,
          ...rest,
          port: Number(form.port),
          ...(mode === "table" ? { table } : { query }),
        });
      }
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Failed to update ${isDatabase ? DRIVER_LABELS[dataSource.type as DatabaseDriver] : "data"} source.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return <p className="mt-3 text-sm text-[var(--status-critical)]">{loadError}</p>;
  }

  if (!loaded) {
    return <p className="mt-3 text-sm text-[var(--text-muted)]">Loading connection details...</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-[var(--border)] bg-[var(--page-plane)] p-3 text-sm">
      <div className="col-span-2">
        <label className="mb-1 block text-[var(--text-secondary)]">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
          required
        />
      </div>

      {isDatabase && (
        <>
          <div>
            <label className="mb-1 block text-[var(--text-secondary)]">Host</label>
            <input
              value={form.host}
              onChange={(e) => update("host", e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[var(--text-secondary)]">Port</label>
            <input
              value={form.port}
              onChange={(e) => update("port", e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[var(--text-secondary)]">Database</label>
            <input
              value={form.database}
              onChange={(e) => update("database", e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-[var(--text-secondary)]">Username</label>
            <input
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
              required
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-[var(--text-secondary)]">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Leave blank to keep the current password"
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </div>

          <div className="col-span-2 flex gap-1 rounded-md bg-[var(--surface-1)] p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("table")}
              className={`flex-1 rounded py-1.5 ${mode === "table" ? "bg-[var(--page-plane)] font-medium text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)]"}`}
            >
              Pick a table
            </button>
            <button
              type="button"
              onClick={() => setMode("query")}
              className={`flex-1 rounded py-1.5 ${mode === "query" ? "bg-[var(--page-plane)] font-medium text-[var(--accent)] shadow-sm" : "text-[var(--text-muted)]"}`}
            >
              Write SQL query
            </button>
          </div>

          {mode === "table" ? (
            <div className="col-span-2">
              <label className="mb-1 block text-[var(--text-secondary)]">Table</label>
              <input
                value={form.table}
                onChange={(e) => update("table", e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
                required
              />
            </div>
          ) : (
            <div className="col-span-2">
              <label className="mb-1 block text-[var(--text-secondary)]">
                SQL query <span className="text-[var(--text-muted)]">(SELECT only)</span>
              </label>
              <textarea
                value={form.query}
                onChange={(e) => update("query", e.target.value)}
                rows={4}
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
                required
              />
            </div>
          )}
        </>
      )}

      {isRestApi && (
        <>
          <div className="col-span-2">
            <label className="mb-1 block text-[var(--text-secondary)]">Endpoint URL</label>
            <div className="flex gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as "GET" | "POST")}
                className="rounded-md border border-[var(--border)] bg-transparent px-2 py-2"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/records"
                className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
                required
              />
            </div>
          </div>

          <RestApiHeaderFields headers={headers} onChange={setHeaders} />

          <RestApiAuthFields
            authType={authType}
            setAuthType={setAuthType}
            authToken={authToken}
            setAuthToken={setAuthToken}
            authHeaderName={authHeaderName}
            setAuthHeaderName={setAuthHeaderName}
            basicUsername={basicUsername}
            setBasicUsername={setBasicUsername}
            basicPassword={basicPassword}
            setBasicPassword={setBasicPassword}
            passwordPlaceholder="Leave blank to keep the current value"
          />

          {method === "POST" && (
            <div className="col-span-2">
              <label className="mb-1 block text-[var(--text-secondary)]">Request body (JSON, optional)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder='{"key": "value"}'
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
              />
            </div>
          )}

          <div className="col-span-2">
            <label className="mb-1 block text-[var(--text-secondary)]">
              JSON path to records <span className="text-[var(--text-muted)]">(optional)</span>
            </label>
            <input
              value={jsonPath}
              onChange={(e) => setJsonPath(e.target.value)}
              placeholder="e.g. data.results"
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2"
            />
          </div>
        </>
      )}

      {error && <p className="col-span-2 text-[var(--status-critical)]">{error}</p>}
      <div className="col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-[var(--text-secondary)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function TablesBrowser({ dataSourceId }: { dataSourceId: number }) {
  const [tables, setTables] = useState<MysqlTable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api
      .getRetrying<MysqlTable[]>(`/data-sources/${dataSourceId}/tables`)
      .then(setTables)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load tables."));
  }, [dataSourceId]);

  return (
    <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--page-plane)] p-3 text-xs">
      {error && <p className="text-[var(--status-critical)]">{error}</p>}
      {!tables && !error && <p className="text-[var(--text-muted)]">Loading tables...</p>}
      {tables?.length === 0 && <p className="text-[var(--text-muted)]">No tables found in this database.</p>}
      {tables && tables.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {tables.map((t) => (
            <div key={t.table}>
              <button
                onClick={() => setExpanded((e) => (e === t.table ? null : t.table))}
                className="text-left font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
              >
                {t.table}
              </button>
              <div className="text-[var(--text-muted)]">{t.columns.join(", ")}</div>
              {expanded === t.table && (
                <div className="mt-1.5">
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

function DataSourcesList() {
  const [sources, setSources] = useState<DataSource[] | null>(null);
  const [tab, setTab] = useState<"csv" | DatabaseDriver | "rest_api">("csv");
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  function load() {
    api.get<DataSource[]>("/data-sources").then(setSources).catch(() => setSources([]));
  }

  useEffect(load, []);

  async function onDelete(id: number) {
    if (!confirm("Delete this data source and its datasets?")) return;
    setActionError(null);
    try {
      await api.del(`/data-sources/${id}`);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete data source.");
    }
  }

  async function onResync(id: number) {
    setActionError(null);
    try {
      await api.post(`/data-sources/${id}/resync`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to resync data source.");
    } finally {
      load();
    }
  }

  return (
    <div className={`${PAGE_CONTAINER} max-w-5xl`}>
      <PageHeader
        icon="database"
        title="Data Sources"
        description="Connect a CSV/Excel upload, a live database (MySQL, PostgreSQL, SQL Server) or a REST API to power your dashboards."
      />

      <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Add a data source</h2>
        <div className="mb-5 mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(["csv", ...(Object.keys(DRIVER_LABELS) as DatabaseDriver[]), "rest_api"] as ConnectorKey[]).map((key) => {
            const selected = tab === key;
            const label = key === "csv" ? "CSV / Excel" : key === "rest_api" ? "REST API" : DRIVER_LABELS[key as DatabaseDriver];
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-pressed={selected}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                    : "border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-2)]"
                }`}
              >
                <ConnectorMark type={key} size={34} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{label}</span>
                  <span className="hidden truncate text-[11px] text-[var(--text-muted)] sm:block">{CONNECTOR_META[key]?.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        {tab === "csv" ? (
          <CsvUploadForm onDone={load} />
        ) : tab === "rest_api" ? (
          <RestApiConnectForm onDone={load} />
        ) : (
          <DatabaseConnectForm driver={tab} onDone={load} />
        )}
      </div>

      {actionError && (
        <p className="mt-4 text-sm text-[var(--status-critical)]">{actionError}</p>
      )}

      {sources && sources.length > 0 && (
        <h2 className="mt-8 text-sm font-semibold text-[var(--text-primary)]">
          Connected <span className="ml-1 font-normal text-[var(--text-muted)]">{sources.length}</span>
        </h2>
      )}
      <div className="mt-3 grid gap-3">
        {sources === null && (
          <>
            <RowSkeleton />
            <RowSkeleton />
          </>
        )}
        {sources?.length === 0 && (
          <EmptyState
            icon={<DatabaseIcon />}
            title="No data sources yet"
            description="Upload a CSV or connect a database table above to get started."
          />
        )}
        {sources?.map((s) => (
          <div
            key={s.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3.5 transition-colors hover:border-[var(--accent)]/30"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <ConnectorMark type={s.type} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold tracking-tight text-[var(--text-primary)]">{s.name}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {(DRIVER_LABELS as Record<string, string>)[s.type] ?? (s.type === "rest_api" ? "REST API" : s.type.toUpperCase())}
                    {" · "}
                    {s.datasets_count ?? 0} dataset{s.datasets_count === 1 ? "" : "s"}
                  </div>
                  {s.error_message && (
                    <div className="mt-1 text-xs text-[var(--status-critical)]">{s.error_message}</div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.type !== "csv" && s.type !== "rest_api" && (
                  <button
                    onClick={() => setExpandedTables((e) => (e === s.id ? null : s.id))}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      expandedTables === s.id
                        ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {expandedTables === s.id ? "Hide tables" : "Tables"}
                  </button>
                )}
                {s.type !== "csv" && (
                  <button
                    onClick={() => onResync(s.id)}
                    disabled={s.status === "syncing"}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-60"
                  >
                    {s.status === "syncing" ? "Syncing…" : "Resync"}
                  </button>
                )}
                <button
                  onClick={() => setEditing((e) => (e === s.id ? null : s.id))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    editing === s.id
                      ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {editing === s.id ? "Cancel" : "Edit"}
                </button>
                <button
                  onClick={() => onDelete(s.id)}
                  className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-[var(--status-critical)] transition-colors hover:bg-[var(--status-critical)]/10"
                >
                  Delete
                </button>
              </div>
            </div>
            {expandedTables === s.id && <TablesBrowser dataSourceId={s.id} />}
            {editing === s.id && (
              <EditDataSourceForm
                dataSource={s}
                onCancel={() => setEditing(null)}
                onDone={() => {
                  setEditing(null);
                  load();
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DataSourcesPage() {
  return (
    <RequireAuth>
      <DataSourcesList />
    </RequireAuth>
  );
}
