"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/Skeleton";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme, foldToOther } from "@/lib/chart-theme";
import { formatCompact, formatPeriod, formatValue } from "@/lib/format-value";
import { FeedView, FunnelView, GaugeView, ListView, RadarView, SmartTable, TreemapView, readableInk, statusColors } from "./extra-views";
import type {
  BarVariant,
  Chart,
  ChartData,
  ChartStyle,
  ColorRule,
  KpiVariant,
  LineVariant,
  PieVariant,
  ScatterPoint,
} from "@/lib/api";
import { useT, uiLocaleTag } from "@/i18n/ui";

// Leaflet touches `window` at import time, so it can never load during SSR — dynamically
// imported with ssr:false to keep it fully isolated to the client bundle. In practice this chart
// only ever mounts client-side anyway (ChartCard fetches data in an effect before rendering it),
// but this also protects the production build itself from ever evaluating Leaflet on the server.
const PowerMapChart = dynamic(() => import("./PowerMapChart"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

/** Blends a "#rrggbb" color with the given alpha over an rgba() string. */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function barVariant(style: ChartStyle): BarVariant {
  return (style.variant as BarVariant | undefined) ?? "vertical";
}

function lineVariant(style: ChartStyle): LineVariant {
  if (style.variant) return style.variant as LineVariant;
  return style.smooth === false ? "straight" : "smooth";
}

function pieVariant(style: ChartStyle): PieVariant {
  if (style.variant) return style.variant as PieVariant;
  // Donut is the default: the hole leaves room for the eye to compare arc lengths. Only an explicit
  // donut: false (or variant "pie") keeps a full pie.
  return style.donut === false ? "pie" : "donut";
}

function kpiVariant(style: ChartStyle): KpiVariant {
  return (style.variant as KpiVariant | undefined) ?? "number";
}

function matchColorRule(value: number, rules: ColorRule[] | undefined, fallback: string): string {
  if (!rules) return fallback;
  for (const rule of rules) {
    if (rule.operator === "gte" && value >= rule.value) return rule.color;
    if (rule.operator === "lte" && value <= rule.value) return rule.color;
  }
  return fallback;
}

/**
 * The fill of a "tile" KPI card, or null for any other chart. Colour rules apply, so a tile can
 * turn red when its number crosses a threshold (as a "Critical assets" tile would).
 */
export function kpiTileColor(chart: Chart, data: ChartData | null, theme: ReturnType<typeof useChartTheme>): string | null {
  const style = chart.config.style ?? {};
  if (chart.type !== "kpi" || style.variant !== "tile") return null;
  const base = style.colors?.[0] || theme.categorical[0];
  return data && "value" in data && typeof data.value === "number" ? matchColorRule(data.value, style.color_rules, base) : base;
}

/** Rounds an axis maximum up to a clean 1/2/2.5/5 × 10ⁿ step so ticks read 0, 100K, 200K… not 85K, 170K. */
function niceCeil(max: number, ticks = 4): number {
  if (!Number.isFinite(max) || max <= 0) return max;
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw) ?? 10 * mag;
  return Math.ceil(max / step) * step;
}
const BAR_DOMAIN: [number, (dataMax: number) => number] = [0, (dataMax: number) => niceCeil(dataMax)];

function cumulative(values: number[]): number[] {
  let running = 0;
  return values.map((v) => (running += v));
}

/**
 * For a line chart, folding excess points into a categorical "Other" bucket (as bar/pie do)
 * destroys the actual shape of a trend — a 200-day series would collapse into ~7 points plus one
 * giant blob with no time meaning. Decimating to evenly-spaced points instead keeps chronological
 * order and the real shape intact, just with fewer rendered points.
 */
function decimateLine(labels: string[], values: number[], maxPoints = 120): { labels: string[]; values: number[] } {
  if (labels.length <= maxPoints) return { labels, values };
  const step = labels.length / maxPoints;
  const indexes: number[] = [];
  for (let i = 0; i < maxPoints; i++) indexes.push(Math.floor(i * step));
  const last = labels.length - 1;
  if (indexes[indexes.length - 1] !== last) indexes.push(last);
  return { labels: indexes.map((i) => labels[i]), values: indexes.map((i) => values[i]) };
}

/** Least-squares trendline over an evenly-spaced categorical axis (x = index). */
function regressionValues(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values.slice();
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return values.map((_, x) => slope * x + intercept);
}

/** Least-squares trendline over real numeric (x, y) points — returned as its two endpoints. */
function regressionEndpoints(points: ScatterPoint[]): { x: number; y: number }[] {
  const n = points.length;
  const xMean = points.reduce((s, p) => s + p.x, 0) / n;
  const yMean = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - xMean) * (p.y - yMean);
    den += (p.x - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const xs = points.map((p) => p.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept },
  ];
}

function TooltipCard({
  active,
  payload,
  label,
  theme,
  chart,
  total,
}: {
  active?: boolean;
  payload?: { value: number; name?: string; dataKey?: string; color?: string; payload?: { fill?: string } }[];
  label?: string;
  theme: ReturnType<typeof useChartTheme>;
  chart: Chart;
  /** When set (pie), each row also shows its share of this total. */
  total?: number;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.dataKey !== "trend" && typeof p.value === "number" && Number.isFinite(p.value));
  if (!rows.length) return null;
  const rawHeading = label ?? (total !== undefined ? rows[0].name : undefined);
  const heading = rawHeading !== undefined ? formatPeriod(String(rawHeading)) : undefined;
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.gridline}`,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: theme.primaryInk,
        boxShadow: "0 8px 24px -8px rgba(0,0,0,.18)",
        minWidth: 120,
      }}
    >
      {heading && <div style={{ color: theme.secondaryInk, marginBottom: 4 }}>{heading}</div>}
      {rows.map((p, i) => (
        <div key={p.name ?? i} style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.payload?.fill ?? p.color, flexShrink: 0 }} />
          {rows.length > 1 && p.name && <span style={{ fontWeight: 400, color: theme.secondaryInk }}>{p.name}</span>}
          <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
            {formatValue(p.value, chart.config.format, chart.config.currency)}
            {total ? <span style={{ fontWeight: 400, color: theme.mutedInk }}> · {((p.value / total) * 100).toFixed(1)}%</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function ScatterTooltipCard({
  active,
  payload,
  theme,
  chart,
}: {
  active?: boolean;
  payload?: { payload: ScatterPoint }[];
  theme: ReturnType<typeof useChartTheme>;
  chart: Chart;
}) {
  const tr = useT();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.gridline}`,
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 12,
        color: theme.primaryInk,
      }}
    >
      {p.label && <div style={{ color: theme.secondaryInk, marginBottom: 2 }}>{tr(p.label)}</div>}
      <div>
        {chart.config.x_field ?? tr("x")}: <strong>{p.x.toLocaleString(uiLocaleTag())}</strong>
      </div>
      <div>
        {chart.config.y_field ?? tr("y")}: <strong>{formatValue(p.y, chart.config.format, chart.config.currency)}</strong>
      </div>
    </div>
  );
}

/** Width of an element, tracked with a ResizeObserver (0 until first measured). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Whole pixels only, so sub-pixel jitter from a layout switch can't keep re-triggering it.
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** "2025-03" → month, "2025-03-14" → day; used to word the KPI comparison. */
function periodWord(label: string | undefined): string {
  if (!label) return "period";
  if (/^\d{4}-\d{2}-\d{2}/.test(label)) return "day";
  if (/^\d{4}-\d{2}$/.test(label)) return "month";
  if (/^\d{4}$/.test(label)) return "year";
  if (/^\d{4}-Q\d$/.test(label)) return "quarter";
  return "period";
}

/**
 * KPI: headline number, the change between the last two periods of its trend, and a sparkline.
 * Up/down is shown with an arrow and words as well as colour, never colour alone.
 */
function KpiView({ chart, data, theme }: { chart: Chart; data: Extract<ChartData, { value: number }>; theme: ReturnType<typeof useChartTheme> }) {
  const tr = useT();
  const style: ChartStyle = chart.config.style ?? {};
  const variant = kpiVariant(style);
  // A "tile" paints the whole card (see kpiTileColor); everything on it switches to an ink that reads on that fill.
  const tile = variant === "tile" ? kpiTileColor(chart, data, theme) : null;
  const tileInk = tile ? readableInk(tile) : null;
  const kpiColor = tileInk ?? matchColorRule(data.value, style.color_rules, style.colors?.[0] || theme.primaryInk);
  const lineColor = tileInk ?? (style.colors?.[0] || theme.categorical[0]);
  const muted = tileInk ? `color-mix(in srgb, ${tileInk} 78%, transparent)` : theme.mutedInk;
  const target = chart.config.target;
  const trend = data.trend && data.trend.values.length > 1 ? data.trend : null;
  const fmt = (v: number) => formatValue(v, chart.config.format, chart.config.currency);

  let delta: { pct: number; word: string } | null = null;
  if (trend) {
    const last = trend.values[trend.values.length - 1];
    const prev = trend.values[trend.values.length - 2];
    if (prev !== 0 && Number.isFinite(prev)) delta = { pct: ((last - prev) / Math.abs(prev)) * 100, word: periodWord(trend.labels[trend.labels.length - 1]) };
  }
  const showSpark = trend && variant !== "progress" && style.variant !== "number";
  const full = fmt(data.value);
  // Long numbers switch to the compact form ("$62.1K") so the headline never truncates.
  const headline = full.length > 9 ? formatCompact(data.value, chart.config.format, chart.config.currency) : full;

  return (
    <div className="flex h-full flex-col justify-end gap-2 px-1">
      <div className={`truncate ${tile ? "text-[34px]" : "text-[30px]"} font-semibold leading-none tracking-tight tabular-nums`} style={{ color: kpiColor }} title={full}>
        {headline}
      </div>
      <div className="flex min-h-0 items-end justify-between gap-3">
      <div className="min-w-0 pb-0.5">
        {delta ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums"
              style={
                tileInk
                  ? { color: tileInk, background: `color-mix(in srgb, ${tileInk} 18%, transparent)` }
                  : {
                      color: delta.pct >= 0 ? "var(--status-good)" : "var(--status-critical)",
                      background:
                        delta.pct >= 0
                          ? "color-mix(in srgb, var(--status-good) 12%, transparent)"
                          : "color-mix(in srgb, var(--status-critical) 12%, transparent)",
                    }
              }
            >
              {delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct).toFixed(1)}%
            </span>
            <span className="truncate" style={{ color: muted }}>{tr("vs prev.")} {delta.word}</span>
          </div>
        ) : (
          <div className="text-xs" style={{ color: muted }}>
            {(chart.config.agg ?? "count").replace("_", " ")} {tr("of")} {chart.config.y_field ?? tr("records")}
          </div>
        )}
        {variant === "progress" && typeof target === "number" && target > 0 && (
          <div className="mt-1 w-44 max-w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: theme.gridline }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (data.value / target) * 100))}%`, background: lineColor }} />
            </div>
            <div className="mt-1 text-[11px]" style={{ color: theme.mutedInk }}>
              {Math.round((data.value / target) * 100)}{tr("% of")} {fmt(target)} {tr("target")}
            </div>
          </div>
        )}
      </div>
      {showSpark && trend && (
        <div className="h-[40px] w-[45%] min-w-[72px] max-w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend.labels.map((label, i) => ({ name: label, value: trend.values[i] }))} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
              <defs>
                <linearGradient id={`kpi-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} fill={`url(#kpi-${chart.id})`} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
              <Tooltip content={<TooltipCard theme={theme} chart={chart} />} cursor={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Donut (or pie) with its own legend: a value/% table beside it on wide cards, a compact list
 * under it on narrow ones. Rows and slices both drill down; the selected one stays bright.
 */
function PieView({
  chart,
  rows,
  isDonut,
  colorAt,
  theme,
  showLegend,
  showDataLabels,
  selected,
  onPick,
}: {
  chart: Chart;
  rows: { name: string; value: number }[];
  isDonut: boolean;
  colorAt: (i: number) => string;
  theme: ReturnType<typeof useChartTheme>;
  showLegend: boolean;
  showDataLabels: boolean;
  selected?: string;
  onPick?: (name: string) => void;
}) {
  const tr = useT();
  const [ref, width] = useWidth<HTMLDivElement>();
  const wide = width >= 440;
  const total = rows.reduce((a, r) => a + r.value, 0);
  const fmt = (v: number) => formatValue(v, chart.config.format, chart.config.currency);
  const dim = (name: string) => (selected && selected !== name ? 0.3 : 1);

  const donut = (
    <div className="relative h-full min-h-0 w-full min-w-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius={isDonut ? "62%" : 0}
            outerRadius="88%"
            stroke={theme.surface}
            strokeWidth={2}
            onClick={onPick ? (_, i) => onPick(rows[i].name) : undefined}
            cursor={onPick ? "pointer" : undefined}
            // Data labels on a donut are each slice's share, written on the slice itself.
            label={
              showDataLabels
                ? (p: { cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; value?: number; fill?: string }) => {
                    const share = total ? (Number(p.value) / total) * 100 : 0;
                    if (share < 4) return null;
                    const RAD = Math.PI / 180;
                    const radius = Number(p.innerRadius ?? 0) + (Number(p.outerRadius ?? 0) - Number(p.innerRadius ?? 0)) * (isDonut ? 0.5 : 0.62);
                    const x = Number(p.cx) + radius * Math.cos(-Number(p.midAngle) * RAD);
                    const y = Number(p.cy) + radius * Math.sin(-Number(p.midAngle) * RAD);
                    return (
                      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11.5} fontWeight={600} fill={readableInk(p.fill ?? "#000000")}>
                        {Math.round(share)}%
                      </text>
                    );
                  }
                : undefined
            }
            labelLine={false}
            isAnimationActive={false}
          >
            {rows.map((r, i) => (
              <Cell key={r.name} fill={colorAt(i)} fillOpacity={dim(r.name)} />
            ))}
          </Pie>
          <Tooltip content={<TooltipCard theme={theme} chart={chart} total={total} />} />
        </PieChart>
      </ResponsiveContainer>
      {isDonut && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] uppercase tracking-wide" style={{ color: theme.mutedInk }}>
            {selected ? selected : tr("Total")}
          </span>
          <span className="text-lg font-semibold tabular-nums" style={{ color: theme.primaryInk }}>
            {formatCompact(selected ? rows.find((r) => r.name === selected)?.value ?? 0 : total, chart.config.format, chart.config.currency)}
          </span>
        </div>
      )}
    </div>
  );

  if (!showLegend) return <div ref={ref} className="flex h-full">{donut}</div>;

  return (
    <div ref={ref} className={`flex h-full min-h-0 gap-4 ${wide ? "flex-row items-center" : "flex-col"}`}>
      {donut}
      <div className={wide ? "max-h-full w-[52%] shrink-0 overflow-y-auto" : "max-h-[40%] shrink-0 overflow-y-auto"}>
        {wide ? (
          <table className="w-full text-[12.5px] tabular-nums">
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.name}
                  onClick={onPick ? () => onPick(r.name) : undefined}
                  className={`${onPick ? "cursor-pointer" : ""} border-b last:border-0`}
                  style={{ borderColor: theme.gridline, opacity: dim(r.name) }}
                >
                  <td className="py-1.5 pe-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorAt(i) }} />
                      <span className="truncate" style={{ color: theme.secondaryInk }} title={r.name}>
                        {r.name}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 pe-2 text-end font-medium" style={{ color: theme.primaryInk }}>
                    {fmt(r.value)}
                  </td>
                  <td className="w-12 py-1.5 text-end" style={{ color: theme.mutedInk }}>
                    {total ? `${((r.value / total) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
            {rows.map((r, i) => (
              <button
                key={r.name}
                onClick={onPick ? () => onPick(r.name) : undefined}
                className="flex items-center gap-1.5"
                style={{ color: theme.secondaryInk, opacity: dim(r.name), cursor: onPick ? "pointer" : "default" }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: colorAt(i) }} />
                {r.name}
                <span style={{ color: theme.mutedInk }}>{total ? `${Math.round((r.value / total) * 100)}%` : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChartRenderer({
  chart,
  data,
  onDrillDown,
  selected,
}: {
  chart: Chart;
  data: ChartData;
  onDrillDown?: (value: string) => void;
  /** Category picked by a cross-filter click: it stays bright and the rest dim. */
  selected?: string;
}) {
  const tr = useT();
  const theme = useChartTheme();
  const style: ChartStyle = chart.config.style ?? {};
  const showLegend = style.show_legend ?? chart.type === "pie";
  const showGridlines = style.show_gridlines ?? true;
  const showDataLabels = style.show_data_labels ?? false;

  function color(i: number): string {
    return style.colors?.[i] || theme.categorical[i % theme.categorical.length];
  }

  /** Colours for named categories/series: the author's picks, else status colours when they're all states, else the palette. */
  function colorsFor(names: string[]): (i: number) => string {
    const status = style.colors?.some(Boolean) ? null : statusColors(names);
    return (i) => status?.[i] ?? color(i);
  }

  function handlePointClick(name: string) {
    if (!onDrillDown || name === "Other") return;
    onDrillDown(name);
  }

  function labelFormatter(value: unknown) {
    return formatValue(Number(value), chart.config.format, chart.config.currency);
  }

  /** Axis ticks stay short ("15.7K") so the value axis never eats the plot width. */
  const tickFormatter = (value: number) => formatCompact(Number(value), chart.config.format, chart.config.currency);
  const tick = { fontSize: 11, fill: theme.mutedInk };
  const seriesName =
    style.y_axis_label ||
    (chart.config.agg === "count" || !chart.config.y_field ? tr("Records") : chart.config.y_field.replace(/_/g, " "));

  if (chart.type === "kpi" && "value" in data) {
    return <KpiView chart={chart} data={data} theme={theme} />;
  }

  if (chart.type === "table" && "columns" in data) {
    return <SmartTable columns={data.columns} rows={data.rows} theme={theme} />;
  }

  if (chart.type === "gauge" && "value" in data) {
    return <GaugeView chart={chart} value={Number(data.value) || 0} color={matchColorRule(Number(data.value) || 0, style.color_rules, color(0))} theme={theme} />;
  }

  if (chart.type === "feed" && "items" in data) {
    return <FeedView chart={chart} items={data.items} theme={theme} />;
  }

  if (chart.type === "radar" && "labels" in data) {
    const series = "series" in data ? data.series : [{ name: seriesName, values: data.values }];
    return <RadarView chart={chart} labels={data.labels.slice(0, 12)} series={series} colorAt={color} theme={theme} showLegend={showLegend} />;
  }

  if ((chart.type === "list" || chart.type === "funnel" || chart.type === "treemap") && "labels" in data && "values" in data) {
    let rows = data.labels.map((label, i) => ({ name: label, value: data.values[i] ?? 0 }));
    // Lists and funnels read largest-first unless the author picked an order; a treemap lays itself out by size.
    const sort = style.sort && style.sort !== "none" ? style.sort : "desc";
    rows = [...rows].sort((a, b) => (sort === "asc" ? a.value - b.value : b.value - a.value));
    const pick = onDrillDown ? handlePointClick : undefined;
    if (chart.type === "list") return <ListView chart={chart} rows={rows.slice(0, 50)} color={color(0)} theme={theme} selected={selected} onPick={pick} />;
    if (chart.type === "funnel") return <FunnelView chart={chart} rows={rows.slice(0, 12)} color={color(0)} theme={theme} />;
    const folded = foldToOther(rows.map((r) => r.name), rows.map((r) => r.value));
    return <TreemapView chart={chart} rows={folded.labels.map((name, i) => ({ name, value: folded.values[i] }))} colorAt={(i) => style.colors?.[i] || theme.categorical[i % theme.categorical.length]} theme={theme} onPick={pick} />;
  }

  if (chart.type === "scatter" && "points" in data) {
    const trendPoints = style.show_trendline && data.points.length > 1 ? regressionEndpoints(data.points) : null;
    const margin = { top: 8, right: 12, left: 0, bottom: style.x_axis_label ? 20 : 0 };

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.points} margin={margin}>
          {showGridlines && <CartesianGrid stroke={theme.gridline} />}
          <XAxis type="number" dataKey="x" tick={{ fontSize: 11, fill: theme.mutedInk }} axisLine={{ stroke: theme.baseline }} tickLine={false}>
            {style.x_axis_label && (
              <Label value={style.x_axis_label} position="insideBottom" offset={-15} fill={theme.mutedInk} fontSize={11} />
            )}
          </XAxis>
          <YAxis type="number" dataKey="y" tick={tick} tickFormatter={tickFormatter} axisLine={false} tickLine={false} width={style.y_axis_label ? 64 : 52}>
            {style.y_axis_label && (
              <Label value={style.y_axis_label} angle={-90} position="insideLeft" fill={theme.mutedInk} fontSize={11} />
            )}
          </YAxis>
          <Tooltip content={<ScatterTooltipCard theme={theme} chart={chart} />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter dataKey="y" data={data.points} fill={color(0)} />
          {trendPoints && (
            <Line data={trendPoints} dataKey="y" type="linear" stroke={theme.mutedInk} strokeDasharray="4 4" dot={false} activeDot={false} legendType="none" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "pie" && "labels" in data && "values" in data) {
    let { labels, values } = foldToOther(data.labels, data.values);
    if (style.sort && style.sort !== "none") {
      const paired = labels.map((label, i) => ({ label, value: values[i] }));
      paired.sort((a, b) => (style.sort === "asc" ? a.value - b.value : b.value - a.value));
      labels = paired.map((p) => p.label);
      values = paired.map((p) => p.value);
    }
    const rows = labels.map((label, i) => ({ name: label, value: values[i] }));
    return (
      <PieView
        chart={chart}
        rows={rows}
        isDonut={pieVariant(style) === "donut"}
        colorAt={colorsFor(rows.map((r) => r.name))}
        theme={theme}
        showLegend={showLegend}
        showDataLabels={showDataLabels}
        selected={selected}
        onPick={onDrillDown ? handlePointClick : undefined}
      />
    );
  }

  // Several lines on one axis ("Added / Retired / Overdue" by month): one per series_field value.
  if (chart.type === "line" && "labels" in data && "series" in data) {
    const rows = data.labels.map((label, i) => {
      const row: Record<string, string | number> = { name: label };
      data.series.forEach((s) => (row[s.name] = s.values[i] ?? 0));
      return row;
    });
    const variant = lineVariant(style);
    const interpolation = variant === "straight" ? "linear" : "monotone";
    const showDots = style.show_points ?? rows.length <= 24;
    const seriesColor = colorsFor(data.series.map((s) => s.name));
    const margin = { top: 8, right: 12, left: 0, bottom: style.x_axis_label ? 20 : 0 };
    const common = (
      <>
        {showGridlines && <CartesianGrid vertical={false} stroke={theme.gridline} />}
        <XAxis dataKey="name" tick={tick} tickFormatter={formatPeriod} axisLine={{ stroke: theme.baseline }} tickLine={false} minTickGap={24} interval="preserveStartEnd">
          {style.x_axis_label && <Label value={style.x_axis_label} position="insideBottom" offset={-15} fill={theme.mutedInk} fontSize={11} />}
        </XAxis>
        <YAxis tick={tick} tickFormatter={tickFormatter} axisLine={false} tickLine={false} width={style.y_axis_label ? 64 : 52}>
          {style.y_axis_label && <Label value={style.y_axis_label} angle={-90} position="insideLeft" fill={theme.mutedInk} fontSize={11} />}
        </YAxis>
        <Tooltip content={<TooltipCard theme={theme} chart={chart} />} cursor={{ stroke: theme.baseline, strokeDasharray: "3 3" }} />
        {/* Several series always get a legend, so no line is told apart by colour alone. */}
        <Legend verticalAlign="top" align="right" height={28} wrapperStyle={{ fontSize: 12, color: theme.secondaryInk }} iconType="plainline" />
      </>
    );
    if (variant === "area") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={margin}>
            {common}
            {data.series.map((s, i) => (
              <Area key={s.name} type={interpolation} dataKey={s.name} name={s.name} stackId="all" stroke={seriesColor(i)} strokeWidth={2} fill={seriesColor(i)} fillOpacity={0.18} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={margin}>
          {common}
          {data.series.map((s, i) => (
            <Line
              key={s.name}
              type={interpolation}
              dataKey={s.name}
              name={s.name}
              stroke={seriesColor(i)}
              strokeWidth={2}
              dot={showDots ? { r: 4, fill: seriesColor(i), stroke: theme.surface, strokeWidth: 2 } : false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: theme.surface }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "line" && "labels" in data && "values" in data) {
    const { labels, values } = decimateLine(data.labels, data.values);
    const displayValues = style.transform === "cumulative" ? cumulative(values) : values;
    const trend = style.show_trendline ? regressionValues(displayValues) : null;
    // Forecast is computed server-side on the raw (pre-cumulative) series, so only show it
    // alongside the untransformed view — overlaying it on a running total would misrepresent it.
    const forecast = style.transform !== "cumulative" ? data.forecast : undefined;
    const rows: { name: string; value: number | null; trend?: number; forecastValue?: number }[] = labels.map(
      (label, i) => ({
        name: label,
        value: displayValues[i],
        ...(trend ? { trend: trend[i] } : {}),
        ...(forecast && i === labels.length - 1 ? { forecastValue: displayValues[i] } : {}),
      })
    );
    if (forecast) {
      forecast.labels.forEach((label, i) => {
        rows.push({ name: label, value: null, forecastValue: forecast.values[i] });
      });
    }
    const variant = lineVariant(style);
    const interpolation = variant === "straight" ? "linear" : "monotone";
    const margin = { top: showDataLabels ? 20 : 8, right: 12, left: 0, bottom: style.x_axis_label ? 20 : 0 };

    const axes = (
      <>
        {showGridlines && <CartesianGrid vertical={false} stroke={theme.gridline} />}
        <XAxis dataKey="name" tick={tick} tickFormatter={formatPeriod} axisLine={{ stroke: theme.baseline }} tickLine={false} minTickGap={24} interval="preserveStartEnd">
          {style.x_axis_label && (
            <Label value={style.x_axis_label} position="insideBottom" offset={-15} fill={theme.mutedInk} fontSize={11} />
          )}
        </XAxis>
        <YAxis tick={tick} tickFormatter={tickFormatter} axisLine={false} tickLine={false} width={style.y_axis_label ? 64 : 52}>
          {style.y_axis_label && (
            <Label value={style.y_axis_label} angle={-90} position="insideLeft" fill={theme.mutedInk} fontSize={11} />
          )}
        </YAxis>
        <Tooltip content={<TooltipCard theme={theme} chart={chart} />} cursor={{ stroke: theme.baseline, strokeDasharray: "3 3" }} />
        {/* A single line is named by the card title; a legend only earns its place once a forecast joins it. */}
        {showLegend && forecast && <Legend wrapperStyle={{ fontSize: 12, color: theme.secondaryInk }} iconType="plainline" />}
      </>
    );

    const trendLine = trend && (
      <Line type="linear" dataKey="trend" stroke={theme.mutedInk} strokeDasharray="4 4" strokeWidth={1.5} dot={false} activeDot={false} legendType="none" />
    );
    const forecastLine = forecast && (
      <Line
        type={interpolation}
        dataKey="forecastValue"
        stroke={color(0)}
        strokeWidth={2}
        strokeDasharray="5 4"
        dot={style.show_points ? { r: 3, fill: color(0) } : false}
        name="Forecast"
        connectNulls
      />
    );

    if (variant === "area") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={margin}>
            {axes}
            <defs>
              <linearGradient id={`area-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color(0)} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color(0)} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area type={interpolation} dataKey="value" name={seriesName} stroke={color(0)} strokeWidth={2} fill={`url(#area-${chart.id})`} activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}>
              {showDataLabels && <LabelList dataKey="value" position="top" formatter={labelFormatter} fontSize={11} fill={theme.secondaryInk} />}
            </Area>
            {trendLine}
            {forecastLine}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={margin}>
          {axes}
          <Line
            type={interpolation}
            dataKey="value"
            name={seriesName}
            stroke={color(0)}
            strokeWidth={2}
            dot={style.show_points ? { r: 3, fill: color(0) } : false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }}
          >
            {showDataLabels && <LabelList dataKey="value" position="top" formatter={labelFormatter} fontSize={11} fill={theme.secondaryInk} />}
          </Line>
          {trendLine}
          {forecastLine}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "geo_map" && "labels" in data && "values" in data) {
    return (
      <PowerMapChart
        labels={data.labels}
        values={data.values}
        isDark={theme.isDark}
        format={chart.config.format}
        currency={chart.config.currency}
        onDrillDown={onDrillDown}
      />
    );
  }

  if (chart.type === "heatmap" && "cells" in data) {
    const { x_labels: xLabels, y_labels: yLabels, cells } = data;
    const lookup: Record<string, number> = {};
    let min = Infinity;
    let max = -Infinity;
    cells.forEach((c) => {
      lookup[`${c.x} ${c.y}`] = c.value;
      if (c.value < min) min = c.value;
      if (c.value > max) max = c.value;
    });
    if (!isFinite(min)) {
      min = 0;
      max = 0;
    }
    const range = max - min || 1;
    const baseColor = style.colors?.[0] || theme.categorical[0];

    if (xLabels.length === 0 || yLabels.length === 0) {
      return <div className="flex h-full items-center justify-center text-sm" style={{ color: theme.mutedInk }}>{tr("No data.")}</div>;
    }

    return (
      <div className="h-full min-h-[12rem] overflow-auto">
        <div
          className="grid gap-[2px]"
          style={{ gridTemplateColumns: `minmax(70px, auto) repeat(${xLabels.length}, minmax(32px, 1fr))` }}
        >
          <div />
          {xLabels.map((x) => (
            <div key={x} className="truncate px-1 pb-1 text-center text-[10px]" style={{ color: theme.mutedInk }} title={x}>
              {x}
            </div>
          ))}
          {yLabels.map((y) => (
            <Fragment key={y}>
              <div className="truncate pe-2 text-end text-[10px] leading-6" style={{ color: theme.mutedInk }} title={y}>
                {y}
              </div>
              {xLabels.map((x) => {
                const value = lookup[`${x} ${y}`];
                const t = value !== undefined ? (value - min) / range : 0;
                return (
                  <div
                    key={x}
                    title={`${x} / ${y}: ${value !== undefined ? formatValue(value, chart.config.format, chart.config.currency) : tr("no data")}`}
                    className="flex aspect-square items-center justify-center overflow-hidden rounded-sm text-[9px]"
                    style={{
                      background: value !== undefined ? hexToRgba(baseColor, 0.08 + t * 0.92) : theme.gridline,
                      color: t > 0.55 ? "#fff" : theme.primaryInk,
                    }}
                  >
                    {showDataLabels && value !== undefined ? formatValue(value, chart.config.format, chart.config.currency) : ""}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  if (chart.type === "bar" && "labels" in data) {
    const variant = barVariant(style);
    const isHorizontal = variant === "horizontal";
    // "percent" = 100% stacked: every bar is the same height and shows each series' share of it.
    const isPercent = variant === "percent";
    const isStacked = variant === "stacked" || isPercent;

    let rows: Record<string, unknown>[];
    let barKeys: string[];
    let displayValues: number[] | null = null;

    if ("series" in data) {
      rows = data.labels.map((label, i) => {
        const row: Record<string, unknown> = { name: label };
        data.series.forEach((s) => {
          row[s.name] = s.values[i];
        });
        return row;
      });
      barKeys = data.series.map((s) => s.name);
    } else {
      let { labels, values } = foldToOther(data.labels, data.values);
      if (style.sort && style.sort !== "none") {
        const paired = labels.map((label, i) => ({ label, value: values[i] }));
        paired.sort((a, b) => (style.sort === "asc" ? a.value - b.value : b.value - a.value));
        labels = paired.map((p) => p.label);
        values = paired.map((p) => p.value);
      }
      displayValues = style.transform === "cumulative" ? cumulative(values) : values;
      rows = labels.map((label, i) => ({ name: label, value: displayValues![i] }));
      barKeys = ["value"];
    }

    const isMultiSeries = barKeys.length > 1;
    // Clean 0-based ticks only when nothing is negative; otherwise let Recharts fit both signs.
    const valueDomain: typeof BAR_DOMAIN | [number, number] | undefined = isPercent && barKeys.length > 1
      ? [0, 1]
      : rows.every((r) => barKeys.every((k) => Number(r[k] ?? 0) >= 0))
        ? BAR_DOMAIN
        : undefined;
    const valueTicks = isPercent && barKeys.length > 1 ? (v: number) => `${Math.round(v * 100)}%` : tickFormatter;
    const showTrend = style.show_trendline && !isMultiSeries && !isHorizontal && displayValues && displayValues.length > 1;
    if (showTrend && displayValues) {
      const trend = regressionValues(displayValues);
      rows = rows.map((row, i) => ({ ...row, trend: trend[i] }));
    }
    const margin = { top: showDataLabels ? 20 : 8, right: 12, left: 0, bottom: !isHorizontal && style.x_axis_label ? 20 : 0 };

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} layout={isHorizontal ? "vertical" : "horizontal"} margin={margin} stackOffset={isPercent && barKeys.length > 1 ? "expand" : undefined}>
          {showGridlines && <CartesianGrid vertical={isHorizontal} horizontal={!isHorizontal} stroke={theme.gridline} />}
          {isHorizontal ? (
            <>
              <XAxis type="number" tick={tick} tickFormatter={valueTicks} axisLine={false} tickLine={false} domain={valueDomain} tickCount={5} />
              <YAxis
                type="category"
                dataKey="name"
                tick={tick}
                tickFormatter={formatPeriod}
                axisLine={{ stroke: theme.baseline }}
                tickLine={false}
                width={96}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={tick} tickFormatter={formatPeriod} axisLine={{ stroke: theme.baseline }} tickLine={false} minTickGap={8} interval="preserveStartEnd">
                {style.x_axis_label && (
                  <Label value={style.x_axis_label} position="insideBottom" offset={-15} fill={theme.mutedInk} fontSize={11} />
                )}
              </XAxis>
              <YAxis tick={tick} tickFormatter={valueTicks} axisLine={false} tickLine={false} width={style.y_axis_label ? 64 : 52} domain={valueDomain} tickCount={5}>
                {style.y_axis_label && (
                  <Label value={style.y_axis_label} angle={-90} position="insideLeft" fill={theme.mutedInk} fontSize={11} />
                )}
              </YAxis>
            </>
          )}
          <Tooltip content={<TooltipCard theme={theme} chart={chart} />} cursor={{ fill: theme.gridline, opacity: 0.6 }} />
          {/* One series is named by the card title; a legend box for it would just say "value". */}
          {showLegend && isMultiSeries && (
            <Legend wrapperStyle={{ fontSize: 12, color: theme.secondaryInk }} iconType="circle" iconSize={8} />
          )}
          {barKeys.map((key, idx) => (
            <Bar
              key={key}
              dataKey={key}
              radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={44}
              name={isMultiSeries ? key : seriesName}
              stackId={isStacked ? "series" : undefined}
              fill={isMultiSeries ? colorsFor(barKeys)(idx) : color(0)}
              onClick={!isMultiSeries && onDrillDown ? (_, i) => handlePointClick(rows[i].name as string) : undefined}
              cursor={!isMultiSeries && onDrillDown ? "pointer" : undefined}
            >
              {!isMultiSeries &&
                displayValues &&
                rows.map((row, i) => (
                  <Cell
                    key={i}
                    fill={matchColorRule(displayValues![i], style.color_rules, color(style.colors?.length ? i : 0))}
                    fillOpacity={selected && selected !== row.name ? 0.3 : 1}
                  />
                ))}
              {showDataLabels && (
                <LabelList
                  dataKey={key}
                  position={isHorizontal ? "right" : "top"}
                  formatter={labelFormatter}
                  fontSize={11}
                  fill={theme.secondaryInk}
                  // Vertical bars: drop a label wider than its bar instead of letting neighbours collide
                  // (narrow cards / phones); the tooltip still carries every value.
                  content={
                    isHorizontal
                      ? undefined
                      : (props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) => {
                          const text = labelFormatter(props.value);
                          const width = Number(props.width ?? 0);
                          if (text.length * 6.2 > width + 10) return null;
                          return (
                            <text x={Number(props.x) + width / 2} y={Number(props.y) - 6} textAnchor="middle" fontSize={11} fill={theme.secondaryInk}>
                              {text}
                            </text>
                          );
                        }
                  }
                />
              )}
            </Bar>
          ))}
          {showTrend && (
            <Line type="linear" dataKey="trend" stroke={theme.mutedInk} strokeDasharray="4 4" strokeWidth={1.5} dot={false} activeDot={false} legendType="none" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return null;
}
