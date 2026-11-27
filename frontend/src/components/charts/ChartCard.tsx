"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  api,
  ApiError,
  type Alert,
  type BarVariant,
  type Chart,
  type ChartData,
  type ChartFilter,
  type ChartStyle,
  type ColorRule,
  type Goal,
  type KpiVariant,
  type LineVariant,
  type PieVariant,
} from "@/lib/api";
import ChartRenderer, { kpiTileColor } from "./ChartRenderer";
import { readableInk } from "./extra-views";
import { Skeleton } from "@/components/Skeleton";
import { downloadChartCsv } from "@/lib/csv-export";
import { downloadChartPng } from "@/lib/chart-export";
import { computeInsight } from "@/lib/insights";
import { useChartTheme } from "@/lib/chart-theme";
import { formatValue } from "@/lib/format-value";
import { describeChart } from "@/lib/chart-describe";

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 21V4c2.5-1.5 5.5-1.5 8 0s5.5 1.5 8 0v11c-2.5 1.5-5.5 1.5-8 0s-5.5-1.5-8 0" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] ${
        danger
          ? "text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className="flex w-4 justify-center opacity-80">{icon}</span>
      {label}
    </button>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

/** Compact, always-visible toolbar button for the chart card header. */
const TOOL_BTN =
  "flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]";
const TOOL_BTN_ON = "bg-[var(--accent-soft)] !text-[var(--accent)]";

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 3h6M10 3v6.5L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A4.2 4.2 0 0 0 21 11a9 9 0 0 0-9-9Z" />
      <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SORT_OPTIONS: { value: NonNullable<ChartStyle["sort"]>; label: string }[] = [
  { value: "none", label: "As returned" },
  { value: "desc", label: "Highest first" },
  { value: "asc", label: "Lowest first" },
];

const BAR_VARIANTS: { value: BarVariant; label: string }[] = [
  { value: "vertical", label: "Vertical bars" },
  { value: "horizontal", label: "Horizontal bars" },
  { value: "grouped", label: "Grouped (needs a series field)" },
  { value: "stacked", label: "Stacked (needs a series field)" },
  { value: "percent", label: "100% stacked (needs a series field)" },
];

const LINE_VARIANTS: { value: LineVariant; label: string }[] = [
  { value: "smooth", label: "Smooth" },
  { value: "straight", label: "Straight" },
  { value: "area", label: "Area (filled)" },
];

const PIE_VARIANTS: { value: PieVariant; label: string }[] = [
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
];

const KPI_VARIANTS: { value: KpiVariant; label: string }[] = [
  { value: "number", label: "Number" },
  { value: "sparkline", label: "Number + trend (needs a trend field)" },
  { value: "progress", label: "Progress toward a target" },
  { value: "tile", label: "Coloured tile" },
];

function defaultVariant(chart: Chart, style: ChartStyle): string {
  if (style.variant) return style.variant;
  if (chart.type === "pie") return style.donut === false ? "pie" : "donut";
  if (chart.type === "line") return style.smooth === false ? "straight" : "smooth";
  if (chart.type === "bar") return "vertical";
  return "number";
}

function ChartStylePanel({
  chart,
  data,
  onUpdated,
  onClose,
}: {
  chart: Chart;
  data: ChartData | null;
  onUpdated: () => void;
  onClose: () => void;
}) {
  const theme = useChartTheme();
  const initial = chart.config.style ?? {};
  const [xAxisLabel, setXAxisLabel] = useState(initial.x_axis_label ?? "");
  const [yAxisLabel, setYAxisLabel] = useState(initial.y_axis_label ?? "");
  const [showLegend, setShowLegend] = useState(initial.show_legend ?? chart.type === "pie");
  const [showDataLabels, setShowDataLabels] = useState(initial.show_data_labels ?? false);
  const [showGridlines, setShowGridlines] = useState(initial.show_gridlines ?? true);
  const [sort, setSort] = useState<NonNullable<ChartStyle["sort"]>>(initial.sort ?? "none");
  const [showPoints, setShowPoints] = useState(initial.show_points ?? false);
  const [colors, setColors] = useState<string[]>(initial.colors ?? []);
  const [variant, setVariant] = useState(defaultVariant(chart, initial));
  const [target, setTarget] = useState(chart.config.target != null ? String(chart.config.target) : "");
  const [showTrendline, setShowTrendline] = useState(initial.show_trendline ?? false);
  const [forecastPeriods, setForecastPeriods] = useState(
    chart.config.forecast_periods ? String(chart.config.forecast_periods) : ""
  );
  const [transform, setTransform] = useState<NonNullable<ChartStyle["transform"]>>(initial.transform ?? "none");
  const [colorRules, setColorRules] = useState<ColorRule[]>(initial.color_rules ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryLabels = data && "series" in data ? data.series.slice(0, 8).map((s) => s.name) : data && "labels" in data ? data.labels.slice(0, 8) : [];
  const isCategorical = chart.type === "bar" || chart.type === "pie";
  const isLine = chart.type === "line";
  const isKpi = chart.type === "kpi";
  const isGauge = chart.type === "gauge";
  const isScatter = chart.type === "scatter";
  const isSingleSeriesBar = chart.type === "bar" && !chart.config.series_field;
  const canTrendline = chart.type === "bar" || (isLine && !chart.config.series_field) || isScatter;
  const canTransform = (chart.type === "bar" || isLine) && !chart.config.series_field;
  const canColorRules = isSingleSeriesBar || isKpi || isGauge;
  // One colour per category: bar/pie slices and treemap blocks. Line series and radar outlines too.
  const perCategoryColors = isCategorical || chart.type === "treemap" || chart.type === "radar" || (isLine && !!chart.config.series_field);
  const canSort = isCategorical || chart.type === "list" || chart.type === "funnel";

  function addColorRule() {
    setColorRules((prev) => [...prev, { operator: "gte", value: 0, color: theme.categorical[0] }]);
  }

  function updateColorRule(i: number, patch: Partial<ColorRule>) {
    setColorRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function removeColorRule(i: number) {
    setColorRules((prev) => prev.filter((_, idx) => idx !== i));
  }

  function colorFor(i: number) {
    return colors[i] || theme.categorical[i % theme.categorical.length];
  }

  function setColorAt(i: number, hex: string) {
    setColors((prev) => {
      const next = [...prev];
      next[i] = hex;
      return next;
    });
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    const style: ChartStyle = {
      x_axis_label: xAxisLabel || undefined,
      y_axis_label: yAxisLabel || undefined,
      show_legend: showLegend,
      show_data_labels: showDataLabels,
      show_gridlines: showGridlines,
      sort,
      show_points: showPoints,
      colors: colors.some(Boolean) ? colors : undefined,
      variant: variant as ChartStyle["variant"],
      show_trendline: canTrendline ? showTrendline : undefined,
      transform: canTransform ? transform : undefined,
      color_rules: canColorRules && colorRules.length > 0 ? colorRules : undefined,
    };
    const config = {
      ...chart.config,
      style,
      target: (isKpi || isGauge) && target ? Number(target) : undefined,
      forecast_periods: isLine && forecastPeriods ? Number(forecastPeriods) : undefined,
    };
    try {
      await api.put(`/charts/${chart.id}`, { config });
      onClose();
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save chart style.");
    } finally {
      setSaving(false);
    }
  }

  const checkboxRow = "flex items-center gap-1.5";
  const labelClass = "mb-1 block text-[var(--text-secondary)]";
  const inputClass = "w-full rounded border border-[var(--border)] bg-transparent px-2 py-1";

  return (
    <>
        <div className="chart-popover absolute right-0 top-full z-30 mt-1.5 max-h-[28rem] w-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-xs shadow-lg">
          <h4 className="mb-2 font-medium text-[var(--text-primary)]">Customize chart</h4>

          <div className="flex flex-col gap-2.5">
            {(isCategorical || isLine || isScatter) && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>X axis label</label>
                  <input value={xAxisLabel} onChange={(e) => setXAxisLabel(e.target.value)} className={inputClass} placeholder={chart.config.x_field ?? ""} />
                </div>
                <div>
                  <label className={labelClass}>Y axis label</label>
                  <input value={yAxisLabel} onChange={(e) => setYAxisLabel(e.target.value)} className={inputClass} placeholder={chart.config.y_field ?? "value"} />
                </div>
              </div>
            )}

            {canTrendline && (
              <label className={checkboxRow}>
                <input type="checkbox" checked={showTrendline} onChange={(e) => setShowTrendline(e.target.checked)} />
                Show trendline
              </label>
            )}

            {isLine && !chart.config.series_field && (
              <div>
                <label className={labelClass}>Forecast periods</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={forecastPeriods}
                  onChange={(e) => setForecastPeriods(e.target.value)}
                  className={inputClass}
                  placeholder="0 — off"
                />
                <p className="mt-1 text-[var(--text-muted)]">
                  Projects this many future periods forward using a simple trend line.
                </p>
              </div>
            )}

            {canTransform && (
              <div>
                <label className={labelClass}>Values</label>
                <select value={transform} onChange={(e) => setTransform(e.target.value as NonNullable<ChartStyle["transform"]>)} className={inputClass}>
                  <option value="none">As returned</option>
                  <option value="cumulative">Running total</option>
                </select>
              </div>
            )}

            {canColorRules && (
              <div>
                <label className={labelClass}>Conditional color</label>
                <div className="flex flex-col gap-1.5">
                  {colorRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <select
                        value={rule.operator}
                        onChange={(e) => updateColorRule(i, { operator: e.target.value as ColorRule["operator"] })}
                        className="rounded border border-[var(--border)] bg-transparent px-1 py-1"
                      >
                        <option value="gte">&gt;=</option>
                        <option value="lte">&lt;=</option>
                      </select>
                      <input
                        type="number"
                        value={rule.value}
                        onChange={(e) => updateColorRule(i, { value: Number(e.target.value) })}
                        className="w-16 rounded border border-[var(--border)] bg-transparent px-1.5 py-1"
                      />
                      <input
                        type="color"
                        value={rule.color}
                        onChange={(e) => updateColorRule(i, { color: e.target.value })}
                        className="h-6 w-8 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
                      />
                      <button type="button" onClick={() => removeColorRule(i)} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]">
                        ✕
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addColorRule} className="self-start text-[var(--accent)]">
                    + Add rule
                  </button>
                </div>
                <p className="mt-1 text-[var(--text-muted)]">First matching rule wins; otherwise the theme color is used.</p>
              </div>
            )}

            {(chart.type === "bar" || isLine || chart.type === "pie" || isKpi) && (
              <div>
                <label className={labelClass}>Style</label>
                <select value={variant} onChange={(e) => setVariant(e.target.value)} className={inputClass}>
                  {chart.type === "bar" &&
                    BAR_VARIANTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  {isLine &&
                    LINE_VARIANTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  {chart.type === "pie" &&
                    PIE_VARIANTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  {isKpi &&
                    KPI_VARIANTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </select>
                {chart.type === "bar" && (variant === "grouped" || variant === "stacked") && !chart.config.series_field && (
                  <p className="mt-1 text-[var(--status-warning)]">
                    This chart has no series field, so it will render as a single series.
                  </p>
                )}
                {isKpi && variant === "sparkline" && !chart.config.x_field && (
                  <p className="mt-1 text-[var(--status-warning)]">
                    This chart has no trend field, so no trend will be shown.
                  </p>
                )}
              </div>
            )}

            {((isKpi && variant === "progress") || isGauge) && (
              <div>
                <label className={labelClass}>{isGauge ? "Target (the end of the dial)" : "Target"}</label>
                <input
                  type="number"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 100000"
                />
              </div>
            )}

            {canSort && (
              <div>
                <label className={labelClass}>Sort</label>
                <select value={sort} onChange={(e) => setSort(e.target.value as NonNullable<ChartStyle["sort"]>)} className={inputClass}>
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              <label className={checkboxRow}>
                <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} />
                Legend
              </label>
              <label className={checkboxRow}>
                <input type="checkbox" checked={showDataLabels} onChange={(e) => setShowDataLabels(e.target.checked)} />
                Data labels
              </label>
              {(isCategorical || isLine) && chart.type !== "pie" && (
                <label className={checkboxRow}>
                  <input type="checkbox" checked={showGridlines} onChange={(e) => setShowGridlines(e.target.checked)} />
                  Gridlines
                </label>
              )}
              {isLine && (
                <label className={checkboxRow}>
                  <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} />
                  Show points
                </label>
              )}
            </div>

            {(perCategoryColors && categoryLabels.length > 0) && (
              <div>
                <label className={labelClass}>Colors</label>
                <div className="flex flex-col gap-1">
                  {categoryLabels.map((label, i) => (
                    <div key={label} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={colorFor(i)}
                        onChange={(e) => setColorAt(i, e.target.value)}
                        className="h-6 w-8 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
                      />
                      <span className="truncate text-[var(--text-secondary)]">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!perCategoryColors && chart.type !== "table" && (
              <div>
                <label className={labelClass}>{isKpi && variant === "tile" ? "Tile color" : "Color"}</label>
                <input
                  type="color"
                  value={colorFor(0)}
                  onChange={(e) => setColorAt(0, e.target.value)}
                  className="h-6 w-8 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
                />
              </div>
            )}

            {colors.some(Boolean) && (
              <button type="button" onClick={() => setColors([])} className="self-start text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                Reset colors to theme
              </button>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded bg-[var(--accent)] px-3 py-1.5 font-medium text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={onClose} className="rounded border border-[var(--border)] px-3 py-1.5 text-[var(--text-secondary)]">
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
        </div>
    </>
  );
}

const OPERATORS = [
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: "contains", label: "contains" },
];

const DATE_RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function AlertsPanel({ chart }: { chart: Chart }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [condition, setCondition] = useState<"above" | "below" | "anomaly">("above");
  const [threshold, setThreshold] = useState("");
  const [sensitivity, setSensitivity] = useState("2.5");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasTrend = Boolean(chart.config.x_field);

  function load() {
    api
      .getRetrying<Alert[]>(`/charts/${chart.id}/alerts`)
      .then(setAlerts)
      .catch(() => {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit() {
    if (condition === "anomaly" ? !sensitivity : !threshold) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        `/charts/${chart.id}/alerts`,
        condition === "anomaly"
          ? { condition, sensitivity: Number(sensitivity) }
          : { condition, threshold: Number(threshold) }
      );
      setThreshold("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create alert.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRemove(id: number) {
    try {
      await api.del(`/alerts/${id}`);
      load();
    } catch {
      // best-effort; row stays visible if delete failed
    }
  }

  return (
    <>
        <div className="chart-popover absolute right-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-xs shadow-lg">
          <h4 className="mb-2 font-medium text-[var(--text-primary)]">Alerts</h4>

          {alerts.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded border border-[var(--border)] bg-[var(--page-plane)] px-2 py-1.5"
                >
                  <span className="text-[var(--text-secondary)]">
                    {a.condition === "anomaly" ? `Anomaly (±${a.sensitivity}σ)` : `${a.condition} ${a.threshold}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        a.last_status === "breached"
                          ? "bg-[var(--status-critical)]/15 text-[var(--status-critical)]"
                          : "bg-[var(--status-good)]/15 text-[var(--status-good)]"
                      }`}
                    >
                      {a.last_status === "breached" ? "Breached" : "OK"}
                    </span>
                    <button onClick={() => onRemove(a.id)} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as "above" | "below" | "anomaly")}
              className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1"
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
              <option value="anomaly" disabled={!hasTrend}>
                Anomaly{!hasTrend ? " (needs x-axis)" : ""}
              </option>
            </select>
            {condition === "anomaly" ? (
              <input
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value)}
                placeholder="sensitivity (σ)"
                type="number"
                step="0.5"
                min="0.5"
                className="w-24 rounded border border-[var(--border)] bg-transparent px-1.5 py-1"
              />
            ) : (
              <input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder="threshold"
                type="number"
                className="w-20 rounded border border-[var(--border)] bg-transparent px-1.5 py-1"
              />
            )}
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="rounded bg-[var(--accent)] px-2 py-1 text-white disabled:opacity-60"
            >
              Add
            </button>
          </div>
          {condition === "anomaly" && (
            <p className="mt-1 text-[var(--text-muted)]">
              Flags the latest period when it&apos;s more than this many standard deviations from recent history.
            </p>
          )}
          {error && <p className="mt-1.5 text-[var(--status-critical)]">{error}</p>}
        </div>
    </>
  );
}

function GoalsPanel({ chart }: { chart: Chart }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [name, setName] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [targetValue, setTargetValue] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recommending, setRecommending] = useState<number | null>(null);
  const [recommendations, setRecommendations] = useState<Record<number, string>>({});

  function load() {
    api
      .getRetrying<Goal[]>(`/charts/${chart.id}/goals`)
      .then(setGoals)
      .catch(() => {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit() {
    if (!name || !targetValue) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/charts/${chart.id}/goals`, {
        name,
        direction,
        target_value: Number(targetValue),
        deadline: deadline || null,
      });
      setName("");
      setTargetValue("");
      setDeadline("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create goal.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onRemove(id: number) {
    try {
      await api.del(`/goals/${id}`);
      load();
    } catch {
      // best-effort; row stays visible if delete failed
    }
  }

  async function onRecommend(id: number) {
    setRecommending(id);
    try {
      const res = await api.post<{ recommendation: string }>(`/goals/${id}/recommend`);
      setRecommendations((prev) => ({ ...prev, [id]: res.recommendation || "No recommendation available right now." }));
    } catch (err) {
      setRecommendations((prev) => ({
        ...prev,
        [id]: err instanceof ApiError ? err.message : "Failed to get a recommendation.",
      }));
    } finally {
      setRecommending(null);
    }
  }

  return (
    <>
        <div className="chart-popover absolute right-0 top-full z-30 mt-1.5 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-xs shadow-lg">
          <h4 className="mb-2 font-medium text-[var(--text-primary)]">Goals</h4>

          {goals.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              {goals.map((g) => (
                <div key={g.id} className="rounded border border-[var(--border)] bg-[var(--page-plane)] p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--text-secondary)]">
                      {g.name} — {g.direction} to {g.target_value}
                    </span>
                    <button onClick={() => onRemove(g.id)} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]">
                      ✕
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className={`h-full rounded-full ${g.is_achieved ? "bg-[var(--status-good)]" : "bg-[var(--accent)]"}`}
                        style={{ width: `${g.progress_percent ?? 0}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                      {g.progress_percent ?? 0}%{g.is_achieved ? " ✓" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => onRecommend(g.id)}
                    disabled={recommending === g.id}
                    className="mt-1.5 text-[10px] text-[var(--accent)] hover:underline disabled:opacity-60"
                  >
                    {recommending === g.id ? "Thinking..." : "Get AI recommendation"}
                  </button>
                  {recommendations[g.id] && (
                    <p className="mt-1 text-[10px] text-[var(--text-secondary)]">{recommendations[g.id]}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Goal name (e.g. Hit $1M revenue)"
              className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1"
            />
            <div className="flex items-center gap-1.5">
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}
                className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1"
              >
                <option value="increase">Increase to</option>
                <option value="decrease">Decrease to</option>
              </select>
              <input
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="target"
                type="number"
                className="w-24 rounded border border-[var(--border)] bg-transparent px-1.5 py-1"
              />
              <input
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                type="date"
                className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1"
              />
            </div>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="rounded bg-[var(--accent)] px-2 py-1 text-white disabled:opacity-60"
            >
              {submitting ? "Adding..." : "Add goal"}
            </button>
          </div>
          {error && <p className="mt-1.5 text-[var(--status-critical)]">{error}</p>}
        </div>
    </>
  );
}

/**
 * "What-if" scenario simulation, entirely client-side against already-fetched chart data — no
 * persistence, no backend call. The roadmap's "scenario simulation" applied to the one shape of
 * chart it maps onto cleanly: a single-series category breakdown, where "what if Lagos grew 15%"
 * is a well-defined per-category adjustment. A saved/shareable scenario is a bigger feature this
 * deliberately doesn't attempt.
 */
function ScenarioPanel({
  labels,
  values,
  format,
  currency,
}: {
  labels: string[];
  values: number[];
  format: Chart["config"]["format"];
  currency: Chart["config"]["currency"];
}) {
  const [adjustments, setAdjustments] = useState<Record<string, string>>({});

  const baseline = values.reduce((a, b) => a + b, 0);
  const adjusted = labels.reduce((sum, label, i) => {
    const pct = Number(adjustments[label] ?? 0) || 0;
    return sum + values[i] * (1 + pct / 100);
  }, 0);
  const delta = adjusted - baseline;
  const hasAdjustments = Object.values(adjustments).some((v) => Number(v) !== 0 && v !== "");

  function setAdjustment(label: string, pct: string) {
    setAdjustments((prev) => ({ ...prev, [label]: pct }));
  }

  return (
    <>
        <div className="chart-popover absolute right-0 top-full z-30 mt-1.5 max-h-96 w-72 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-xs shadow-lg">
          <h4 className="mb-2 font-medium text-[var(--text-primary)]">What if...</h4>
          <div className="flex flex-col gap-1.5">
            {labels.slice(0, 30).map((label) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="truncate text-[var(--text-secondary)]" title={label}>
                  {label}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    value={adjustments[label] ?? ""}
                    onChange={(e) => setAdjustment(label, e.target.value)}
                    placeholder="0"
                    className="w-14 rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-right"
                  />
                  <span className="text-[var(--text-muted)]">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-[var(--border)] pt-2">
            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span>Baseline total</span>
              <span className="tabular-nums">{formatValue(baseline, format, currency)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between font-medium text-[var(--text-primary)]">
              <span>Projected total</span>
              <span className="tabular-nums">{formatValue(adjusted, format, currency)}</span>
            </div>
            {hasAdjustments && (
              <div
                className="mt-1 flex items-center justify-between"
                style={{ color: delta >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
              >
                <span>Change</span>
                <span className="tabular-nums">
                  {delta >= 0 ? "+" : ""}
                  {formatValue(delta, format, currency)}
                </span>
              </div>
            )}
          </div>
          {hasAdjustments && (
            <button
              onClick={() => setAdjustments({})}
              className="mt-2 text-[var(--accent)] hover:underline"
            >
              Reset
            </button>
          )}
        </div>
    </>
  );
}

export default function ChartCard({
  chart,
  onDeleted,
  onUpdated,
  dataEndpoint,
  readOnly = false,
  canEdit = true,
  crossFilter,
  onDrillDown,
  onEdit,
  dashboardFilters,
  refreshKey = 0,
  commentCount,
  onComment,
}: {
  chart: Chart;
  onDeleted?: () => void;
  onUpdated?: () => void;
  dataEndpoint?: string;
  readOnly?: boolean;
  canEdit?: boolean;
  crossFilter?: ChartFilter | null;
  onDrillDown?: (field: string, value: string) => void;
  /** Opens the chart builder on this chart; the "Edit chart" menu item only shows when given. */
  onEdit?: (chart: Chart) => void;
  /** Dashboard slicer filters; only those on fields this chart's dataset has are applied. */
  dashboardFilters?: ChartFilter[];
  /** Bump to re-fetch data (dashboard "Refresh"). */
  refreshKey?: number;
  /** Open comment threads on this chart; the comment button only shows when onComment is given. */
  commentCount?: number;
  onComment?: (chart: Chart) => void;
}) {
  const theme = useChartTheme();
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const canExportImage = ["bar", "line", "pie", "scatter", "radar", "treemap", "gauge"].includes(chart.type);
  const [field, setField] = useState(chart.dataset?.columns[0]?.name ?? "");
  const [operator, setOperator] = useState("=");
  const [value, setValue] = useState("");
  const [manualFilters, setManualFilters] = useState<ChartFilter[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<null | "style" | "alerts" | "goals" | "scenario">(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  // Menus and panels close on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !panel) return;
    const close = () => {
      setMenuOpen(false);
      setPanel(null);
    };
    const onDown = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, panel]);

  function openPanel(next: NonNullable<typeof panel>) {
    setMenuOpen(false);
    setPanel((p) => (p === next ? null : next));
  }

  const insight = useMemo(() => (data ? computeInsight(chart, data) : null), [chart, data]);

  const hasField = (field: string) => !!chart.dataset?.columns.some((c) => c.name === field);
  // A chart grouped by the clicked field highlights the pick instead of filtering itself down to
  // one bar (the Power BI behaviour); every other chart with that field is filtered by it.
  const selectedValue =
    crossFilter && crossFilter.field === chart.config.x_field && typeof crossFilter.value === "string" ? crossFilter.value : undefined;
  const crossFilterApplies = !!crossFilter && !selectedValue && hasField(crossFilter.field);
  const slicerFilters = useMemo(
    () => (dashboardFilters ?? []).filter((f) => chart.dataset?.columns.some((c) => c.name === f.field)),
    [dashboardFilters, chart.dataset],
  );

  const effectiveFilters = useMemo(() => {
    const filters = [...manualFilters, ...slicerFilters];
    if (crossFilterApplies && crossFilter) filters.push(crossFilter);
    return filters;
  }, [manualFilters, slicerFilters, crossFilterApplies, crossFilter]);

  // Line ↔ bar quick switch for single-series trend/breakdown charts; view-only, never saved.
  const canSwitchView = chart.type === "line" && !!chart.config.x_field;
  const [viewAs, setViewAs] = useState<"line" | "bar" | null>(null);
  const shownChart = viewAs && viewAs !== chart.type ? { ...chart, type: viewAs } : chart;

  useEffect(() => {
    let cancelled = false;
    const endpoint = dataEndpoint ?? `/charts/${chart.id}/data`;
    api
      .post<ChartData>(endpoint, { filters: effectiveFilters })
      .catch(() => api.post<ChartData>(endpoint, { filters: effectiveFilters })) // one silent retry for rare transient 500s under load
      .then((result) => {
        if (cancelled) return;
        setError(null);
        setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load chart data.");
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch when the chart's definition changes too (the builder can edit fields/type in place).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart.id, chart.type, JSON.stringify(chart.config), JSON.stringify(effectiveFilters), refreshKey]);

  function applyFilter() {
    if (!field || !value) return;
    setManualFilters([{ field, operator, value }]);
  }

  function applyDateRange(days: number) {
    if (!field) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setManualFilters([
      { field, operator: ">=", value: isoDate(start) },
      { field, operator: "<=", value: isoDate(end) },
    ]);
  }

  function clearFilter() {
    setManualFilters([]);
    setValue("");
  }

  async function onDelete() {
    if (!confirm(`Delete chart "${chart.title}"?`)) return;
    try {
      await api.del(`/charts/${chart.id}`);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete chart.");
    }
  }

  async function onDuplicate() {
    try {
      await api.post(`/charts/${chart.id}/duplicate`);
      onUpdated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to duplicate chart.");
    }
  }

  const canDrillDown = !!onDrillDown && !!chart.config.x_field;

  const scenarioData =
    data && "labels" in data && "values" in data && !chart.config.series_field && ["bar", "pie", "geo_map", "list", "funnel", "treemap"].includes(chart.type)
      ? data
      : null;
  const editable = !readOnly && canEdit;
  const canFilter = chart.type !== "table" && chart.type !== "kpi" && chart.type !== "gauge";
  const filtersOn = manualFilters.length > 0;

  // A "tile" KPI paints its whole card; the text tokens are re-pointed at an ink that reads on it,
  // so the title, icons and numbers all follow without each needing its own colour.
  const tile = kpiTileColor(chart, data, theme);
  const tileStyle = tile
    ? ({
        background: `linear-gradient(145deg, ${tile}, color-mix(in srgb, ${tile} 82%, #000))`,
        borderColor: "transparent",
        "--text-primary": readableInk(tile),
        "--text-secondary": `color-mix(in srgb, ${readableInk(tile)} 85%, transparent)`,
        "--text-muted": `color-mix(in srgb, ${readableInk(tile)} 72%, transparent)`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      style={tileStyle}
      className={`flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-card)] transition-colors hover:border-[var(--baseline)] ${
        menuOpen || panel ? "chart-popover-open" : ""
      }`}
    >
      <div className="flex shrink-0 items-start gap-1.5 px-4 pt-3.5">
        <div
          className={`flex min-w-0 flex-1 items-start gap-1.5 ${editable ? "chart-drag-handle cursor-grab active:cursor-grabbing" : ""}`}
          title={editable ? "Drag to move" : undefined}
        >
          {editable && (
            <span className="-ml-1.5 mt-[3px] shrink-0 text-[var(--text-muted)] opacity-50">
              <GripIcon />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold leading-snug tracking-tight text-[var(--text-primary)]" title={chart.title}>
              {chart.title}
            </h3>
            {chart.type !== "kpi" && chart.type !== "gauge" && (
              <p className="truncate text-xs text-[var(--text-muted)]" title={describeChart(chart)}>
                {describeChart(chart)}
              </p>
            )}
          </div>
        </div>

        <div ref={toolsRef} className="relative -mr-2 -mt-0.5 flex shrink-0 items-center">
          {canSwitchView && (
            <div className="mr-1 hidden items-center rounded-lg border border-[var(--border)] p-0.5 sm:flex" role="group" aria-label="Show as">
              {(["line", "bar"] as const).map((v) => {
                const on = (viewAs ?? chart.type) === v;
                return (
                  <button
                    key={v}
                    onClick={() => setViewAs(v === chart.type ? null : v)}
                    aria-pressed={on}
                    title={v === "line" ? "Show as line" : "Show as bars"}
                    className={`flex h-6 w-7 items-center justify-center rounded-md ${on ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                  >
                    {v === "line" ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 17l6-6 4 4 8-8" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="4" y="11" width="4" height="9" rx="1" />
                        <rect x="10" y="5" width="4" height="15" rx="1" />
                        <rect x="16" y="14" width="4" height="6" rx="1" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {onComment && (
            <button
              onClick={() => onComment(chart)}
              className={`${TOOL_BTN} relative ${commentCount ? "!text-[var(--accent)]" : ""}`}
              title={commentCount ? `${commentCount} open comment${commentCount === 1 ? "" : "s"}` : "Comment on this chart"}
              aria-label={commentCount ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : "Comment on this chart"}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
              </svg>
              {!!commentCount && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9.5px] font-semibold leading-none text-white">
                  {commentCount > 9 ? "9+" : commentCount}
                </span>
              )}
            </button>
          )}
          {canFilter && (
            <button
              onClick={() => setShowFilter((s) => !s)}
              className={`${TOOL_BTN} relative ${showFilter || filtersOn ? TOOL_BTN_ON : ""}`}
              title="Filter"
              aria-label="Filter"
            >
              <FilterIcon />
              {filtersOn && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
            </button>
          )}
          {editable && chart.type !== "table" && chart.type !== "feed" && (
            <button
              onClick={() => openPanel("style")}
              className={`${TOOL_BTN} ${panel === "style" ? TOOL_BTN_ON : ""}`}
              title="Customize look"
              aria-label="Customize look"
            >
              <PaletteIcon />
            </button>
          )}
          <button
            onClick={() => {
              setPanel(null);
              setMenuOpen((o) => !o);
            }}
            className={`${TOOL_BTN} ${menuOpen ? TOOL_BTN_ON : ""}`}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreIcon />
          </button>

          {menuOpen && (
            <div role="menu" className="chart-popover absolute right-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-1.5 shadow-[var(--shadow-pop)]">
              {editable && onEdit && (
                <MenuItem icon={<PencilIcon />} label="Edit chart" onClick={() => { setMenuOpen(false); onEdit(chart); }} />
              )}
              {scenarioData && <MenuItem icon={<FlaskIcon />} label="What-if scenario" onClick={() => openPanel("scenario")} />}
              {!readOnly && chart.type === "kpi" && <MenuItem icon={<BellIcon />} label="Alerts" onClick={() => openPanel("alerts")} />}
              {!readOnly && chart.type === "kpi" && <MenuItem icon={<FlagIcon />} label="Goals" onClick={() => openPanel("goals")} />}
              {data && (
                <>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <MenuItem icon={<DownloadIcon />} label="Download CSV" onClick={() => { setMenuOpen(false); downloadChartCsv(chart, data); }} />
                  {canExportImage && (
                    <MenuItem
                      icon={<ImageIcon />}
                      label="Download PNG"
                      onClick={() => {
                        setMenuOpen(false);
                        if (chartAreaRef.current) downloadChartPng(chartAreaRef.current, `${chart.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`);
                      }}
                    />
                  )}
                </>
              )}
              {editable && (
                <>
                  <div className="my-1 h-px bg-[var(--border)]" />
                  <MenuItem icon={<CopyIcon />} label="Duplicate" onClick={() => { setMenuOpen(false); onDuplicate(); }} />
                  <MenuItem icon={<TrashIcon />} label="Delete" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
                </>
              )}
            </div>
          )}
          {panel === "style" && <ChartStylePanel chart={chart} data={data} onUpdated={() => onUpdated?.()} onClose={() => setPanel(null)} />}
          {panel === "alerts" && <AlertsPanel chart={chart} />}
          {panel === "goals" && <GoalsPanel chart={chart} />}
          {panel === "scenario" && scenarioData && (
            <ScenarioPanel labels={scenarioData.labels} values={scenarioData.values} format={chart.config.format} currency={chart.config.currency} />
          )}
        </div>
      </div>

      {showFilter && chart.dataset && (
        <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-xs">
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="rounded border border-[var(--border)] bg-transparent px-2 py-1"
          >
            {chart.dataset.columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="rounded border border-[var(--border)] bg-transparent px-2 py-1"
          >
            {OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="value"
            className="w-24 rounded border border-[var(--border)] bg-transparent px-2 py-1"
          />
          <button
            onClick={applyFilter}
            className="rounded bg-[var(--accent)] px-2 py-1 text-white"
          >
            Apply
          </button>

          <span className="mx-1 text-[var(--text-muted)]">or date range on this field:</span>
          {DATE_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => applyDateRange(r.days)}
              className="rounded border border-[var(--border)] px-2 py-1 text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Last {r.label}
            </button>
          ))}

          {manualFilters.length > 0 && (
            <button onClick={clearFilter} className="text-[var(--text-muted)]">
              Clear
            </button>
          )}
        </div>
      )}

      {crossFilterApplies && crossFilter && (
        <div className="mx-4 mt-3 flex items-center gap-1.5 rounded-md bg-[var(--accent)]/10 px-2.5 py-1.5 text-xs text-[var(--accent)]">
          Cross-filtered: {crossFilter.field} = {crossFilter.value}
        </div>
      )}

      <div className="min-h-0 flex-1 px-3 pb-3 pt-3" ref={chartAreaRef}>
        {error && <p className="px-1 text-sm text-[var(--status-critical)]">{error}</p>}
        {!error && !data && <Skeleton className="h-full min-h-24 w-full" />}
        {data && (
          <ChartRenderer
            chart={shownChart}
            data={data}
            selected={selectedValue}
            onDrillDown={canDrillDown ? (val) => onDrillDown!(chart.config.x_field!, val) : undefined}
          />
        )}
      </div>

      {data && insight && (
        <div
          className={`flex shrink-0 items-center gap-1.5 border-t border-[var(--border)] px-4 py-2 text-xs ${
            insight.tone === "up"
              ? "text-[var(--status-good)]"
              : insight.tone === "down"
                ? "text-[var(--status-critical)]"
                : "text-[var(--text-muted)]"
          }`}
        >
          <SparkIcon />
          {insight.text}
        </div>
      )}
    </div>
  );
}
