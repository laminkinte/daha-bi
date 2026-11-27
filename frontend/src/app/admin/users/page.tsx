"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { PlanBadge } from "@/components/admin/shared";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { ADMIN_CARD, AdminPage, timeAgo } from "@/components/AdminShell";
import { Modal, BTN_SECONDARY } from "@/components/Modal";
import { api, ApiError, type AdminUser, type AdminUserDetail } from "@/lib/api";

const FILTERS = [
  { key: "", label: "All" },
  { key: "admins", label: "Admins" },
  { key: "suspended", label: "Suspended" },
  { key: "inactive", label: "Inactive 30d+" },
];

function UserDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { user: me } = useAuth();
  const [d, setD] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    api
      .get<AdminUserDetail>(`/admin/users/${id}`)
      .then(setD)
      .catch((err) => setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Couldn't load this user." }));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      load();
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  }

  const u = d?.user;
  const self = u?.id === me?.id;
  const btn = "rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)] disabled:opacity-50";

  return (
    <Modal open onClose={onClose} size="lg" title={u?.name ?? "User"} description={u?.email} footer={<button onClick={onClose} className={BTN_SECONDARY}>Close</button>}>
      <div className="px-5 py-4">
        {!d && <div className="h-40 animate-pulse rounded-lg bg-[var(--surface-2)]" />}
        {d && u && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2 text-xs">
              {u.is_admin && <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-semibold text-[var(--accent)]">Super admin</span>}
              {u.suspended_at ? (
                <span className="rounded-full bg-[var(--status-critical)]/12 px-2 py-0.5 font-semibold text-[var(--status-critical)]">
                  Suspended {timeAgo(u.suspended_at)}
                  {u.suspended_reason ? ` — ${u.suspended_reason}` : ""}
                </span>
              ) : (
                <span className="rounded-full bg-[var(--status-good)]/12 px-2 py-0.5 font-semibold text-[var(--status-good)]">Active</span>
              )}
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[var(--text-secondary)]">Joined {new Date(u.created_at).toLocaleDateString()}</span>
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[var(--text-secondary)]">Last active {timeAgo(u.last_active_at)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(d.counts).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
                  <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{v}</div>
                  <div className="text-[11px] capitalize text-[var(--text-muted)]">{k.replace(/_/g, " ")}</div>
                </div>
              ))}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Workspaces</h3>
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {d.workspaces.map((w) => (
                  <li key={w.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{w.name}</span>
                    <span className="text-xs capitalize text-[var(--text-muted)]">{w.role}</span>
                    <PlanBadge plan={w.plan} status={w.plan_status} />
                  </li>
                ))}
              </ul>
            </div>

            {!self && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Actions</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button disabled={busy} className={btn} onClick={() => act(() => api.post(`/admin/users/${u.id}/password-reset`), `Password reset link sent to ${u.email}.`)}>
                    Send password reset email
                  </button>
                  <button disabled={busy || d.counts.active_sessions === 0} className={btn} onClick={() => act(() => api.post(`/admin/users/${u.id}/sign-out`), "Signed out of every device.")}>
                    Sign out everywhere ({d.counts.active_sessions})
                  </button>
                  <button
                    disabled={busy}
                    className={btn}
                    onClick={() => {
                      if (confirm(u.is_admin ? `Remove super admin rights from ${u.email}?` : `Give ${u.email} full super admin access to the whole platform?`))
                        void act(() => api.put(`/admin/users/${u.id}/admin`, { is_admin: !u.is_admin }), u.is_admin ? "Admin rights removed." : "Now a super admin.");
                    }}
                  >
                    {u.is_admin ? "Remove super admin" : "Make super admin"}
                  </button>
                  {u.suspended_at ? (
                    <button disabled={busy} className={`${btn} text-[var(--status-good)]`} onClick={() => act(() => api.post(`/admin/users/${u.id}/unsuspend`), "Account reactivated.")}>
                      Reactivate account
                    </button>
                  ) : (
                    <button
                      disabled={busy || u.is_admin}
                      title={u.is_admin ? "Remove super admin first" : undefined}
                      className={`${btn} text-[var(--status-warning)]`}
                      onClick={() => {
                        const reason = window.prompt(`Suspend ${u.email}? They're signed out and can't log in until reactivated.\n\nReason (optional, shown to admins only):`);
                        if (reason !== null) void act(() => api.post(`/admin/users/${u.id}/suspend`, { reason: reason || null }), "Account suspended.");
                      }}
                    >
                      Suspend account
                    </button>
                  )}
                  <button
                    disabled={busy}
                    className={`${btn} text-[var(--status-critical)] sm:col-span-2`}
                    onClick={() => {
                      if (confirm(`Permanently delete ${u.email}? Their dashboards and data sources are deleted too. This can't be undone.`))
                        void act(async () => {
                          await api.del(`/admin/users/${u.id}`);
                          onClose();
                        }, "User deleted.");
                    }}
                  >
                    Delete account permanently
                  </button>
                </div>
              </div>
            )}
            {msg && <p className={`text-sm ${msg.ok ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"}`}>{msg.text}</p>}

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recent activity</h3>
              {d.recent_activity.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Nothing recorded yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {d.recent_activity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="w-24 shrink-0 text-xs text-[var(--text-muted)]">{timeAgo(a.created_at)}</span>
                      <span className="text-[var(--text-secondary)]">{a.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function UsersView() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (search) q.set("search", search);
    if (status) q.set("status", status);
    api
      .get<AdminUser[]>(`/admin/users${q.toString() ? `?${q}` : ""}`)
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load users."));
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("open"));
    if (id) Promise.resolve().then(() => setOpenId(id));
  }, []);

  const columns: Column<AdminUser>[] = [
    {
      key: "name",
      label: "User",
      value: (u) => u.name,
      render: (u) => (
        <button onClick={() => setOpenId(u.id)} className="text-left">
          <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">
            {u.name}
            {u.is_admin && <span className="rounded bg-[var(--accent-soft)] px-1.5 text-[10px] font-semibold text-[var(--accent)]">ADMIN</span>}
            {u.suspended_at && <span className="rounded bg-[var(--status-critical)]/12 px-1.5 text-[10px] font-semibold text-[var(--status-critical)]">SUSPENDED</span>}
          </span>
          <span className="block text-xs text-[var(--text-muted)]">{u.email}</span>
        </button>
      ),
    },
    {
      key: "organization",
      label: "Workspace",
      value: (u) => u.current_organization?.name ?? null,
      render: (u) =>
        u.current_organization ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--text-secondary)]">{u.current_organization.name}</span>
            <PlanBadge plan={u.current_organization.plan} status={u.current_organization.plan_status} />
          </span>
        ) : (
          "—"
        ),
    },
    { key: "active", label: "Last active", value: (u) => u.last_active_at ?? null, render: (u) => timeAgo(u.last_active_at) },
    { key: "joined", label: "Joined", value: (u) => u.created_at, render: (u) => new Date(u.created_at).toLocaleDateString() },
    { key: "dashboards", label: "Dashboards", value: (u) => u.dashboards_count, align: "right" },
    { key: "sources", label: "Sources", value: (u) => u.data_sources_count, align: "right" },
    {
      key: "open",
      label: "",
      value: () => null,
      sortable: false,
      excludeFromCsv: true,
      render: (u) => (
        <button onClick={() => setOpenId(u.id)} className="text-xs font-medium text-[var(--accent)] hover:underline">
          Manage
        </button>
      ),
    },
  ];

  return (
    <AdminPage title="Users" description="Every account on the platform. Open one to manage it.">
      <div className={`${ADMIN_CARD} p-4`}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full max-w-xs rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-xs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatus(f.key)}
                className={`rounded-md px-3 py-1.5 font-medium ${status === f.key ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="mb-3 text-sm text-[var(--status-critical)]">{error}</p>}
        <DataTable columns={columns} rows={users} getRowKey={(u) => u.id} filename="daha-bi-users" emptyMessage="No users match." search={false} />
      </div>
      {openId !== null && <UserDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </AdminPage>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireAuth>
      <UsersView />
    </RequireAuth>
  );
}
