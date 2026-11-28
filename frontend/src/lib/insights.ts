import type { Chart, ChartData } from "./api";
import { formatValue } from "./format-value";
import { translate, uiLocaleTag } from "@/i18n/ui";

export type Insight = {
  text: string;
  tone: "up" | "down" | "neutral";
};

function formatNumber(n: number): string {
  return n.toLocaleString(uiLocaleTag(), { maximumFractionDigits: 1 });
}

export function computeInsight(chart: Chart, data: ChartData): Insight | null {
  if (!("labels" in data) || !("values" in data) || data.labels.length === 0) return null;

  const { labels, values } = data;

  if (chart.type === "line") {
    if (values.length < 2) return null;
    const first = values[0];
    const last = values[values.length - 1];
    if (first === 0) return null;
    const pct = ((last - first) / Math.abs(first)) * 100;
    const tone: Insight["tone"] = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "neutral";
    const arrow = tone === "up" ? "↑" : tone === "down" ? "↓" : "→";
    return {
      text: `${arrow} ` + translate("{pct}% from {from} to {to}", { pct: formatNumber(Math.abs(pct)), from: labels[0], to: labels[labels.length - 1] }),
      tone,
    };
  }

  if (chart.type === "bar" || chart.type === "pie") {
    let maxIdx = 0;
    let minIdx = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[maxIdx]) maxIdx = i;
      if (values[i] < values[minIdx]) minIdx = i;
    }
    if (maxIdx === minIdx) return null;
    const fmt = (n: number) => formatValue(n, chart.config.format, chart.config.currency);
    return {
      text: translate("Highest: {high} ({highValue}) · Lowest: {low} ({lowValue})", { high: labels[maxIdx], highValue: fmt(values[maxIdx]), low: labels[minIdx], lowValue: fmt(values[minIdx]) }),
      tone: "neutral",
    };
  }

  return null;
}
