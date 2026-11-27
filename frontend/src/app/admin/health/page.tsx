"use client";

import { useCallback, useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ADMIN_CARD, AdminPage, StatusDot } from "@/components/AdminShell";
import { api, ApiError, type HealthCheck } from "@/lib/api";

type Health = {
  checks: HealthCheck[];
  environment: { app_env: string; debug: boolean; url: string; php: string; laravel: string; timezone: string; database: string };
};

const HINTS: Record<string, string> = {
  mail: "Set MAIL_MAILER=smtp and the MAIL_* settings in the server's .env, then run php artisan config:cache.",
  ai: "Add GEMINI_API_KEY to the server's .env (free key from Google AI Studio).",
  payments: "Add live STRIPE_* or PAYSTACK_* keys to take real payments.",
  queue: "Failed jobs are listed with: php artisan queue:failed. Retry with: php artisan queue:retry all.",
  scheduler: "The cron entry /etc/cron.d/daha-bi must run php artisan schedule:run every minute.",
  disk: "Free up space or grow the server disk.",
  python: "Python notebooks need pandas installed and review before enabling (PYTHON_NOTEBOOK_ACCESS).",
};

function HealthView() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = useCallback(() => {
    api
      .get<Health>("/admin/health")
      .then((h) => {
        setData(h);
        setCheckedAt(new Date());
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't run the health checks."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fails = data?.checks.filter((c) => c.status === "fail").length ?? 0;
  const warns = data?.checks.filter((c) => c.status === "warn").length ?? 0;

  return (
    <AdminPage
      title="System health"
      description="Is everything Daha BI depends on working?"
      actions={
        <button onClick={load} className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Re-check
        </button>
      }
    >
      {error && <p className="mb-4 text-sm text-[var(--status-critical)]">{error}</p>}
      {data && (
        <div
          className={`mb-4 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${
            fails ? "bg-[var(--status-critical)]/10 text-[var(--status-critical)]" : warns ? "bg-[var(--status-warning)]/12 text-[var(--text-primary)]" : "bg-[var(--status-good)]/12 text-[var(--status-good)]"
          }`}
        >
          <StatusDot status={fails ? "fail" : warns ? "warn" : "ok"} />
          {fails ? `${fails} problem${fails > 1 ? "s" : ""} need fixing` : warns ? `All core systems up · ${warns} item${warns > 1 ? "s" : ""} to review` : "All systems operational"}
          {checkedAt && <span className="ml-auto text-xs font-normal text-[var(--text-muted)]">Checked {checkedAt.toLocaleTimeString()}</span>}
        </div>
      )}

      <div className={`${ADMIN_CARD} divide-y divide-[var(--border)]`}>
        {!data && !error && <div className="m-4 h-40 animate-pulse rounded-lg bg-[var(--surface-2)]" />}
        {data?.checks.map((c) => (
          <div key={c.key} className="flex items-start gap-3 px-5 py-3.5">
            <span className="mt-1.5">
              <StatusDot status={c.status} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--text-primary)]">{c.label}</div>
              <div className="text-sm text-[var(--text-secondary)]">{c.detail}</div>
              {c.status !== "ok" && HINTS[c.key] && <div className="mt-1 text-xs text-[var(--text-muted)]">How to fix: {HINTS[c.key]}</div>}
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                c.status === "ok" ? "bg-[var(--status-good)]/12 text-[var(--status-good)]" : c.status === "warn" ? "bg-[var(--status-warning)]/15 text-[var(--text-secondary)]" : "bg-[var(--status-critical)]/12 text-[var(--status-critical)]"
              }`}
            >
              {c.status === "ok" ? "OK" : c.status === "warn" ? "Review" : "Failing"}
            </span>
          </div>
        ))}
      </div>

      {data && (
        <div className={`${ADMIN_CARD} mt-4 p-5`}>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Environment</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {[
              ["Mode", data.environment.app_env],
              ["Debug", data.environment.debug ? "ON — turn off!" : "Off"],
              ["URL", data.environment.url],
              ["Database", data.environment.database],
              ["PHP", data.environment.php],
              ["Laravel", data.environment.laravel],
              ["Timezone", data.environment.timezone],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-[var(--text-muted)]">{k}</dt>
                <dd className={`truncate font-medium ${k === "Debug" && data.environment.debug ? "text-[var(--status-critical)]" : "text-[var(--text-primary)]"}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </AdminPage>
  );
}

export default function AdminHealthPage() {
  return (
    <RequireAuth>
      <HealthView />
    </RequireAuth>
  );
}
