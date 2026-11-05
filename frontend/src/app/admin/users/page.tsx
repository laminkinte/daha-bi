"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { PlanBadge } from "@/components/admin/shared";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { api, ApiError, type AdminUser } from "@/lib/api";

function UsersView() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<AdminUser[]>(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`)
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load users."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function toggleAdmin(u: AdminUser) {
    setError(null);
    try {
      await api.put(`/admin/users/${u.id}/admin`, { is_admin: !u.is_admin });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update admin status.");
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!confirm(`Delete ${u.name} (${u.email})? This removes their dashboards and data sources too.`)) return;
    setError(null);
    try {
      await api.del(`/admin/users/${u.id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete user.");
    }
  }

  const columns: Column<AdminUser>[] = [
    {
      key: "name",
      label: "Name",
      value: (u) => u.name,
      render: (u) => (
        <div className="flex items-center gap-1.5">
          {u.name}
          {u.is_admin && (
            <span className="rounded-full bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
              admin
            </span>
          )}
        </div>
      ),
    },
    { key: "email", label: "Email", value: (u) => u.email },
    {
      key: "organization",
      label: "Organization",
      value: (u) => u.current_organization?.name ?? null,
      render: (u) =>
        u.current_organization ? (
          <>
            {u.current_organization.name}{" "}
            <PlanBadge plan={u.current_organization.plan} status={u.current_organization.plan_status} />
          </>
        ) : (
          "—"
        ),
    },
    {
      key: "joined",
      label: "Joined",
      value: (u) => u.created_at,
      render: (u) => new Date(u.created_at).toLocaleDateString(),
    },
    { key: "dashboards", label: "Dashboards", value: (u) => u.dashboards_count, align: "right" },
    { key: "sources", label: "Sources", value: (u) => u.data_sources_count, align: "right" },
    { key: "referred", label: "Referred", value: (u) => u.referrals_count, align: "right" },
    {
      key: "actions",
      label: "",
      value: () => null,
      sortable: false,
      excludeFromCsv: true,
      render: (u) =>
        u.id !== me?.id && (
          <div className="flex items-center justify-end gap-3 text-xs">
            <button onClick={() => toggleAdmin(u)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              {u.is_admin ? "Revoke admin" : "Make admin"}
            </button>
            <button onClick={() => deleteUser(u)} className="text-[var(--status-critical)] hover:opacity-80">
              Delete
            </button>
          </div>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Users</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Every account registered on daha-bi.</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search users by name or email..."
        className="mt-6 w-full max-w-xs rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
      />

      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={users}
          getRowKey={(u) => u.id}
          filename="daha-bi-users"
          emptyMessage={`No users match "${search}".`}
          search={false}
        />
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireAuth>
      <UsersView />
    </RequireAuth>
  );
}
