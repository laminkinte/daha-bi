"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { ADMIN_CARD, AdminPage } from "@/components/AdminShell";
import { api, ApiError, type AdminAction } from "@/lib/api";

const COLUMNS: Column<AdminAction>[] = [
  {
    key: "when",
    label: "When",
    value: (a) => a.created_at,
    render: (a) => (
      <span className="whitespace-nowrap text-[var(--text-secondary)]">
        {new Date(a.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </span>
    ),
  },
  { key: "admin", label: "Admin", value: (a) => a.admin?.name ?? "Deleted admin" },
  {
    key: "what",
    label: "What happened",
    value: (a) => a.description,
    render: (a) => (
      <>
        <span className="text-[var(--text-primary)]">{a.description}</span>
        {typeof a.metadata?.note === "string" && a.metadata.note && <span className="block text-xs text-[var(--text-muted)]">Note: {a.metadata.note}</span>}
        {typeof a.metadata?.reason === "string" && a.metadata.reason && <span className="block text-xs text-[var(--text-muted)]">Reason: {a.metadata.reason}</span>}
      </>
    ),
  },
  {
    key: "type",
    label: "Type",
    value: (a) => a.action,
    render: (a) => <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">{a.action}</code>,
  },
  { key: "ip", label: "IP", value: (a) => a.ip_address ?? "—" },
];

function ActivityView() {
  const [rows, setRows] = useState<AdminAction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminAction[]>("/admin/actions")
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load the admin log."));
  }, []);

  return (
    <AdminPage title="Admin log" description="Every action taken in this console — who, what, when and from where.">
      <div className={`${ADMIN_CARD} p-4`}>
        {error && <p className="mb-3 text-sm text-[var(--status-critical)]">{error}</p>}
        <DataTable columns={COLUMNS} rows={rows} getRowKey={(a) => a.id} filename="daha-bi-admin-log" emptyMessage="No admin actions recorded yet." />
      </div>
    </AdminPage>
  );
}

export default function AdminActivityPage() {
  return (
    <RequireAuth>
      <ActivityView />
    </RequireAuth>
  );
}
