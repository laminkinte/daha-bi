"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError, type Alert } from "@/lib/api";
import { PageHeader, PAGE_CONTAINER } from "@/components/PageHeader";
import { useT } from "@/i18n/ui";

function BellIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function AlertsList() {
  const tr = useT();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .getRetrying<Alert[]>("/alerts")
      .then(setAlerts)
      .catch((err) => setError(err instanceof ApiError ? err.message : tr("Failed to load alerts.")));
  }

  useEffect(() => {
    load();
  }, []);

  async function onRemove(id: number) {
    try {
      await api.del(`/alerts/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Failed to remove alert."));
    }
  }

  return (
    <div className={`${PAGE_CONTAINER} max-w-3xl`}>
      <PageHeader
        icon="bell"
        title={tr("Alerts")}
        description={tr("Thresholds and anomaly detection on your KPI charts — checked automatically in the background, and refreshed whenever this page loads.")}
      />

      {error && <p className="mt-6 text-sm text-[var(--status-critical)]">{error}</p>}
      {!error && !alerts && <p className="mt-6 text-sm text-[var(--text-muted)]">{tr("Loading...")}</p>}

      {alerts && alerts.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={<BellIcon />}
            title={tr("No alerts set")}
            description={tr("Open a KPI chart on any dashboard and click the bell icon to set a threshold.")}
          />
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div className="mt-6 grid gap-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm"
            >
              <div>
                <div className="text-[var(--text-primary)]">
                  {tr(a.chart?.title) ?? tr("Chart")}{" "}
                  <span className="text-[var(--text-muted)]">
                    &middot; {a.chart?.dashboard?.name ?? tr("Dashboard")}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {a.condition === "anomaly" ? tr("Anomaly detection (±{sensitivity}σ)", { sensitivity: a.sensitivity }) : `${a.condition} ${a.threshold}`}
                  {a.last_value !== null && <> {tr("· currently")} {a.last_value}</>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.last_status === "breached"
                      ? "bg-[var(--status-critical)]/15 text-[var(--status-critical)]"
                      : "bg-[var(--status-good)]/15 text-[var(--status-good)]"
                  }`}
                >
                  {a.last_status === "breached" ? tr("Breached") : "OK"}
                </span>
                {a.chart?.dashboard_id && (
                  <Link href={`/dashboards/${a.chart.dashboard_id}`} className="text-[var(--accent)]">
                    {tr("View")}
                  </Link>
                )}
                <button
                  onClick={() => onRemove(a.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                >
                  {tr("Remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AlertsPage() {
  return (
    <RequireAuth>
      <AlertsList />
    </RequireAuth>
  );
}
