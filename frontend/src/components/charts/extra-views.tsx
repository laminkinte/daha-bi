"use client";

import { useMemo, useState } from "react";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
} from "recharts";
import type { Chart, ChartSeries, FeedItem } from "@/lib/api";
import type { ChartTheme } from "@/lib/chart-theme";
import { formatCompact, formatValue } from "@/lib/format-value";

/* ─────────────────────────────── status words ─────────────────────────────── */

export type Tone = "good" | "warning" | "critical" | "neutral";

const GOOD = /^(active|ok|okay|good|healthy|paid|completed?|delivered|success(ful)?|approved|online|connected|done|resolved|won|in stock|excellent|available|passed|live|running|open)$/i;
const WARNING = /^(pending|inactive|fair|warning|medium|in progress|processing|in review|review|partial(ly paid)?|low stock|due|scheduled|on hold|draft|maintenance|idle|waiting|unpaid|average|moderate)$/i;
const CRITICAL = /^(critical|failed|fail|failure|poor|cancell?ed|overdue|offline|error|rejected|lost|down|out of stock|refunded|disconnected|expired|blocked|urgent|declined|bad|stopped|returned|churned)$/i;

/** The state a word describes ("Active" → good, "Overdue" → critical); neutral when it isn't a state. */
export function statusTone(value: unknown): Tone {
  const s = String(value ?? "").trim();
  if (GOOD.test(s)) return "good";
  if (WARNING.test(s)) return "warning";
  if (CRITICAL.test(s)) return "critical";
  return "neutral";
}

const TONE_VAR: Record<Tone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
  neutral: "var(--text-muted)",
};

const TONE_HEX: Record<Exclude<Tone, "neutral">, string[]> = {
  good: ["#0ca30c", "#1baf7a"],
  warning: ["#fab219", "#eda100"],
  critical: ["#d03b3b", "#ec835a"],
};

/**
 * When every category is a state word (Active / Inactive / Critical, completed / cancelled…),
 * colours that carry the meaning — green for good, amber for warning, red for problems — instead
 * of arbitrary palette slots. Null when the labels aren't all states.
 */
export function statusColors(labels: string[]): string[] | null {
  if (labels.length < 2 || labels.length > 6) return null;
  const tones = labels.map(statusTone);
  if (tones.some((t) => t === "neutral")) return null;
  const used: Record<string, number> = {};
  return tones.map((t) => {
    const list = TONE_HEX[t as Exclude<Tone, "neutral">];
    const n = used[t] ?? 0;
    used[t] = n + 1;
    return list[n % list.length];
  });
}

/** A tinted pill with a coloured dot. The word itself stays in ink, so the state never relies on colour alone. */
export function StatusBadge({ value }: { value: unknown }) {
  const tone = statusTone(value);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium"
      style={{ background: `color-mix(in srgb, ${TONE_VAR[tone]} 14%, transparent)`, color: "var(--text-primary)" }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[tone] }} />
      {String(value)}
    </span>
  );
}

/** Black or white, whichever reads better on the given "#rrggbb" fill. */
export function readableInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? "#0b0b0b" : "#ffffff";
}

/** "2 hours ago" for recent times, a plain date for anything older than a month. */
export function whenText(raw: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  const secs = (Date.now() - d.getTime()) / 1000;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  if (secs >= 0 && secs < 30 * 86400) {
    if (dateOnly) {
      const days = Math.floor(secs / 86400);
      return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
    }
    if (secs < 60) return "Just now";
    if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
    const days = Math.floor(secs / 86400);
    return days === 1 ? "Yesterday" : `${days} days ago`;
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/* ──────────────────────────────── smart table ──────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;
const STATUS_NAME = /status|state|health|priority|stage|condition|level|result|outcome|payment|tier/i;
const NO_GROUPING = /(^|_)(id|year|phone|zip|code|postal)$/i;

type ColKind = "number" | "badge" | "date" | "text";

function classify(col: string, rows: Record<string, unknown>[]): ColKind {
  const values = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== "");
  if (!values.length) return "text";
  if (values.every((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))))) return "number";
  if (values.every((v) => typeof v === "string" && ISO_DATE.test(v))) return "date";
  const distinct = Array.from(new Set(values.map((v) => String(v))));
  if (rows.length >= 2 && distinct.length <= 12) {
    const toned = distinct.filter((v) => statusTone(v) !== "neutral").length;
    if (STATUS_NAME.test(col) || toned >= Math.max(1, Math.ceil(distinct.length / 2))) return "badge";
  }
  return "text";
}

/**
 * The table visual: sortable headers, a quick search, numbers right-aligned and formatted, and
 * status-like columns ("Active", "Overdue", "Paid"…) drawn as coloured badges.
 */
export function SmartTable({ columns, rows, theme }: { columns: string[]; rows: Record<string, unknown>[]; theme: ChartTheme }) {
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState("");
  const kinds = useMemo(() => Object.fromEntries(columns.map((c) => [c, classify(c, rows)])) as Record<string, ColKind>, [columns, rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle ? rows.filter((r) => columns.some((c) => String(r[c] ?? "").toLowerCase().includes(needle))) : rows;
    if (sort) {
      const numeric = kinds[sort.col] === "number";
      out = [...out].sort((a, b) => {
        const x = a[sort.col];
        const y = b[sort.col];
        const cmp = numeric ? Number(x ?? 0) - Number(y ?? 0) : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true });
        return cmp * sort.dir;
      });
    }
    return out;
  }, [rows, columns, q, sort, kinds]);

  function cell(col: string, v: unknown) {
    if (v === null || v === undefined || v === "") return <span style={{ color: theme.mutedInk }}>—</span>;
    switch (kinds[col]) {
      case "badge":
        return <StatusBadge value={v} />;
      case "number":
        return NO_GROUPING.test(col) ? String(v) : Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
      case "date": {
        const s = String(v);
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
        return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      }
      default:
        return String(v);
    }
  }

  return (
    <div className="flex h-full min-h-[12rem] flex-col">
      {rows.length > 8 && (
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search rows…"
            aria-label="Search rows"
            className="w-48 max-w-full rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: theme.mutedInk }}>
            {shown.length === rows.length ? `${rows.length.toLocaleString()} rows` : `${shown.length.toLocaleString()} of ${rows.length.toLocaleString()}`}
          </span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border" style={{ borderColor: theme.gridline }}>
        <table className="w-full text-left text-[13px] tabular-nums">
          <thead className="sticky top-0 z-[1]" style={{ background: "var(--surface-2)" }}>
            <tr>
              {columns.map((col) => {
                const on = sort?.col === col;
                return (
                  <th key={col} className={`whitespace-nowrap px-3 py-2 font-semibold ${kinds[col] === "number" ? "text-right" : ""}`} style={{ color: theme.secondaryInk, borderBottom: `1px solid ${theme.baseline}` }}>
                    <button
                      type="button"
                      onClick={() => setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }))}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
                      title="Sort"
                    >
                      {col.charAt(0).toUpperCase() + col.slice(1).replace(/_/g, " ")}
                      <span className="text-[9px]" style={{ opacity: on ? 1 : 0.35 }}>
                        {on && sort?.dir === -1 ? "▼" : "▲"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-[var(--surface-2)]" style={{ borderBottom: `1px solid ${theme.gridline}` }}>
                {columns.map((col, ci) => (
                  <td
                    key={col}
                    className={`whitespace-nowrap px-3 py-2 ${kinds[col] === "number" ? "text-right" : ""} ${ci === 0 ? "font-medium" : ""}`}
                    style={{ color: theme.primaryInk }}
                  >
                    {cell(col, row[col])}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center" style={{ color: theme.mutedInk }}>
                  No matching rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────────────── gauge ───────────────────────────────── */

function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((s) => s >= v) ?? 10 * mag;
  return step;
}

/** A half-dial: the value against its target (or a rounded-up scale when no target is set). */
export function GaugeView({ chart, value, color, theme }: { chart: Chart; value: number; color: string; theme: ChartTheme }) {
  const target = typeof chart.config.target === "number" && chart.config.target > 0 ? chart.config.target : null;
  const max = target ?? niceMax(value);
  const f = Math.max(0, Math.min(1, value / max));
  const r = 80;
  const at = (t: number) => {
    const a = Math.PI - t * Math.PI;
    return `${(100 + r * Math.cos(a)).toFixed(2)} ${(100 - r * Math.sin(a)).toFixed(2)}`;
  };
  const fmt = (v: number) => formatValue(v, chart.config.format, chart.config.currency);
  const compact = (v: number) => formatCompact(v, chart.config.format, chart.config.currency);

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <svg viewBox="0 0 200 118" className="h-full max-h-[220px] w-full" role="img" aria-label={`${fmt(value)}${target ? ` of ${fmt(target)} target` : ""}`}>
        <path d={`M ${at(0)} A ${r} ${r} 0 0 1 ${at(1)}`} fill="none" stroke={theme.gridline} strokeWidth={16} strokeLinecap="round" />
        {f > 0 && <path d={`M ${at(0)} A ${r} ${r} 0 0 1 ${at(f)}`} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round" />}
        <text x="100" y="88" textAnchor="middle" fontSize="24" fontWeight="600" fill={theme.primaryInk} style={{ fontVariantNumeric: "tabular-nums" }}>
          {compact(value)}
        </text>
        <text x="100" y="106" textAnchor="middle" fontSize="10.5" fill={theme.mutedInk}>
          {target ? `${Math.round((value / target) * 100)}% of ${compact(target)} target` : "of " + compact(max)}
        </text>
        <text x={100 - r} y="116" textAnchor="middle" fontSize="9" fill={theme.mutedInk}>0</text>
        <text x={100 + r} y="116" textAnchor="middle" fontSize="9" fill={theme.mutedInk}>{compact(max)}</text>
      </svg>
    </div>
  );
}

/* ─────────────────────────────── ranked list ─────────────────────────────── */

/** Label, a thin share bar and the value — a compact leaderboard / "stat list". */
export function ListView({
  chart,
  rows,
  color,
  theme,
  selected,
  onPick,
}: {
  chart: Chart;
  rows: { name: string; value: number }[];
  color: string;
  theme: ChartTheme;
  selected?: string;
  onPick?: (name: string) => void;
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
  return (
    <div className="h-full overflow-y-auto pr-1">
      {rows.map((r) => (
        <button
          key={r.name}
          type="button"
          onClick={onPick ? () => onPick(r.name) : undefined}
          className={`flex w-full items-center gap-3 border-b py-2 text-left last:border-0 ${onPick ? "cursor-pointer" : "cursor-default"}`}
          style={{ borderColor: theme.gridline, opacity: selected && selected !== r.name ? 0.35 : 1 }}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px]" style={{ color: theme.secondaryInk }} title={r.name}>
              {r.name}
            </span>
            <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full" style={{ background: theme.gridline }}>
              <span className="block h-full rounded-full" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: color }} />
            </span>
          </span>
          <span className="shrink-0 text-lg font-semibold tabular-nums" style={{ color: theme.primaryInk }}>
            {formatCompact(r.value, chart.config.format, chart.config.currency)}
          </span>
        </button>
      ))}
      {rows.length === 0 && <p className="py-6 text-center text-sm" style={{ color: theme.mutedInk }}>No data.</p>}
    </div>
  );
}

/* ───────────────────────────────── funnel ───────────────────────────────── */

/** Stages largest first, each bar centred and sized to its value, with its share of the first stage. */
export function FunnelView({ chart, rows, color, theme }: { chart: Chart; rows: { name: string; value: number }[]; color: string; theme: ChartTheme }) {
  const first = rows[0]?.value || 1;
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 overflow-y-auto">
      {rows.map((r, i) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px]">
          <span className="truncate text-right" style={{ color: theme.secondaryInk }} title={r.name}>
            {r.name}
          </span>
          <span className="flex h-8 justify-center">
            <span
              className="h-full rounded-[4px]"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color, opacity: 1 - i * (0.5 / Math.max(1, rows.length - 1)) }}
              title={`${r.name}: ${formatValue(r.value, chart.config.format, chart.config.currency)}`}
            />
          </span>
          <span className="whitespace-nowrap text-right tabular-nums">
            <span className="font-semibold" style={{ color: theme.primaryInk }}>
              {formatCompact(r.value, chart.config.format, chart.config.currency)}
            </span>
            {i > 0 && <span style={{ color: theme.mutedInk }}> · {Math.round((r.value / first) * 100)}%</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────── treemap ──────────────────────────────── */

type TreemapNodeProps = { x?: number; y?: number; width?: number; height?: number; index?: number; name?: string; value?: number };

/** Each category as a rectangle sized by its value. */
export function TreemapView({
  chart,
  rows,
  colorAt,
  theme,
  onPick,
}: {
  chart: Chart;
  rows: { name: string; value: number }[];
  colorAt: (i: number) => string;
  theme: ChartTheme;
  onPick?: (name: string) => void;
}) {
  const data = rows.filter((r) => r.value > 0).map((r) => ({ name: r.name, size: r.value }));
  const total = data.reduce((s, d) => s + d.size, 0) || 1;
  const renderNode = (props: TreemapNodeProps) => {
    const { x = 0, y = 0, width = 0, height = 0, index = 0, name = "", value = 0 } = props;
    const fill = colorAt(index);
    const ink = readableInk(fill);
    return (
      <g onClick={onPick ? () => onPick(name) : undefined} style={{ cursor: onPick ? "pointer" : "default" }}>
        <rect x={x} y={y} width={width} height={height} rx={4} fill={fill} stroke={theme.surface} strokeWidth={2} />
        {width > 56 && height > 34 && (
          <>
            <text x={x + 8} y={y + 18} fontSize={12} fontWeight={600} fill={ink}>
              {name.length > width / 7.5 ? `${name.slice(0, Math.max(1, Math.floor(width / 7.5) - 1))}…` : name}
            </text>
            <text x={x + 8} y={y + 33} fontSize={11} fill={ink} opacity={0.85}>
              {formatCompact(value, chart.config.format, chart.config.currency)} · {Math.round((value / total) * 100)}%
            </text>
          </>
        )}
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap data={data} dataKey="size" nameKey="name" isAnimationActive={false} content={renderNode}>
        <Tooltip
          formatter={(v) => formatValue(Number(v), chart.config.format, chart.config.currency)}
          contentStyle={{ background: theme.surface, border: `1px solid ${theme.gridline}`, borderRadius: 8, fontSize: 12, color: theme.primaryInk }}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}

/* ───────────────────────────────── radar ───────────────────────────────── */

/** A spider chart: each category is a spoke. Several series overlay as outlines. */
export function RadarView({
  chart,
  labels,
  series,
  colorAt,
  theme,
  showLegend,
}: {
  chart: Chart;
  labels: string[];
  series: ChartSeries[];
  colorAt: (i: number) => string;
  theme: ChartTheme;
  showLegend: boolean;
}) {
  const rows = labels.map((label, i) => {
    const row: Record<string, string | number> = { name: label };
    series.forEach((s) => (row[s.name] = s.values[i] ?? 0));
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={rows} outerRadius="72%">
        <PolarGrid stroke={theme.gridline} />
        <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: theme.secondaryInk }} />
        <PolarRadiusAxis tick={false} axisLine={false} />
        {series.map((s, i) => (
          <Radar key={s.name} name={s.name} dataKey={s.name} stroke={colorAt(i)} strokeWidth={2} fill={colorAt(i)} fillOpacity={series.length > 1 ? 0.12 : 0.25} isAnimationActive={false} />
        ))}
        <Tooltip
          formatter={(v) => formatValue(Number(v), chart.config.format, chart.config.currency)}
          contentStyle={{ background: theme.surface, border: `1px solid ${theme.gridline}`, borderRadius: 8, fontSize: 12, color: theme.primaryInk }}
        />
        {(showLegend || series.length > 1) && <Legend wrapperStyle={{ fontSize: 12, color: theme.secondaryInk }} iconType="circle" iconSize={8} />}
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────── activity feed ─────────────────────────────── */

/** Newest rows as an activity list: what happened, its state, how much, and when. */
export function FeedView({ chart, items, theme }: { chart: Chart; items: FeedItem[]; theme: ChartTheme }) {
  if (!items.length) return <p className="py-6 text-center text-sm" style={{ color: theme.mutedInk }}>No recent activity.</p>;
  return (
    <ul className="h-full overflow-y-auto pr-1">
      {items.map((item, i) => {
        const tone = item.tag ? statusTone(item.tag) : "neutral";
        const dot = tone === "neutral" ? "var(--accent)" : TONE_VAR[tone];
        return (
          <li key={i} className="flex items-center gap-3 border-b py-2.5 last:border-0" style={{ borderColor: theme.gridline }}>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${dot} 16%, transparent)`, color: dot }}
              aria-hidden
            >
              {tone === "critical" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
              ) : tone === "good" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              ) : tone === "warning" ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /></svg>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium" style={{ color: theme.primaryInk }} title={item.title}>
                {item.title}
              </span>
              <span className="mt-0.5 flex items-center gap-2 text-[11.5px]" style={{ color: theme.mutedInk }}>
                {item.tag && <StatusBadge value={item.tag} />}
                {item.value !== undefined && (
                  <span className="tabular-nums" style={{ color: theme.secondaryInk }}>
                    {formatValue(item.value, chart.config.format, chart.config.currency)}
                  </span>
                )}
              </span>
            </span>
            <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: theme.mutedInk }} title={item.at}>
              {whenText(item.at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
