"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import RequireAuth from "@/components/RequireAuth";
import { PlanBadge } from "@/components/admin/shared";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { ADMIN_CARD, AdminPage, timeAgo } from "@/components/AdminShell";
import { Modal, BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL } from "@/components/Modal";
import { api, ApiError, type AdminWorkspace } from "@/lib/api";

function PlanDialog({ ws, onClose, onSaved }: { ws: AdminWorkspace; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState(ws.plan);
  const [status, setStatus] = useState(ws.plan_status || "active");
  const [trialDays, setTrialDays] = useState("30");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/admin/organizations/${ws.id}/plan`, {
        plan,
        plan_status: status,
        trial_days: status === "trialing" ? Number(trialDays) : null,
        note: note || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change the plan.");
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Change plan — ${ws.name}`}
      description="For pilots, partners and fixing billing mistakes. Recorded in the admin log."
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_SECONDARY}>
            Cancel
          </button>
          <button type="submit" form="plan-form" disabled={busy} className={BTN_PRIMARY}>
            {busy ? "Saving…" : "Save plan"}
          </button>
        </>
      }
    >
      <form id="plan-form" onSubmit={save} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <div>
          <label className={FIELD_LABEL}>Plan</label>
          <select value={plan} onChange={(e) => setPlan(e.target.value as AdminWorkspace["plan"])} className={FIELD_INPUT}>
            <option value="free">Free</option>
            <option value="growth">Growth</option>
            <option value="business">Business</option>
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={FIELD_INPUT}>
            <option value="active">Active</option>
            <option value="trialing">Trial</option>
            <option value="past_due">Past due</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>
        {status === "trialing" && (
          <div>
            <label className={FIELD_LABEL}>Trial length</label>
            <select value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className={FIELD_INPUT}>
              {["14", "30", "60", "90"].map((d) => (
                <option key={d} value={d}>
                  {d} days from today
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={FIELD_LABEL}>Note (why)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pilot partner, 3 months free" className={FIELD_INPUT} />
        </div>
        {error && <p className="text-sm text-[var(--status-critical)] sm:col-span-2">{error}</p>}
      </form>
    </Modal>
  );
}

function WorkspacesView() {
  const [rows, setRows] = useState<AdminWorkspace[] | null>(null);
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("");
  const [editing, setEditing] = useState<AdminWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (plan) q.set("plan", plan);
    api
      .get<AdminWorkspace[]>(`/admin/organizations${q.toString() ? `?${q}` : ""}`)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load workspaces."));
  }, [search, plan]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const columns: Column<AdminWorkspace>[] = [
    {
      key: "name",
      label: "Workspace",
      value: (w) => w.name,
      render: (w) => (
        <>
          <span className="font-medium text-[var(--text-primary)]">{w.name}</span>
          {w.brand_name && <span className="ml-1.5 text-xs text-[var(--text-muted)]">({w.brand_name})</span>}
          <span className="block text-xs text-[var(--text-muted)]">{w.owner ? `${w.owner.name} · ${w.owner.email}` : "No owner"}</span>
        </>
      ),
    },
    { key: "plan", label: "Plan", value: (w) => w.plan, render: (w) => <PlanBadge plan={w.plan} status={w.plan_status} /> },
    {
      key: "until",
      label: "Renews / trial ends",
      value: (w) => w.current_period_end ?? w.trial_ends_at ?? null,
      render: (w) => {
        const d = w.plan_status === "trialing" ? w.trial_ends_at : w.current_period_end;
        return d ? new Date(d).toLocaleDateString() : "—";
      },
    },
    { key: "members", label: "Members", value: (w) => w.members_count, align: "right" },
    { key: "dashboards", label: "Dashboards", value: (w) => w.dashboards_count, align: "right" },
    { key: "sources", label: "Sources", value: (w) => w.data_sources_count, align: "right" },
    { key: "created", label: "Created", value: (w) => w.created_at, render: (w) => timeAgo(w.created_at) },
    {
      key: "act",
      label: "",
      value: () => null,
      sortable: false,
      excludeFromCsv: true,
      render: (w) => (
        <button onClick={() => setEditing(w)} className="text-xs font-medium text-[var(--accent)] hover:underline">
          Change plan
        </button>
      ),
    },
  ];

  return (
    <AdminPage title="Workspaces" description="Every company on the platform, its plan and how much it uses.">
      <div className={`${ADMIN_CARD} p-4`}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspaces…"
            className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm">
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="growth">Growth</option>
            <option value="business">Business</option>
          </select>
        </div>
        {error && <p className="mb-3 text-sm text-[var(--status-critical)]">{error}</p>}
        <DataTable columns={columns} rows={rows} getRowKey={(w) => w.id} filename="daha-bi-workspaces" emptyMessage="No workspaces match." search={false} />
      </div>
      {editing && <PlanDialog ws={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </AdminPage>
  );
}

export default function AdminWorkspacesPage() {
  return (
    <RequireAuth>
      <WorkspacesView />
    </RequireAuth>
  );
}
