"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type Chart, type ChartData, type ChartType, type Dataset } from "@/lib/api";
import { CURRENCIES, type ValueFormat } from "@/lib/format-value";
import { inferColumnKinds, suggestTitle, type ColumnKind } from "@/lib/chart-describe";
import { Modal, BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL } from "@/components/Modal";
import ChartRenderer from "./ChartRenderer";

/* ───────────────────────── chart type catalogue ───────────────────────── */

const ICON_PROPS = { width: 30, height: 30, viewBox: "0 0 32 32", fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const TYPE_ICONS: Record<ChartType, ReactNode> = {
  bar: (
    <svg {...ICON_PROPS} stroke="currentColor">
      <path d="M4 27h24" opacity=".45" />
      <rect x="7" y="15" width="4" height="12" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="8" width="4" height="19" rx="1" fill="currentColor" stroke="none" />
      <rect x="21" y="18" width="4" height="9" rx="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  line: (
    <svg {...ICON_PROPS} stroke="currentColor">
      <path d="M4 27h24" opacity=".45" />
      <path d="M5 21l6-7 5 4 6-9 5 4" />
    </svg>
  ),
  pie: (
    <svg {...ICON_PROPS} stroke="currentColor">
      <circle cx="16" cy="16" r="10" />
      <path d="M16 6v10l8.5 5.5" />
      <path d="M16 16 6.5 19" opacity=".5" />
    </svg>
  ),
  kpi: (
    <svg {...ICON_PROPS} stroke="currentColor">
      <rect x="4" y="7" width="24" height="18" rx="3" />
      <path d="M9 19v-6l3 3 3-3v6M19 13h4M19 19h4" />
    </svg>
  ),
  table: (
    <svg {...ICON_PROPS} stroke="currentColor">
      <rect x="4" y="6" width="24" height="20" rx="2.5" />
      <path d="M4 12h24M4 19h24M13 12v14" opacity=".7" />
    </svg>
  ),
  scatter: (
    <svg {...ICON_PROPS} stroke="currentColor">
      <path d="M5 5v22h22" opacity=".45" />
      {[[10, 20], [14, 15], [18, 17], [21, 10], [25, 8], [12, 23]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.8" fill="currentColor" stroke="none" />
      ))}
    </svg>
  ),
  heatmap: (
    <svg {...ICON_PROPS} stroke="none">
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => (
          <rect key={`${r}${c}`} x={5 + c * 8} y={5 + r * 8} width="6.5" height="6.5" rx="1.2" fill="currentColor" opacity={0.25 + ((r * 3 + c) % 4) * 0.25} />
        )),
      )}
    </svg>
  ),
  geo_map: (
    <svg {...ICON_PROPS} stroke="currentColor">
      <path d="M4 8l7-3 10 3 7-3v19l-7 3-10-3-7 3V8Z" />
      <path d="M11 5v19M21 8v19" opacity=".5" />
    </svg>
  ),
};

const TYPES: { value: ChartType; label: string; hint: string }[] = [
  { value: "bar", label: "Bar", hint: "Compare values across categories." },
  { value: "line", label: "Line", hint: "Show how a value changes over time." },
  { value: "pie", label: "Donut", hint: "Show each part's share of a whole (best with ≤ 6 parts)." },
  { value: "kpi", label: "KPI", hint: "One headline number, optionally with its trend." },
  { value: "table", label: "Table", hint: "The underlying rows, as a table." },
  { value: "scatter", label: "Scatter", hint: "Relationship between two numeric fields." },
  { value: "heatmap", label: "Heatmap", hint: "A value across two categories at once." },
  { value: "geo_map", label: "Map", hint: "Values by country or region on a map." },
];

const AGGS: { value: string; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "count", label: "Count rows" },
  { value: "count_distinct", label: "Distinct count" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
];

/* ───────────────────────────── field picker ───────────────────────────── */

const KIND_GROUP: Record<ColumnKind, string> = { text: "Categories", date: "Dates", number: "Numbers" };

function FieldSelect({
  value,
  onChange,
  dataset,
  kinds,
  prefer,
  placeholder = "Choose a field…",
  optional,
}: {
  value: string;
  onChange: (v: string) => void;
  dataset: Dataset;
  kinds: Record<string, ColumnKind>;
  prefer: ColumnKind[];
  placeholder?: string;
  optional?: string;
}) {
  const order: ColumnKind[] = [...prefer, ...(["text", "date", "number"] as ColumnKind[]).filter((k) => !prefer.includes(k))];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_INPUT}>
      <option value="">{optional ?? placeholder}</option>
      {order.map((kind) => {
        const cols = dataset.columns.filter((c) => (kinds[c.name] ?? "text") === kind);
        if (cols.length === 0) return null;
        return (
          <optgroup key={kind} label={KIND_GROUP[kind]}>
            {cols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

function Step({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-[var(--border)] px-5 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-primary)]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--accent)]">
            {n}
          </span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/* ──────────────────────────────── builder ──────────────────────────────── */

type Fields = {
  x: string;
  y: string;
  rows: string; // heatmap row dimension
  series: string;
  trend: string; // kpi trend-over field
  label: string; // scatter point label
  agg: string;
  grain: "" | "day" | "month" | "quarter" | "year"; // date bucketing for x (or the KPI trend)
};

const EMPTY_FIELDS: Fields = { x: "", y: "", rows: "", series: "", trend: "", label: "", agg: "sum", grain: "" };

const GRAINS: { value: Fields["grain"]; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

function fieldsFromChart(chart: Chart): Fields {
  const c = chart.config;
  if (chart.type === "heatmap") return { ...EMPTY_FIELDS, x: c.x_field ?? "", rows: c.y_field ?? "", y: c.value_field ?? "", agg: c.agg ?? "sum" };
  if (chart.type === "kpi") return { ...EMPTY_FIELDS, y: c.y_field ?? "", trend: c.x_field ?? "", agg: c.agg ?? "count", grain: c.x_grain ?? "" };
  return {
    ...EMPTY_FIELDS,
    x: c.x_field ?? "",
    y: c.y_field ?? "",
    series: c.series_field ?? "",
    label: c.label_field ?? "",
    agg: c.agg ?? "sum",
    grain: c.x_grain ?? "",
  };
}

/** Sensible starting fields for a chart type, only filling what's still empty or no longer fits. */
function withDefaults(type: ChartType, f: Fields, dataset: Dataset, kinds: Record<string, ColumnKind>): Fields {
  const of = (kind: ColumnKind) => dataset.columns.filter((c) => kinds[c.name] === kind).map((c) => c.name);
  const numbers = of("number");
  const dates = of("date");
  const texts = of("text").filter((n) => !/(^|_)id$/i.test(n));
  const next = { ...f };
  const has = (name: string) => dataset.columns.some((c) => c.name === name);
  (["x", "y", "rows", "series", "trend", "label"] as const).forEach((k) => {
    if (next[k] && !has(next[k])) next[k] = "";
  });

  if (type === "line") {
    if (!next.x || kinds[next.x] !== "date") next.x = dates[0] ?? next.x ?? texts[0] ?? "";
  } else if (type === "bar" || type === "pie" || type === "geo_map") {
    if (!next.x) next.x = (type === "geo_map" ? texts.find((n) => /country|region|state|city/i.test(n)) : undefined) ?? texts[0] ?? dates[0] ?? "";
  } else if (type === "heatmap") {
    if (!next.x) next.x = dates[0] ?? texts[1] ?? texts[0] ?? "";
    if (!next.rows) next.rows = texts.find((n) => n !== next.x) ?? "";
  } else if (type === "scatter") {
    if (!next.x) next.x = numbers[0] ?? "";
    if (!next.y || next.y === next.x) next.y = numbers.find((n) => n !== next.x) ?? "";
  }

  if (type !== "scatter" && type !== "table") {
    if (!next.y || kinds[next.y] !== "number") next.y = numbers[0] ?? "";
    if (!next.y && next.agg !== "count") next.agg = "count";
  }
  // Dates default to monthly buckets: daily points make trends noisy and "vs previous" meaningless.
  const dateField = type === "kpi" ? next.trend : next.x;
  if (dateField && kinds[dateField] === "date" && type !== "heatmap") {
    if (!next.grain) next.grain = "month";
  } else {
    next.grain = "";
  }
  return next;
}

function buildConfig(type: ChartType, f: Fields, format: ValueFormat, currency: string): Chart["config"] {
  const config: Chart["config"] = {};
  if (type === "scatter") {
    config.x_field = f.x;
    config.y_field = f.y;
    if (f.label) config.label_field = f.label;
  } else if (type === "heatmap") {
    config.x_field = f.x;
    config.y_field = f.rows;
    config.agg = f.agg;
    if (f.agg !== "count" && f.y) config.value_field = f.y;
  } else if (type === "kpi") {
    config.agg = f.agg;
    if (f.agg !== "count" && f.y) config.y_field = f.y;
    if (f.trend) config.x_field = f.trend;
    if (f.trend && f.grain) config.x_grain = f.grain;
  } else if (type !== "table") {
    if (f.x) config.x_field = f.x;
    config.agg = f.agg;
    if (f.agg !== "count" && f.y) config.y_field = f.y;
    if (type === "bar" && f.series) config.series_field = f.series;
    if (f.x && f.grain && !(type === "bar" && f.series)) config.x_grain = f.grain;
  }
  if (type !== "table" && format !== "number") {
    config.format = format;
    if (format === "currency") config.currency = currency;
  }
  return config;
}

/** What still has to be picked before the chart can be drawn, or null when it's complete. */
function missing(type: ChartType, f: Fields): string | null {
  const needsMeasure = f.agg !== "count" && !f.y;
  switch (type) {
    case "table":
      return null;
    case "scatter":
      return !f.x || !f.y ? "Pick two numeric fields to plot against each other." : null;
    case "heatmap":
      if (!f.x || !f.rows) return "Pick the column and row categories.";
      return needsMeasure ? "Pick the value to measure." : null;
    case "kpi":
      return needsMeasure ? "Pick the value to measure." : null;
    default:
      if (!f.x) return type === "line" ? "Pick what the line runs over (usually a date)." : "Pick a field to group by.";
      return needsMeasure ? "Pick the value to measure." : null;
  }
}

const CONFIG_FIELDS = ["x_field", "y_field", "agg", "series_field", "label_field", "value_field", "format", "currency", "x_grain"] as const;

export default function ChartBuilder({
  dashboardId,
  datasets,
  chart,
  onClose,
  onSaved,
}: {
  dashboardId: number;
  datasets: Dataset[];
  /** When given, the builder edits this chart instead of creating a new one. */
  chart?: Chart;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!chart;
  const [datasetId, setDatasetId] = useState<number | "">(chart?.dataset_id ?? datasets[0]?.id ?? "");
  const [type, setType] = useState<ChartType>(chart?.type ?? "bar");
  const [fields, setFields] = useState<Fields>(chart ? fieldsFromChart(chart) : EMPTY_FIELDS);
  const [format, setFormat] = useState<ValueFormat>(chart?.config.format ?? "number");
  const [currency, setCurrency] = useState(chart?.config.currency ?? "NGN");
  const [title, setTitle] = useState(chart?.title ?? "");
  const [kindsByDataset, setKindsByDataset] = useState<Record<number, Record<string, ColumnKind>>>({});

  const [preview, setPreview] = useState<{ key: string; data?: ChartData; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataset = datasets.find((d) => d.id === datasetId);
  const kinds = useMemo(() => (datasetId ? kindsByDataset[datasetId] : undefined) ?? {}, [kindsByDataset, datasetId]);
  const kindsReady = !!datasetId && !!kindsByDataset[datasetId];

  // Sample the dataset once to learn which columns are numbers, dates or categories.
  useEffect(() => {
    if (!dataset || kindsByDataset[dataset.id]) return;
    let cancelled = false;
    api
      .getRetrying<{ rows: Record<string, unknown>[] }>(`/datasets/${dataset.id}/preview`)
      .then((p) => p.rows)
      .catch(() => [] as Record<string, unknown>[])
      .then((rows) => {
        if (cancelled) return;
        const inferred = inferColumnKinds(dataset.columns, rows);
        setKindsByDataset((prev) => ({ ...prev, [dataset.id]: inferred }));
        if (!editing) setFields((f) => withDefaults(type, f, dataset, inferred));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.id]);

  const config = useMemo(() => buildConfig(type, fields, format, currency), [type, fields, format, currency]);
  const gap = missing(type, fields);
  const autoTitle = dataset ? suggestTitle(type, config, dataset.columns) : "New chart";
  const previewKey = JSON.stringify([datasetId, type, config]);

  // Live preview, debounced so clicking through options doesn't fire a request per click.
  useEffect(() => {
    if (!datasetId || gap) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .post<ChartData>(`/dashboards/${dashboardId}/charts/preview`, { dataset_id: datasetId, type, config })
        .then((data) => !cancelled && setPreview({ key: previewKey, data }))
        .catch((err) => !cancelled && setPreview({ key: previewKey, error: err instanceof ApiError ? err.message : "Couldn't draw this chart." }));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, gap]);

  const previewReady = preview?.key === previewKey;

  function chooseType(next: ChartType) {
    setType(next);
    if (dataset && kindsReady) setFields((f) => withDefaults(next, f, dataset, kinds));
  }

  function chooseDataset(id: number) {
    setDatasetId(id);
    const ds = datasets.find((d) => d.id === id);
    if (ds && kindsByDataset[id]) setFields((f) => withDefaults(type, f, ds, kindsByDataset[id]));
  }

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => {
      const next = { ...f, [key]: value };
      // Picking a different x/trend field re-decides whether a date grain applies.
      if ((key === "x" || key === "trend") && dataset && kindsReady) return withDefaults(type, { ...next, grain: "" }, dataset, kinds);
      return next;
    });
  }

  const grainField = type === "kpi" ? fields.trend : fields.x;
  const showGrain =
    !!grainField && kinds[grainField] === "date" && ["bar", "line", "pie", "kpi"].includes(type) && !(type === "bar" && fields.series);

  async function save() {
    if (!datasetId || gap) return;
    setSaving(true);
    setError(null);
    const finalTitle = title.trim() || autoTitle;
    try {
      if (chart) {
        // Keep presentation settings (style, target, forecast) — only the data definition changes.
        const kept = { ...chart.config };
        CONFIG_FIELDS.forEach((k) => delete kept[k]);
        // A variant belongs to its chart type ("horizontal" means nothing to a line), so drop it on a type change.
        if (chart.type !== type && kept.style) kept.style = { ...kept.style, variant: type === "pie" ? "donut" : undefined };
        await api.put(`/charts/${chart.id}`, { title: finalTitle, type, config: { ...kept, ...config } });
      } else {
        await api.post(`/dashboards/${dashboardId}/charts`, {
          dataset_id: datasetId,
          title: finalTitle,
          type,
          config: type === "pie" ? { ...config, style: { variant: "donut", show_legend: true } } : config,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save chart.");
      setSaving(false);
    }
  }

  const previewChart: Chart = {
    id: 0,
    dashboard_id: dashboardId,
    dataset_id: Number(datasetId) || 0,
    title: title.trim() || autoTitle,
    type,
    config: { ...config, style: chart?.type === type ? chart.config.style : type === "pie" ? { variant: "donut", show_legend: true } : undefined },
    filters: null,
    position: null,
    dataset,
  };

  const showMeasure = type !== "table" && type !== "scatter";
  const xLabel =
    type === "line" ? "Over" : type === "geo_map" ? "Region" : type === "heatmap" ? "Columns" : type === "pie" ? "Slices" : "Group by";

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={editing ? "Edit chart" : "Add a chart"}
      description={editing ? "Change what this chart shows. Its styling is kept." : "Pick your data and a visual — the preview updates as you go."}
      icon={TYPE_ICONS.bar}
      footer={
        <>
          {error && <p className="mr-auto text-sm text-[var(--status-critical)]">{error}</p>}
          <button onClick={onClose} className={BTN_SECONDARY}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !!gap || !datasetId} className={BTN_PRIMARY}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add to dashboard"}
          </button>
        </>
      }
    >
      <div className="grid lg:h-[min(72vh,700px)] lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* ── configuration ── */}
        <div className="overflow-y-auto border-[var(--border)] lg:border-r">
          <Step n={1} title="Data">
            <select
              value={datasetId}
              onChange={(e) => chooseDataset(Number(e.target.value))}
              disabled={editing}
              className={`${FIELD_INPUT} disabled:opacity-70`}
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {dataset && (
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                {dataset.row_count.toLocaleString()} rows · {dataset.columns.length} columns
                {editing && " · a chart's dataset can't be changed"}
              </p>
            )}
          </Step>

          <Step n={2} title="Visual">
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map((t) => {
                const active = t.value === type;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => chooseType(t.value)}
                    aria-pressed={active}
                    title={t.hint}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 pb-2 pt-2.5 text-[11.5px] font-medium transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <span className={active ? "" : "text-[var(--text-muted)]"}>{TYPE_ICONS[t.value]}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{TYPES.find((t) => t.value === type)?.hint}</p>
          </Step>

          <Step n={3} title="Fields">
            {!dataset ? (
              <p className="text-sm text-[var(--text-muted)]">Choose a dataset first.</p>
            ) : type === "table" ? (
              <p className="text-sm text-[var(--text-secondary)]">Shows the dataset&apos;s rows as they are — nothing to configure.</p>
            ) : (
              <div className="space-y-3">
                {type === "scatter" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={FIELD_LABEL}>Horizontal (X)</label>
                        <FieldSelect value={fields.x} onChange={(v) => set("x", v)} dataset={dataset} kinds={kinds} prefer={["number"]} />
                      </div>
                      <div>
                        <label className={FIELD_LABEL}>Vertical (Y)</label>
                        <FieldSelect value={fields.y} onChange={(v) => set("y", v)} dataset={dataset} kinds={kinds} prefer={["number"]} />
                      </div>
                    </div>
                    <div>
                      <label className={FIELD_LABEL}>Point label</label>
                      <FieldSelect value={fields.label} onChange={(v) => set("label", v)} dataset={dataset} kinds={kinds} prefer={["text"]} optional="None" />
                    </div>
                  </>
                ) : (
                  <>
                    {type !== "kpi" && (
                      <div>
                        <label className={FIELD_LABEL}>{xLabel}</label>
                        <FieldSelect
                          value={fields.x}
                          onChange={(v) => set("x", v)}
                          dataset={dataset}
                          kinds={kinds}
                          prefer={type === "line" ? ["date", "text"] : ["text", "date"]}
                        />
                      </div>
                    )}
                    {type === "heatmap" && (
                      <div>
                        <label className={FIELD_LABEL}>Rows</label>
                        <FieldSelect value={fields.rows} onChange={(v) => set("rows", v)} dataset={dataset} kinds={kinds} prefer={["text", "date"]} />
                      </div>
                    )}
                    {showMeasure && (
                      <div>
                        <label className={FIELD_LABEL}>Measure</label>
                        <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
                          <select value={fields.agg} onChange={(e) => set("agg", e.target.value)} className={FIELD_INPUT}>
                            {AGGS.map((a) => (
                              <option key={a.value} value={a.value}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                          {fields.agg === "count" ? (
                            <div className="flex items-center rounded-lg border border-dashed border-[var(--border)] px-3 text-xs text-[var(--text-muted)]">
                              counts every row
                            </div>
                          ) : (
                            <FieldSelect
                              value={fields.y}
                              onChange={(v) => set("y", v)}
                              dataset={dataset}
                              kinds={kinds}
                              prefer={fields.agg === "count_distinct" ? ["text", "number"] : ["number"]}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {type === "bar" && (
                      <div>
                        <label className={FIELD_LABEL}>Split by</label>
                        <FieldSelect value={fields.series} onChange={(v) => set("series", v)} dataset={dataset} kinds={kinds} prefer={["text"]} optional="Nothing — one series" />
                      </div>
                    )}
                    {showGrain && (
                      <div>
                        <label className={FIELD_LABEL}>Group dates by</label>
                        <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                          {GRAINS.map((g) => (
                            <button
                              key={g.value}
                              type="button"
                              onClick={() => set("grain", g.value)}
                              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                                fields.grain === g.value ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                              }`}
                            >
                              {g.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {type === "kpi" && (
                      <div>
                        <label className={FIELD_LABEL}>Trend over</label>
                        <FieldSelect value={fields.trend} onChange={(v) => set("trend", v)} dataset={dataset} kinds={kinds} prefer={["date"]} optional="No trend — number only" />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Step>

          <Step n={4} title="Display">
            <label className={FIELD_LABEL}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} className={FIELD_INPUT} />
            {!title && <p className="mt-1 text-xs text-[var(--text-muted)]">Leave empty to use the suggested title.</p>}
            {type !== "table" && (
              <div className="mt-3">
                <label className={FIELD_LABEL}>Values shown as</label>
                <div className="flex gap-2">
                  <div className="inline-flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
                    {(["number", "currency", "percent"] as ValueFormat[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFormat(f)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${
                          format === f ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {f === "number" ? "1,234" : f === "currency" ? "Money" : "%"}
                      </button>
                    ))}
                  </div>
                  {format === "currency" && (
                    <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${FIELD_INPUT} min-w-0`}>
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
          </Step>
        </div>

        {/* ── live preview ── */}
        <div className="flex min-h-[22rem] flex-col bg-[var(--page-plane)] p-4 sm:p-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Live preview</span>
            {!gap && !previewReady && datasetId && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
                Updating
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-sm sm:p-5">
            <h4 className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">{previewChart.title}</h4>
            <p className="truncate text-xs text-[var(--text-muted)]">{dataset?.name}</p>
            <div className="mt-4 min-h-[16rem] flex-1">
              {gap ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-6 text-center">
                  <span className="text-[var(--text-muted)] opacity-60">{TYPE_ICONS[type]}</span>
                  <p className="text-sm text-[var(--text-secondary)]">{gap}</p>
                </div>
              ) : previewReady && preview?.error ? (
                <div className="flex h-full items-center justify-center rounded-lg bg-[var(--status-critical)]/5 p-6 text-center text-sm text-[var(--status-critical)]">
                  {preview.error}
                </div>
              ) : preview?.data && (previewReady || preview.key.startsWith(JSON.stringify([datasetId, type]).slice(0, -1))) ? (
                <div className={`h-full transition-opacity ${previewReady ? "" : "opacity-50"}`}>
                  <ChartRenderer chart={previewChart} data={preview.data} />
                </div>
              ) : (
                <div className="h-full animate-pulse rounded-lg bg-[var(--surface-2)]" />
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
