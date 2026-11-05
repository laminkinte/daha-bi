"use client";

import { useMemo, useState, type ReactNode } from "react";
import { RowSkeleton } from "@/components/Skeleton";
import { downloadCsv } from "@/lib/csv-export";

export type Column<T> = {
  key: string;
  label: string;
  /** Canonical value used for default rendering, sorting, and CSV export. */
  value: (row: T) => string | number | null;
  /** Overrides how the cell displays, without changing what it sorts/exports by. */
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
  /** For action columns (buttons) that have no meaningful exported value. */
  excludeFromCsv?: boolean;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[] | null;
  getRowKey: (row: T) => string | number;
  filename: string;
  emptyMessage?: string;
  /** Renders a built-in search box that filters rows client-side across all column values. */
  search?: boolean;
  pageSize?: number;
};

export default function DataTable<T>({
  columns,
  rows,
  getRowKey,
  filename,
  emptyMessage = "No results.",
  search = true,
  pageSize = 10,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!search || !query.trim()) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => String(col.value(row) ?? "").toLowerCase().includes(q))
    );
  }, [rows, search, query, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function toggleSort(col: Column<T>) {
    if (col.sortable === false) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function handleSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  function exportCsv() {
    const exportable = columns.filter((c) => !c.excludeFromCsv);
    downloadCsv(
      filename,
      exportable.map((c) => c.label),
      sorted.map((row) => exportable.map((c) => c.value(row)))
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        {search ? (
          <input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search..."
            className="w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
          />
        ) : (
          <span />
        )}
        <button
          onClick={exportCsv}
          disabled={!rows || sorted.length === 0}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page-plane)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Download CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
              {columns.map((col) => (
                <th key={col.key} className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right" : ""}`}>
                  {col.sortable === false ? (
                    col.label
                  ) : (
                    <button
                      onClick={() => toggleSort(col)}
                      className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
                    >
                      {col.label}
                      <span className={sortKey === col.key ? "opacity-100" : "opacity-0"}>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={columns.length} className="p-3">
                  <RowSkeleton />
                </td>
              </tr>
            )}
            {rows !== null && sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-6 text-center text-[var(--text-muted)]">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {pageRows.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-[var(--gridline)] last:border-0">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-[var(--text-secondary)] ${col.align === "right" ? "text-right" : ""}`}
                  >
                    {col.render ? col.render(row) : (col.value(row) ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows !== null && sorted.length > pageSize && (
        <div className="mt-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-[var(--page-plane)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-[var(--page-plane)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
