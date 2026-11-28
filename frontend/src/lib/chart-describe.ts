import type { Chart, ChartType, DatasetColumn } from "@/lib/api";
import { translate } from "@/i18n/ui";

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

// Whole phrases (not "word + field") so other languages can put the field where it belongs.
const AGG_PHRASE: Record<string, string> = {
  sum: "Total {field}",
  avg: "Average {field}",
  min: "Lowest {field}",
  max: "Highest {field}",
  count_distinct: "Distinct {field}",
};

function label(columns: DatasetColumn[] | undefined, name: string | undefined) {
  if (!name) return "";
  return columns?.find((c) => c.name === name)?.label ?? name.replace(/_/g, " ");
}

/** The measure in words: "Total revenue", "Number of records", "Distinct customer". */
export function measurePhrase(config: Chart["config"], columns?: DatasetColumn[], type?: ChartType): string {
  const agg = config.agg ?? "count";
  const field = type === "heatmap" ? config.value_field : config.y_field;
  if (agg === "count" || !field) return translate("Number of records");
  const phrase = AGG_PHRASE[agg];
  const fieldText = label(columns, field).toLowerCase();
  return phrase ? translate(phrase, { field: fieldText }) : `${agg} ${fieldText}`;
}

/** A readable default title for a chart definition, e.g. "Total revenue by country". */
export function suggestTitle(type: ChartType, config: Chart["config"], columns?: DatasetColumn[]): string {
  const x = label(columns, config.x_field).toLowerCase();
  switch (type) {
    case "table":
      return translate("Data table");
    case "scatter":
      return config.x_field && config.y_field
        ? translate("{y} vs {x}", { y: label(columns, config.y_field), x: label(columns, config.x_field).toLowerCase() })
        : translate("Scatter plot");
    case "heatmap":
      return config.x_field && config.y_field
        ? translate("{measure} by {y} and {x}", { measure: measurePhrase(config, columns, type), y: label(columns, config.y_field).toLowerCase(), x })
        : translate("Heatmap");
    case "kpi":
    case "gauge":
      return measurePhrase(config, columns, type);
    case "feed":
      return config.label_field ? translate("Latest {field} activity", { field: label(columns, config.label_field).toLowerCase() }) : translate("Recent activity");
    case "line":
      return x ? translate("{measure} over {x}", { measure: measurePhrase(config, columns, type), x }) : measurePhrase(config, columns, type);
    default: {
      if (!x) return measurePhrase(config, columns, type);
      const measure = measurePhrase(config, columns, type);
      return config.series_field
        ? translate("{measure} by {x} and {y}", { measure, x, y: label(columns, config.series_field).toLowerCase() })
        : translate("{measure} by {x}", { measure, x });
    }
  }
}

/** One-line subtitle for a chart card: what it measures, from which dataset. */
export function describeChart(chart: Chart): string {
  const cols = chart.dataset?.columns;
  let what: string;
  switch (chart.type) {
    case "table":
      what = translate("Raw rows");
      break;
    case "scatter":
      what = translate("{y} vs {x}", { y: label(cols, chart.config.y_field), x: label(cols, chart.config.x_field) });
      break;
    case "kpi":
    case "gauge":
      what = measurePhrase(chart.config, cols, chart.type);
      break;
    case "feed":
      what = translate("Newest {field} by {x}", { field: label(cols, chart.config.label_field).toLowerCase(), x: label(cols, chart.config.x_field).toLowerCase() });
      break;
    default: {
      const x = label(cols, chart.config.x_field).toLowerCase();
      const measure = measurePhrase(chart.config, cols, chart.type);
      what = x ? translate(chart.type === "line" ? "{measure} over {x}" : "{measure} by {x}", { measure, x }) : measure;
    }
  }
  return chart.dataset?.name ? `${what} · ${chart.dataset.name}` : what;
}
