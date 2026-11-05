"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

type DatasetPreview = { columns: { name: string; label: string }[]; rows: Record<string, unknown>[] };

export default function DatasetPreviewToggle({ datasetId }: { datasetId: number | "" }) {
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (!datasetId) return;
    setPreview(null);
    setPreviewError(null);
    api
      .getRetrying<DatasetPreview>(`/datasets/${datasetId}/preview`)
      .then(setPreview)
      .catch((err) => setPreviewError(err instanceof ApiError ? err.message : "Failed to load preview."));
  }, [datasetId]);

  if (!datasetId) return null;

  return (
    <div className="mt-3">
      <button onClick={() => setShow((s) => !s)} className="text-xs font-medium text-[var(--series-1)]">
        {show ? "Hide" : "Show"} dataset preview
      </button>
      {show && (
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-[var(--border)]">
          {previewError && <p className="p-3 text-sm text-[var(--status-critical)]">{previewError}</p>}
          {!preview && !previewError && (
            <p className="p-3 text-sm text-[var(--text-muted)]">Loading preview...</p>
          )}
          {preview && (
            <table className="w-full text-left text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[var(--baseline)] bg-[var(--page-plane)]">
                  {preview.columns.map((col) => (
                    <th
                      key={col.name}
                      className="whitespace-nowrap px-3 py-2 font-medium text-[var(--text-secondary)]"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-b border-[var(--gridline)]">
                    {preview.columns.map((col) => (
                      <td key={col.name} className="whitespace-nowrap px-3 py-2 text-[var(--text-primary)]">
                        {String(row[col.name] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview && preview.rows.length === 0 && (
            <p className="p-3 text-center text-sm text-[var(--text-muted)]">No rows to preview.</p>
          )}
        </div>
      )}
    </div>
  );
}
