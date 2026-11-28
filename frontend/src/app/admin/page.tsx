"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import RequireAuth from "@/components/RequireAuth";
import { ADMIN_CARD, AdminPage, StatusDot, timeAgo } from "@/components/AdminShell";
import { api, ApiError, type AdminOverview } from "@/lib/api";
import { useT, uiLocaleTag } from "@/i18n/ui";

const nf = new Intl.NumberFormat(uiLocaleTag());

function Kpi({ label, value, sub, href }: { label: string; value: number | string; sub?: string; href?: string }) {
  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-[var(--text-primary)]">
        {typeof value === "number" ? nf.format(value) : value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-[var(--text-secondary)]">{sub}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={`${ADMIN_CARD} block p-4 transition-colors hover:border-[var(--accent)]/40`}>
      {body}
    </Link>
  ) : (
    <div className={`${ADMIN_CARD} p-4`}>{body}</div>
  );
}

function Overview() {
  const tr = useT();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AdminOverview>("/admin/overview")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : tr("Couldn't load the overview.")));
  }, [tr]);

  const k = data?.kpis;
  const signups30 = data?.signups_30d.reduce((s, d) => s + d.signups, 0) ?? 0;
  const totalWs = data?.plan_mix.reduce((s, p) => s + p.workspaces, 0) || 1;
  const issues = data?.health.filter((h) => h.status !== "ok") ?? [];

  return (
    <AdminPage title={tr("Overview")} description={tr("How the Daha BI platform is doing right now.")}>
      {error && <p className="mb-4 rounded-lg bg-[var(--status-critical)]/10 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</p>}

      {data && issues.length > 0 && (
        <Link
          href="/admin/health"
          className="mb-5 flex items-center gap-2 rounded-xl border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/10 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:border-[var(--status-warning)]/60"
        >
          <StatusDot status={issues.some((i) => i.status === "fail") ? "fail" : "warn"} />
          {issues.length} {tr("item")}{issues.length === 1 ? tr(" needs") : tr("s need")} attention: {issues.map((i) => i.label).join(", ")}
          <span className="ms-auto font-medium text-[var(--accent)]">{tr("View →")}</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={tr("Users")} value={k?.users ?? "—"} sub={k ? `+${k.users_new_7d} this week · ${k.users_active_7d} active` : undefined} href="/admin/users" />
        <Kpi label={tr("Workspaces")} value={k?.workspaces ?? "—"} sub={k ? `${k.paying_workspaces} paying` : undefined} href="/admin/workspaces" />
        <Kpi label={tr("Dashboards")} value={k?.dashboards ?? "—"} sub={k ? `${nf.format(k.company_shares)} company shares · ${nf.format(k.embeds)} embeds` : undefined} />
        <Kpi label={tr("Data")} value={k ? `${nf.format(k.rows_stored)} rows` : "—"} sub={k ? `${k.data_sources} data sources` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className={`${ADMIN_CARD} p-5 lg:col-span-2`}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tr("Sign-ups, last 30 days")}</h2>
            <span className="text-xs text-[var(--text-muted)]">{signups30} {tr("total")}</span>
          </div>
          <div className="mt-3 h-[220px]">
            {data && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.signups_30d} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="su" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--gridline)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => new Date(d).toLocaleDateString(uiLocaleTag(), { day: "numeric", month: "short" })}
                    tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(d) => new Date(String(d)).toLocaleDateString(uiLocaleTag(), { weekday: "short", day: "numeric", month: "short" })}
                    formatter={(v) => [v, tr("Sign-ups")]}
                  />
                  <Area type="monotone" dataKey="signups" stroke="var(--series-1)" strokeWidth={2} fill="url(#su)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className={`${ADMIN_CARD} p-5`}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tr("Workspaces by plan")}</h2>
          <ul className="mt-4 flex flex-col gap-3.5">
            {(data?.plan_mix ?? []).map((p) => (
              <li key={p.plan}>
                <div className="flex justify-between text-sm">
                  <span className="capitalize text-[var(--text-secondary)]">{p.plan}</span>
                  <span className="font-medium tabular-nums text-[var(--text-primary)]">{p.workspaces}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(100 * p.workspaces) / totalWs}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-secondary)]">
            <span>{tr("AI chats")}</span>
            <span className="text-end font-medium tabular-nums text-[var(--text-primary)]">{k ? nf.format(k.ai_conversations) : "—"}</span>
            <span>{tr("Comments")}</span>
            <span className="text-end font-medium tabular-nums text-[var(--text-primary)]">{k ? nf.format(k.comments) : "—"}</span>
            <span>{tr("Suspended users")}</span>
            <span className="text-end font-medium tabular-nums text-[var(--text-primary)]">{k?.suspended ?? "—"}</span>
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className={`${ADMIN_CARD} lg:col-span-2`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tr("Newest users")}</h2>
            <Link href="/admin/users" className="text-xs font-medium text-[var(--accent)] hover:underline">
              {tr("All users →")}
            </Link>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {data?.recent_users.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users?open=${u.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[var(--surface-2)]">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                      <span className="truncate">{u.name}</span>
                      {u.is_admin && <span className="rounded bg-[var(--accent-soft)] px-1.5 text-[10px] font-semibold text-[var(--accent)]">{tr("ADMIN")}</span>}
                      {u.suspended_at && <span className="rounded bg-[var(--status-critical)]/12 px-1.5 text-[10px] font-semibold text-[var(--status-critical)]">{tr("SUSPENDED")}</span>}
                    </span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">{u.email}</span>
                  </span>
                  <span className="shrink-0 text-end text-xs text-[var(--text-muted)]">
                    {tr("Joined")} {timeAgo(u.created_at)}
                    <span className="block">{tr("Active")} {timeAgo(u.last_active_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
            {data?.recent_users.length === 0 && <li className="px-5 py-6 text-sm text-[var(--text-muted)]">{tr("No users yet.")}</li>}
          </ul>
        </section>

        <section className={ADMIN_CARD}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{tr("System health")}</h2>
            <Link href="/admin/health" className="text-xs font-medium text-[var(--accent)] hover:underline">
              {tr("Details →")}
            </Link>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {data?.health.map((h) => (
              <li key={h.key} className="flex items-center gap-2.5 px-5 py-2.5 text-sm">
                <StatusDot status={h.status} />
                <span className="text-[var(--text-primary)]">{tr(h.label)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {!data && !error && <div className="mt-4 h-24 animate-pulse rounded-xl bg-[var(--surface-2)]" />}
    </AdminPage>
  );
}

export default function AdminOverviewPage() {
  return (
    <RequireAuth>
      <Overview />
    </RequireAuth>
  );
}
