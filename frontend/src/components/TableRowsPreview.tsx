"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useT } from "@/i18n/ui";

type TablePreview = { columns: string[]; rows: Record<string, unknown>[] };

export default function TableRowsPreview({
  dataSourceId,
  table,
}: {
  dataSourceId: number;
  table: string;
}) {
  const tr = useT();
  const [preview, setPreview] = useState<TablePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    api
      .getRetrying<TablePreview>(`/data-sources/${dataSourceId}/tables/${encodeURIComponent(table)}/preview`)
      .then(setPreview)
      .catch((err) => setError(err instanceof ApiError ? err.message : tr("Failed to load preview.")));
  }, [dataSourceId, table, tr]);

  return (
    <div className="mt-1 max-h-56 overflow-auto rounded-md border border-[var(--border)]">
      {error && <p className="p-3 text-sm text-[var(--status-critical)]">{error}</p>}
      {!preview && !error && <p className="p-3 text-sm text-[var(--text-muted)]">{tr("Loading preview...")}</p>}
      {preview && preview.rows.length === 0 && (
        <p className="p-3 text-center text-sm text-[var(--text-muted)]">{tr("No rows in this table.")}</p>
      )}
      {preview && preview.rows.length > 0 && (
        <table className="w-full text-start text-sm tabular-nums">
          <thead>
            <tr className="border-b border-[var(--baseline)] bg-[var(--page-plane)]">
              {preview.columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 font-medium text-[var(--text-secondary)]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i} className="border-b border-[var(--gridline)]">
                {preview.columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-3 py-2 text-[var(--text-primary)]">
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
