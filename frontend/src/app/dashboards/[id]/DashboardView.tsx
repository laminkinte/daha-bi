"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import ChartCard from "@/components/charts/ChartCard";
import DatasetPreviewToggle from "@/components/DatasetPreviewToggle";
import { Skeleton, CardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  api,
  ApiError,
  type Chart,
  type ChartFilter,
  type ChartType,
  type Collaborator,
  type Dashboard,
  type Dataset,
  type ReportSchedule,
} from "@/lib/api";
import { CURRENCIES, type ValueFormat } from "@/lib/format-value";
import { downloadDashboardPdf } from "@/lib/dashboard-export";

function ChartIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-6 4 3 5-8" />
    </svg>
  );
}

const CHART_TYPES: { value: ChartType; label: string; needsFields: boolean }[] = [
  { value: "bar", label: "Bar", needsFields: true },
  { value: "line", label: "Line", needsFields: true },
  { value: "pie", label: "Pie", needsFields: true },
  { value: "kpi", label: "KPI", needsFields: false },
  { value: "table", label: "Table", needsFields: false },
  { value: "scatter", label: "Scatter", needsFields: false },
  { value: "heatmap", label: "Heatmap", needsFields: true },
  { value: "geo_map", label: "Geo map", needsFields: true },
];

const AGGREGATIONS = ["sum", "avg", "count", "count_distinct", "min", "max"];
const AGG_LABELS: Record<string, string> = { count_distinct: "distinct count" };

function AddChartForm({
  dashboardId,
  datasets,
  onCreated,
}: {
  dashboardId: number;
  datasets: Dataset[];
  onCreated: () => void;
}) {
  const t = useTranslations("chartBuilder");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ChartType>("bar");
  const [datasetId, setDatasetId] = useState<number | "">("");
  const [xField, setXField] = useState("");
  const [yField, setYField] = useState("");
  const [yAxisField, setYAxisField] = useState("");
  const [seriesField, setSeriesField] = useState("");
  const [trendField, setTrendField] = useState("");
  const [labelField, setLabelField] = useState("");
  const [agg, setAgg] = useState("sum");
  const [format, setFormat] = useState<ValueFormat>("number");
  const [currency, setCurrency] = useState("NGN");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dataset = datasets.find((d) => d.id === datasetId);
  const needsFields = CHART_TYPES.find((c) => c.value === type)?.needsFields ?? false;
  const isScatter = type === "scatter";
  const isHeatmap = type === "heatmap";
  const showFormat = type !== "table";
  const showAgg = !isScatter;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !datasetId) return;
    if (isScatter && (!xField || !yField)) return;
    if (isHeatmap && (!xField || !yAxisField)) return;
    setSubmitting(true);
    setError(null);

    const config: Record<string, string> = {};
    if (isScatter) {
      config.x_field = xField;
      config.y_field = yField;
      if (labelField) config.label_field = labelField;
    } else if (isHeatmap) {
      config.x_field = xField;
      config.y_field = yAxisField;
      config.agg = agg;
      if (agg !== "count" && yField) config.value_field = yField;
    } else if (needsFields) {
      if (xField) config.x_field = xField;
      config.agg = agg;
      if (agg !== "count" && yField) config.y_field = yField;
      if (type === "bar" && seriesField) config.series_field = seriesField;
    } else if (type === "kpi") {
      config.agg = agg;
      if (agg !== "count" && yField) config.y_field = yField;
      if (trendField) config.x_field = trendField;
    }
    if (showFormat && format !== "number") {
      config.format = format;
      if (format === "currency") config.currency = currency;
    }

    try {
      await api.post(`/dashboards/${dashboardId}/charts`, {
        dataset_id: datasetId,
        title,
        type,
        config,
      });
      setTitle("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create chart.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectClass =
    "w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 outline-none focus:border-[var(--series-1)]";
  const labelClass = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
      >
        {t("addChart")}
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm"
    >
      <h3 className="mb-3 text-sm font-medium text-[var(--text-primary)]">{t("title")}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <label className={labelClass}>{t("chartTitle")}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={selectClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>{t("type")}</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ChartType)}
            className={selectClass}
          >
            {CHART_TYPES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>{t("dataset")}</label>
          <select
            value={datasetId}
            onChange={(e) => setDatasetId(Number(e.target.value))}
            className={selectClass}
            required
          >
            <option value="">{t("selectPlaceholder")}</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {needsFields && dataset && (
          <div>
            <label className={labelClass}>{type === "geo_map" ? "Region field" : "X field"}</label>
            <select
              value={xField}
              onChange={(e) => setXField(e.target.value)}
              className={selectClass}
              required
            >
              <option value="">Select...</option>
              {dataset.columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {isHeatmap && dataset && (
          <div>
            <label className={labelClass}>Y-axis field</label>
            <select
              value={yAxisField}
              onChange={(e) => setYAxisField(e.target.value)}
              className={selectClass}
              required
            >
              <option value="">Select...</option>
              {dataset.columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === "bar" && dataset && (
          <div>
            <label className={labelClass}>Series field (optional)</label>
            <select
              value={seriesField}
              onChange={(e) => setSeriesField(e.target.value)}
              className={selectClass}
            >
              <option value="">None — single series</option>
              {dataset.columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === "kpi" && dataset && (
          <div>
            <label className={labelClass}>Trend field (optional)</label>
            <select
              value={trendField}
              onChange={(e) => setTrendField(e.target.value)}
              className={selectClass}
            >
              <option value="">None — number only</option>
              {dataset.columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {isScatter && dataset && (
          <>
            <div>
              <label className={labelClass}>X field</label>
              <select value={xField} onChange={(e) => setXField(e.target.value)} className={selectClass} required>
                <option value="">Select...</option>
                {dataset.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Y field</label>
              <select value={yField} onChange={(e) => setYField(e.target.value)} className={selectClass} required>
                <option value="">Select...</option>
                {dataset.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Point label (optional)</label>
              <select value={labelField} onChange={(e) => setLabelField(e.target.value)} className={selectClass}>
                <option value="">None</option>
                {dataset.columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {showAgg && (
          <div>
            <label className={labelClass}>Aggregation</label>
            <select
              value={agg}
              onChange={(e) => setAgg(e.target.value)}
              className={selectClass}
            >
              {AGGREGATIONS.map((a) => (
                <option key={a} value={a}>
                  {AGG_LABELS[a] ?? a}
                </option>
              ))}
            </select>
          </div>
        )}

        {showAgg && agg !== "count" && dataset && (
          <div>
            <label className={labelClass}>{isHeatmap || type === "geo_map" ? "Value field" : "Y field"}</label>
            <select
              value={yField}
              onChange={(e) => setYField(e.target.value)}
              className={selectClass}
              required
            >
              <option value="">Select...</option>
              {dataset.columns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {showFormat && (
          <div>
            <label className={labelClass}>Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ValueFormat)}
              className={selectClass}
            >
              <option value="number">Number</option>
              <option value="currency">Currency</option>
              <option value="percent">Percent</option>
            </select>
          </div>
        )}

        {showFormat && format === "currency" && (
          <div>
            <label className={labelClass}>Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={selectClass}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <DatasetPreviewToggle datasetId={datasetId} />

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--series-1)] px-3 py-1.5 font-medium text-white disabled:opacity-60"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--text-secondary)]"
        >
          Cancel
        </button>
      </div>

      {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
    </form>
  );
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" />
    </svg>
  );
}

type AiResult =
  | { response_type: "answer"; answer: string }
  | { response_type: "chart"; chart: { title: string } };

function AiPromptPanel({
  dashboardId,
  datasets,
  onCreated,
}: {
  dashboardId: number;
  datasets: Dataset[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [datasetId, setDatasetId] = useState<number | "">(datasets[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !datasetId) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<AiResult>(`/dashboards/${dashboardId}/ai-prompt`, {
        dataset_id: datasetId,
        prompt,
      });
      setResult(res);
      if (res.response_type === "chart") {
        setPrompt("");
        onCreated();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "AI request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
      >
        <SparkleIcon />
        Ask AI
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm"
    >
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
        <SparkleIcon />
        Ask AI
      </h3>
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Dataset</label>
          <select
            value={datasetId}
            onChange={(e) => setDatasetId(Number(e.target.value))}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 outline-none focus:border-[var(--series-1)]"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            What do you want to know?
          </label>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. revenue by region as a bar chart"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1.5 outline-none focus:border-[var(--series-1)]"
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--series-1)] px-3 py-1.5 font-medium text-white disabled:opacity-60"
        >
          {submitting ? "Thinking..." : "Ask"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--text-secondary)]"
        >
          Close
        </button>
      </div>

      {error && <p className="mt-3 text-[var(--status-critical)]">{error}</p>}

      {result?.response_type === "answer" && (
        <div className="mt-3 rounded-md bg-[var(--page-plane)] p-3 text-[var(--text-primary)]">
          {result.answer}
        </div>
      )}
      {result?.response_type === "chart" && (
        <div className="mt-3 rounded-md bg-[var(--page-plane)] p-3 text-[var(--status-good)]">
          Added chart &ldquo;{result.chart.title}&rdquo; to this dashboard.
        </div>
      )}
    </form>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-3.9M8.6 13.5l6.8 3.9" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dashboard";
}

function ExportButton({ dashboard, chartsRef }: { dashboard: Dashboard; chartsRef: RefObject<HTMLDivElement | null> }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportExcel() {
    setBusy("excel");
    setError(null);
    try {
      await api.download(`/dashboards/${dashboard.id}/export/excel`, `${slug(dashboard.name)}.xlsx`);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export Excel.");
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    if (!chartsRef.current) {
      setError("Nothing to export yet.");
      return;
    }
    setBusy("pdf");
    setError(null);
    try {
      await downloadDashboardPdf(
        chartsRef.current,
        dashboard.name,
        dashboard.description,
        `${slug(dashboard.name)}.pdf`,
        user?.low_bandwidth_mode ?? false
      );
      setOpen(false);
    } catch {
      setError("Failed to export PDF.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <DownloadIcon />
        Export
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-2 text-sm shadow-lg">
          <button
            onClick={exportExcel}
            disabled={busy !== null}
            className="block w-full rounded-md px-3 py-2 text-left text-[var(--text-secondary)] hover:bg-[var(--page-plane)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {busy === "excel" ? "Exporting..." : "Export as Excel"}
          </button>
          <button
            onClick={exportPdf}
            disabled={busy !== null}
            className="block w-full rounded-md px-3 py-2 text-left text-[var(--text-secondary)] hover:bg-[var(--page-plane)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {busy === "pdf" ? "Exporting..." : "Export as PDF"}
          </button>
          {error && <p className="mt-1 px-3 text-xs text-[var(--status-critical)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ShareButton({
  dashboard,
  onChanged,
}: {
  dashboard: Dashboard;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl =
    dashboard.is_shared && dashboard.share_token
      ? `${window.location.origin}/public/${dashboard.share_token}`
      : null;

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/dashboards/${dashboard.id}/share`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to enable sharing.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/dashboards/${dashboard.id}/share`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to disable sharing.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ShareIcon />
        {dashboard.is_shared ? "Shared" : "Share"}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm shadow-lg">
          {!dashboard.is_shared ? (
            <>
              <p className="text-[var(--text-secondary)]">
                Create a public, read-only link anyone can view without logging in.
              </p>
              <button
                onClick={enable}
                disabled={busy}
                className="mt-3 w-full rounded-md bg-[var(--series-1)] px-3 py-1.5 font-medium text-white disabled:opacity-60"
              >
                {busy ? "Enabling..." : "Enable public link"}
              </button>
            </>
          ) : (
            <>
              <p className="text-[var(--text-secondary)]">Anyone with this link can view this dashboard.</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={publicUrl ?? ""}
                  className="flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2 py-1.5 text-xs"
                />
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <button
                onClick={disable}
                disabled={busy}
                className="mt-3 w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--status-critical)] disabled:opacity-60"
              >
                {busy ? "Disabling..." : "Disable public link"}
              </button>
            </>
          )}
          {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

function TeamIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <path d="M2 21v-1a7 7 0 0 1 14 0v1" />
      <circle cx="18" cy="8" r="2.5" />
      <path d="M17 14.5a5.5 5.5 0 0 1 5 5.5v1" />
    </svg>
  );
}

function CollaboratorsPanel({ dashboard }: { dashboard: Dashboard }) {
  const [open, setOpen] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .getRetrying<Collaborator[]>(`/dashboards/${dashboard.id}/collaborators`)
      .then(setCollaborators)
      .catch(() => {});
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/dashboards/${dashboard.id}/collaborators`, { email, role });
      setEmail("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: number) {
    try {
      await api.del(`/dashboards/${dashboard.id}/collaborators/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove.");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <TeamIcon />
        Team
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm shadow-lg">
          <p className="text-[var(--text-secondary)]">Invite teammates who already have a daha-bi account.</p>

          {collaborators.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {collaborators.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2.5 py-1.5 text-xs"
                >
                  <div>
                    <div className="text-[var(--text-primary)]">{c.user.name}</div>
                    <div className="text-[var(--text-muted)]">{c.user.email} &middot; {c.role}</div>
                  </div>
                  <button onClick={() => onRemove(c.id)} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={onInvite} className="mt-3 flex items-center gap-1.5">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@email.com"
              type="email"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2 py-1.5 text-xs"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
              className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-1.5 py-1.5 text-xs"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-md bg-[var(--series-1)] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Invite
            </button>
          </form>
          {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

function AiRecommendationsPanel({ dashboard }: { dashboard: Dashboard }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onOpen() {
    setOpen(true);
    if (analysis || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ analysis: string }>(`/dashboards/${dashboard.id}/ai-recommendations`, {});
      setAnalysis(res.analysis);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get recommendations.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : onOpen())}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <SparkleIcon />
        AI insights
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm shadow-lg">
          {loading && <p className="text-[var(--text-muted)]">Analyzing this dashboard...</p>}
          {error && <p className="text-[var(--status-critical)]">{error}</p>}
          {analysis && <p className="whitespace-pre-line text-[var(--text-primary)]">{analysis}</p>}
        </div>
      )}
    </div>
  );
}

function ReportIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h16v16H4z" />
      <path d="M4 9h16M9 9v11" />
    </svg>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ReportSchedulesPanel({ dashboard }: { dashboard: Dashboard }) {
  const [open, setOpen] = useState(false);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [recipients, setRecipients] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("08:00");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .getRetrying<ReportSchedule[]>(`/dashboards/${dashboard.id}/report-schedules`)
      .then(setSchedules)
      .catch(() => {});
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const list = recipients
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/dashboards/${dashboard.id}/report-schedules`, {
        recipients: list,
        frequency,
        day_of_week: frequency === "weekly" ? dayOfWeek : undefined,
        time_of_day: timeOfDay,
      });
      setRecipients("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function onSendNow(id: number) {
    setNotice(null);
    setError(null);
    try {
      await api.post(`/report-schedules/${id}/send-now`);
      setNotice("Sent. Locally this goes to storage/logs/laravel.log unless real SMTP is configured.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send.");
    }
  }

  async function onRemove(id: number) {
    try {
      await api.del(`/report-schedules/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove.");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ReportIcon />
        Reports
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-96 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm shadow-lg">
          <p className="text-[var(--text-secondary)]">Email a summary of this dashboard on a schedule.</p>

          {schedules.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[var(--text-primary)]">
                      {s.frequency === "weekly" ? `Weekly, ${DAY_NAMES[s.day_of_week ?? 0]}` : "Daily"} at{" "}
                      {s.time_of_day.slice(0, 5)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => onSendNow(s.id)} className="text-[var(--series-1)]">
                        Send now
                      </button>
                      <button onClick={() => onRemove(s.id)} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]">
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-0.5 text-[var(--text-muted)]">{s.recipients.join(", ")}</div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={onCreate} className="mt-3 flex flex-col gap-2">
            <input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="recipient1@email.com, recipient2@email.com"
              className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2 py-1.5 text-xs"
            />
            <div className="flex items-center gap-1.5">
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
                className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-1.5 py-1.5 text-xs"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              {frequency === "weekly" && (
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-1.5 py-1.5 text-xs"
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-1.5 py-1.5 text-xs"
              />
              <button
                type="submit"
                disabled={busy}
                className="shrink-0 rounded-md bg-[var(--series-1)] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                Schedule
              </button>
            </div>
          </form>
          {notice && <p className="mt-2 text-[var(--status-good)]">{notice}</p>}
          {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

const GRID_ROW_HEIGHT = 32;
const GRID_COLS = 12;

function chartsToLayout(charts: Chart[]): Layout {
  return charts.map((chart, i) => {
    const pos = chart.position;
    return {
      i: String(chart.id),
      x: pos?.x ?? (i * 6) % GRID_COLS,
      y: pos?.y ?? Math.floor(i / 2) * 8,
      w: Math.min(GRID_COLS, Math.max(3, pos?.w ?? 6)),
      h: Math.max(4, pos?.h ?? 8),
      minW: 3,
      minH: 4,
    };
  });
}

/**
 * A drag-and-resize dashboard canvas (Power BI-style) built on react-grid-layout. Chart position
 * is persisted to Chart.position, which the backend already stored as a free-form {x,y,w,h} JSON
 * column — only the frontend previously ignored x/y/h and used w for a static column-span. Layout
 * updates are applied to local state immediately (for a smooth drag/resize) but only written to
 * the backend on drag/resize *stop*, not on every intermediate frame.
 */
function DraggableChartGrid({
  dashboard,
  canEdit,
  crossFilter,
  onDrillDown,
  onDeleted,
  onUpdated,
  chartsRef,
}: {
  dashboard: Dashboard;
  canEdit: boolean;
  crossFilter: ChartFilter | null;
  onDrillDown: (field: string, value: string) => void;
  onDeleted: () => void;
  onUpdated: () => void;
  chartsRef: RefObject<HTMLDivElement | null>;
}) {
  const charts = dashboard.charts ?? [];
  const { width, containerRef, mounted } = useContainerWidth();
  const [layout, setLayout] = useState<Layout>(() => chartsToLayout(charts));

  useEffect(() => {
    Promise.resolve().then(() => setLayout(chartsToLayout(charts)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.id, charts.length]);

  async function persist(newLayout: Layout) {
    for (const item of newLayout) {
      const chart = charts.find((c) => String(c.id) === item.i);
      const prev = chart?.position;
      if (!chart) continue;
      if (prev && prev.x === item.x && prev.y === item.y && prev.w === item.w && prev.h === item.h) continue;
      try {
        await api.put(`/charts/${chart.id}`, { position: { x: item.x, y: item.y, w: item.w, h: item.h } });
      } catch {
        // Best-effort — the grid stays visually where the user dropped it either way; a failed
        // save just means the position reverts to last-saved on the next full reload.
      }
    }
  }

  return (
    <div ref={chartsRef}>
      <div ref={containerRef}>
        {mounted && (
          <GridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT, margin: [16, 16] }}
            dragConfig={{ enabled: canEdit, handle: ".chart-drag-handle" }}
            resizeConfig={{ enabled: canEdit }}
            onLayoutChange={setLayout}
            onDragStop={(l) => persist(l)}
            onResizeStop={(l) => persist(l)}
          >
            {charts.map((chart) => (
              <div key={String(chart.id)} className="h-full">
                <ChartCard
                  chart={chart}
                  onDeleted={onDeleted}
                  onUpdated={onUpdated}
                  canEdit={canEdit}
                  crossFilter={crossFilter}
                  onDrillDown={onDrillDown}
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}

function DashboardDetail({ dashboardId }: { dashboardId: number }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [crossFilter, setCrossFilter] = useState<ChartFilter | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const chartsRef = useRef<HTMLDivElement>(null);

  function load() {
    setLoadError(null);
    api
      .get<Dashboard>(`/dashboards/${dashboardId}`)
      .then(setDashboard)
      .catch((err) =>
        setLoadError(
          err instanceof ApiError && err.status === 403
            ? "You don't have access to this dashboard."
            : err instanceof ApiError && err.status === 404
              ? "This dashboard doesn't exist."
              : "Failed to load this dashboard."
        )
      );
  }

  useEffect(() => {
    load();
    api.get<Dataset[]>("/datasets").then(setDatasets).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <EmptyState
          icon={<ChartIcon />}
          title={loadError}
          description="It may have been deleted, or you may not have permission to view it."
          action={
            <Link
              href="/dashboards"
              className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white"
            >
              Back to dashboards
            </Link>
          }
        />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-7 w-64" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const role = dashboard.role ?? "owner";
  const canEdit = role === "owner" || role === "editor";

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <Link href="/dashboards" className="text-sm text-[var(--series-1)]">
        &larr; Dashboards
      </Link>
      <div className="mt-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{dashboard.name}</h1>
            {role !== "owner" && (
              <span className="rounded-full bg-[var(--page-plane)] px-2 py-0.5 text-xs capitalize text-[var(--text-muted)]">
                {role}
              </span>
            )}
          </div>
          {dashboard.description && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">{dashboard.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {dashboard.charts && dashboard.charts.length > 0 && <ExportButton dashboard={dashboard} chartsRef={chartsRef} />}
          {dashboard.charts && dashboard.charts.length > 0 && <AiRecommendationsPanel dashboard={dashboard} />}
          {canEdit && <ReportSchedulesPanel dashboard={dashboard} />}
          {role === "owner" && <CollaboratorsPanel dashboard={dashboard} />}
          {role === "owner" && <ShareButton dashboard={dashboard} onChanged={load} />}
        </div>
      </div>

      {canEdit && (
        <div className="mt-6 flex flex-wrap gap-3">
          {datasets.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No datasets available yet.{" "}
              <Link href="/data-sources" className="text-[var(--series-1)]">
                Add a data source
              </Link>{" "}
              first.
            </p>
          ) : (
            <>
              <AddChartForm dashboardId={dashboardId} datasets={datasets} onCreated={load} />
              <AiPromptPanel dashboardId={dashboardId} datasets={datasets} onCreated={load} />
            </>
          )}
        </div>
      )}

      {crossFilter && (
        <div className="mt-6 flex items-center gap-2 rounded-md bg-[var(--series-1)]/10 px-3 py-2 text-sm text-[var(--series-1)]">
          Filtering dashboard where <strong>{crossFilter.field}</strong> = {crossFilter.value}
          <button
            onClick={() => setCrossFilter(null)}
            className="ml-auto rounded-md border border-[var(--series-1)]/30 px-2 py-0.5 text-xs hover:bg-[var(--series-1)]/10"
          >
            Clear
          </button>
        </div>
      )}

      {dashboard.charts && dashboard.charts.length > 0 ? (
        <div className="mt-6">
          <DraggableChartGrid
            dashboard={dashboard}
            canEdit={canEdit}
            crossFilter={crossFilter}
            onDrillDown={(field, val) => setCrossFilter({ field, operator: "=", value: val })}
            onDeleted={load}
            onUpdated={load}
            chartsRef={chartsRef}
          />
        </div>
      ) : (
        <div className="mt-6">
          <EmptyState
            icon={<ChartIcon />}
            title="No charts yet"
            description="Use the form above to add your first chart from a dataset."
          />
        </div>
      )}
    </div>
  );
}

export default function DashboardView({ dashboardId }: { dashboardId: number }) {
  return (
    <RequireAuth>
      <DashboardDetail dashboardId={dashboardId} />
    </RequireAuth>
  );
}
