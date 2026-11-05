"use client";

import { Fragment } from "react";
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
import { formatValue } from "@/lib/format-value";
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
  return style.donut ? "donut" : "pie";
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
}: {
  active?: boolean;
  payload?: { value: number; name?: string; dataKey?: string }[];
  label?: string;
  theme: ReturnType<typeof useChartTheme>;
  chart: Chart;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.dataKey !== "trend" && typeof p.value === "number" && Number.isFinite(p.value));
  if (!rows.length) return null;
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
      {label && <div style={{ color: theme.secondaryInk, marginBottom: 2 }}>{label}</div>}
      {rows.map((p, i) => (
        <div key={p.name ?? i} style={{ fontWeight: 600 }}>
          {p.name && rows.length > 1 ? `${p.name}: ` : ""}
          {formatValue(p.value, chart.config.format, chart.config.currency)}
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
      {p.label && <div style={{ color: theme.secondaryInk, marginBottom: 2 }}>{p.label}</div>}
      <div>
        {chart.config.x_field ?? "x"}: <strong>{p.x.toLocaleString()}</strong>
      </div>
      <div>
        {chart.config.y_field ?? "y"}: <strong>{formatValue(p.y, chart.config.format, chart.config.currency)}</strong>
      </div>
    </div>
  );
}

export default function ChartRenderer({
  chart,
  data,
  onDrillDown,
}: {
  chart: Chart;
  data: ChartData;
  onDrillDown?: (value: string) => void;
}) {
  const theme = useChartTheme();
  const style: ChartStyle = chart.config.style ?? {};
  const showLegend = style.show_legend ?? chart.type === "pie";
  const showGridlines = style.show_gridlines ?? true;
  const showDataLabels = style.show_data_labels ?? false;

  function color(i: number): string {
    return style.colors?.[i] || theme.categorical[i % theme.categorical.length];
  }

  function handlePointClick(name: string) {
    if (!onDrillDown || name === "Other") return;
    onDrillDown(name);
  }

  function labelFormatter(value: unknown) {
    return formatValue(Number(value), chart.config.format, chart.config.currency);
  }

  if (chart.type === "kpi" && "value" in data) {
    const variant = kpiVariant(style);
    const kpiColor = matchColorRule(data.value, style.color_rules, style.colors?.[0] || theme.primaryInk);
    const target = chart.config.target;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <div className="flex flex-col items-center">
          <div className="text-4xl font-semibold tabular-nums" style={{ color: kpiColor }}>
            {formatValue(data.value, chart.config.format, chart.config.currency)}
          </div>
          <div className="mt-1 text-sm" style={{ color: theme.mutedInk }}>
            {(chart.config.agg ?? "count").replace("_", " ")} of {chart.config.y_field ?? "records"}
          </div>
        </div>

        {variant === "sparkline" && data.trend && data.trend.values.length > 1 && (
          <ResponsiveContainer width="90%" height={48}>
            <LineChart data={data.trend.labels.map((label, i) => ({ name: label, value: data.trend!.values[i] }))}>
              <Line type="monotone" dataKey="value" stroke={kpiColor} strokeWidth={2} dot={false} />
              <Tooltip content={<TooltipCard theme={theme} chart={chart} />} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {variant === "progress" && typeof target === "number" && target > 0 && (
          <div className="w-full max-w-[200px]">
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: theme.gridline }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, (data.value / target) * 100))}%`,
                  background: kpiColor,
                }}
              />
            </div>
            <div className="mt-1 text-center text-xs" style={{ color: theme.mutedInk }}>
              {Math.round((data.value / target) * 100)}% of {formatValue(target, chart.config.format, chart.config.currency)}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (chart.type === "table" && "columns" in data) {
    return (
      <div className="h-full min-h-[12rem] overflow-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.baseline}` }}>
              {data.columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1 font-medium"
                  style={{ color: theme.secondaryInk }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${theme.gridline}` }}>
                {data.columns.map((col) => (
                  <td key={col} className="px-2 py-1" style={{ color: theme.primaryInk }}>
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
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
          <YAxis type="number" dataKey="y" tick={{ fontSize: 11, fill: theme.mutedInk }} axisLine={false} tickLine={false} width={style.y_axis_label ? 60 : 48}>
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
    const isDonut = pieVariant(style) === "donut";

    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius={isDonut ? 55 : 0}
            outerRadius={90}
            stroke={theme.surface}
            strokeWidth={2}
            onClick={onDrillDown ? (_, i) => handlePointClick(rows[i].name) : undefined}
            cursor={onDrillDown ? "pointer" : undefined}
            label={showDataLabels ? ({ value }) => labelFormatter(value) : undefined}
            labelLine={showDataLabels}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={color(i)} />
            ))}
          </Pie>
          {showLegend && (
            <Legend
              wrapperStyle={{ fontSize: 12, color: theme.secondaryInk }}
              iconType="circle"
              iconSize={8}
            />
          )}
          <Tooltip content={<TooltipCard theme={theme} chart={chart} />} />
        </PieChart>
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
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme.mutedInk }} axisLine={{ stroke: theme.baseline }} tickLine={false}>
          {style.x_axis_label && (
            <Label value={style.x_axis_label} position="insideBottom" offset={-15} fill={theme.mutedInk} fontSize={11} />
          )}
        </XAxis>
        <YAxis tick={{ fontSize: 11, fill: theme.mutedInk }} axisLine={false} tickLine={false} width={style.y_axis_label ? 60 : 48}>
          {style.y_axis_label && (
            <Label value={style.y_axis_label} angle={-90} position="insideLeft" fill={theme.mutedInk} fontSize={11} />
          )}
        </YAxis>
        <Tooltip content={<TooltipCard theme={theme} chart={chart} />} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 12, color: theme.secondaryInk }} />}
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
            <Area type={interpolation} dataKey="value" stroke={color(0)} strokeWidth={2} fill={color(0)} fillOpacity={0.25}>
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
            stroke={color(0)}
            strokeWidth={2}
            dot={style.show_points ? { r: 3, fill: color(0) } : false}
            activeDot={{ r: 5 }}
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
        isDark={theme.surface !== "#fcfcfb"}
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
      return <div className="flex h-full items-center justify-center text-sm" style={{ color: theme.mutedInk }}>No data.</div>;
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
              <div className="truncate pr-2 text-right text-[10px] leading-6" style={{ color: theme.mutedInk }} title={y}>
                {y}
              </div>
              {xLabels.map((x) => {
                const value = lookup[`${x} ${y}`];
                const t = value !== undefined ? (value - min) / range : 0;
                return (
                  <div
                    key={x}
                    title={`${x} / ${y}: ${value !== undefined ? formatValue(value, chart.config.format, chart.config.currency) : "no data"}`}
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
    const isStacked = variant === "stacked";

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
    const showTrend = style.show_trendline && !isMultiSeries && !isHorizontal && displayValues && displayValues.length > 1;
    if (showTrend && displayValues) {
      const trend = regressionValues(displayValues);
      rows = rows.map((row, i) => ({ ...row, trend: trend[i] }));
    }
    const margin = { top: showDataLabels ? 20 : 8, right: 12, left: 0, bottom: !isHorizontal && style.x_axis_label ? 20 : 0 };

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} layout={isHorizontal ? "vertical" : "horizontal"} margin={margin}>
          {showGridlines && <CartesianGrid vertical={isHorizontal} horizontal={!isHorizontal} stroke={theme.gridline} />}
          {isHorizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11, fill: theme.mutedInk }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: theme.mutedInk }}
                axisLine={{ stroke: theme.baseline }}
                tickLine={false}
                width={90}
              />
            </>
          ) : (
            <>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme.mutedInk }} axisLine={{ stroke: theme.baseline }} tickLine={false}>
                {style.x_axis_label && (
                  <Label value={style.x_axis_label} position="insideBottom" offset={-15} fill={theme.mutedInk} fontSize={11} />
                )}
              </XAxis>
              <YAxis tick={{ fontSize: 11, fill: theme.mutedInk }} axisLine={false} tickLine={false} width={style.y_axis_label ? 60 : 48}>
                {style.y_axis_label && (
                  <Label value={style.y_axis_label} angle={-90} position="insideLeft" fill={theme.mutedInk} fontSize={11} />
                )}
              </YAxis>
            </>
          )}
          <Tooltip content={<TooltipCard theme={theme} chart={chart} />} cursor={{ fill: theme.gridline }} />
          {showLegend && <Legend wrapperStyle={{ fontSize: 12, color: theme.secondaryInk }} />}
          {barKeys.map((key, idx) => (
            <Bar
              key={key}
              dataKey={key}
              radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={48}
              stackId={isStacked ? "series" : undefined}
              fill={isMultiSeries ? color(idx) : undefined}
              onClick={!isMultiSeries && onDrillDown ? (_, i) => handlePointClick(rows[i].name as string) : undefined}
              cursor={!isMultiSeries && onDrillDown ? "pointer" : undefined}
            >
              {!isMultiSeries &&
                displayValues &&
                rows.map((_, i) => (
                  <Cell key={i} fill={matchColorRule(displayValues![i], style.color_rules, color(style.colors?.length ? i : 0))} />
                ))}
              {showDataLabels && (
                <LabelList
                  dataKey={key}
                  position={isHorizontal ? "right" : "top"}
                  formatter={labelFormatter}
                  fontSize={11}
                  fill={theme.secondaryInk}
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
