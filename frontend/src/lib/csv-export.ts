import type { Chart, ChartData } from "./api";

function escapeCsvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Generic row-of-cells CSV export, for tables that aren't chart data (e.g. admin lists). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

function toCsv(data: ChartData, chart: Chart): string {
  if ("columns" in data) {
    const header = data.columns.join(",");
    const rows = data.rows.map((row) =>
      data.columns.map((col) => escapeCsvCell(row[col])).join(",")
    );
    return [header, ...rows].join("\n");
  }

  if ("value" in data) {
    return `${chart.title}\n${data.value}`;
  }

  if ("points" in data) {
    const header = `${chart.config.x_field ?? "x"},${chart.config.y_field ?? "y"}${chart.config.label_field ? ",label" : ""}`;
    const rows = data.points.map((p) =>
      [p.x, p.y, ...(chart.config.label_field ? [escapeCsvCell(p.label)] : [])].join(",")
    );
    return [header, ...rows].join("\n");
  }

  if ("series" in data) {
    const header = [chart.config.x_field ?? "label", ...data.series.map((s) => s.name)].map(escapeCsvCell).join(",");
    const rows = data.labels.map((label, i) =>
      [escapeCsvCell(label), ...data.series.map((s) => s.values[i])].join(",")
    );
    return [header, ...rows].join("\n");
  }

  if ("items" in data) {
    const header = ["when", "what", "status", "amount"].join(",");
    const rows = data.items.map((it) => [escapeCsvCell(it.at), escapeCsvCell(it.title), escapeCsvCell(it.tag ?? ""), it.value ?? ""].join(","));
    return [header, ...rows].join("\n");
  }

  if ("cells" in data) {
    const header = `${chart.config.x_field ?? "x"},${chart.config.y_field ?? "y"},value`;
    const rows = data.cells.map((c) => `${escapeCsvCell(c.x)},${escapeCsvCell(c.y)},${c.value}`);
    return [header, ...rows].join("\n");
  }

  const header = `${chart.config.x_field ?? "label"},${chart.config.y_field ?? "value"}`;
  const rows = data.labels.map(
    (label, i) => `${escapeCsvCell(label)},${data.values[i]}`
  );
  return [header, ...rows].join("\n");
}

export function downloadChartCsv(chart: Chart, data: ChartData) {
  const csv = toCsv(data, chart);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${chart.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`);
}
