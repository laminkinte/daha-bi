import type { Chart, ChartType, DatasetColumn } from "@/lib/api";

export type ColumnKind = "number" | "date" | "text";

const DATE_RE = /^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2}(:\d{2})?)?/;

/**
 * Infers what each column holds from a sample of rows, so the chart builder can offer numbers as
 * measures and text/dates as groupings. Columns named like ids count as text: summing an id is
 * never what anyone wants.
 */
export function inferColumnKinds(columns: DatasetColumn[], rows: Record<string, unknown>[]): Record<string, ColumnKind> {
  const kinds: Record<string, ColumnKind> = {};
  for (const col of columns) {
    const values = rows.map((r) => r[col.name]).filter((v) => v !== null && v !== undefined && v !== "");
    if (/(^|_)id$/i.test(col.name) || /phone|zip|postal/i.test(col.name)) {
      kinds[col.name] = "text";
    } else if (values.length > 0 && values.every((v) => typeof v === "string" && DATE_RE.test(v))) {
      kinds[col.name] = "date";
    } else if (values.length > 0 && values.every((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))))) {
      kinds[col.name] = "number";
    } else if (/date|time|month|year|day|_at$/i.test(col.name)) {
      kinds[col.name] = "date";
    } else {
      kinds[col.name] = "text";
    }
  }
  return kinds;
}

const AGG_WORD: Record<string, string> = {
  sum: "Total",
  avg: "Average",
  min: "Lowest",
  max: "Highest",
  count_distinct: "Distinct",
};

function label(columns: DatasetColumn[] | undefined, name: string | undefined) {
  if (!name) return "";
  return columns?.find((c) => c.name === name)?.label ?? name.replace(/_/g, " ");
}

/** The measure in words: "Total revenue", "Number of records", "Distinct customer". */
export function measurePhrase(config: Chart["config"], columns?: DatasetColumn[], type?: ChartType): string {
  const agg = config.agg ?? "count";
  const field = type === "heatmap" ? config.value_field : config.y_field;
  if (agg === "count" || !field) return "Number of records";
  return `${AGG_WORD[agg] ?? agg} ${label(columns, field).toLowerCase()}`;
}

/** A readable default title for a chart definition, e.g. "Total revenue by country". */
export function suggestTitle(type: ChartType, config: Chart["config"], columns?: DatasetColumn[]): string {
  const x = label(columns, config.x_field).toLowerCase();
  switch (type) {
    case "table":
      return "Data table";
    case "scatter":
      return config.x_field && config.y_field
        ? `${label(columns, config.y_field)} vs ${label(columns, config.x_field).toLowerCase()}`
        : "Scatter plot";
    case "heatmap":
      return config.x_field && config.y_field
        ? `${measurePhrase(config, columns, type)} by ${label(columns, config.y_field).toLowerCase()} and ${x}`
        : "Heatmap";
    case "kpi":
    case "gauge":
      return measurePhrase(config, columns, type);
    case "feed":
      return config.label_field ? `Latest ${label(columns, config.label_field).toLowerCase()} activity` : "Recent activity";
    case "line":
      return x ? `${measurePhrase(config, columns, type)} over ${x}` : measurePhrase(config, columns, type);
    default: {
      const split = config.series_field ? ` and ${label(columns, config.series_field).toLowerCase()}` : "";
      return x ? `${measurePhrase(config, columns, type)} by ${x}${split}` : measurePhrase(config, columns, type);
    }
  }
}

/** One-line subtitle for a chart card: what it measures, from which dataset. */
export function describeChart(chart: Chart): string {
  const cols = chart.dataset?.columns;
  let what: string;
  switch (chart.type) {
    case "table":
      what = "Raw rows";
      break;
    case "scatter":
      what = `${label(cols, chart.config.y_field)} vs ${label(cols, chart.config.x_field)}`;
      break;
    case "kpi":
    case "gauge":
      what = measurePhrase(chart.config, cols, chart.type);
      break;
    case "feed":
      what = `Newest ${label(cols, chart.config.label_field).toLowerCase()} by ${label(cols, chart.config.x_field).toLowerCase()}`;
      break;
    default: {
      const x = label(cols, chart.config.x_field).toLowerCase();
      what = x ? `${measurePhrase(chart.config, cols, chart.type)} ${chart.type === "line" ? "over" : "by"} ${x}` : measurePhrase(chart.config, cols, chart.type);
    }
  }
  return chart.dataset?.name ? `${what} · ${chart.dataset.name}` : what;
}
