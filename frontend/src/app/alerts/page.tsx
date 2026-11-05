"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError, type Alert } from "@/lib/api";

function BellIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function AlertsList() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .getRetrying<Alert[]>("/alerts")
      .then(setAlerts)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load alerts."));
  }

  useEffect(() => {
    load();
  }, []);

  async function onRemove(id: number) {
    try {
      await api.del(`/alerts/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove alert.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold">Alerts</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Thresholds and anomaly detection on your KPI charts — checked automatically in the background, and refreshed whenever this page loads.
      </p>

      {error && <p className="mt-6 text-sm text-[var(--status-critical)]">{error}</p>}
      {!error && !alerts && <p className="mt-6 text-sm text-[var(--text-muted)]">Loading...</p>}

      {alerts && alerts.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={<BellIcon />}
            title="No alerts set"
            description="Open a KPI chart on any dashboard and click the bell icon to set a threshold."
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
                  {a.chart?.title ?? "Chart"}{" "}
                  <span className="text-[var(--text-muted)]">
                    &middot; {a.chart?.dashboard?.name ?? "Dashboard"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {a.condition === "anomaly" ? `Anomaly detection (±${a.sensitivity}σ)` : `${a.condition} ${a.threshold}`}
                  {a.last_value !== null && <> &middot; currently {a.last_value}</>}
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
                  {a.last_status === "breached" ? "Breached" : "OK"}
                </span>
                {a.chart?.dashboard_id && (
                  <Link href={`/dashboards/${a.chart.dashboard_id}`} className="text-[var(--series-1)]">
                    View
                  </Link>
                )}
                <button
                  onClick={() => onRemove(a.id)}
                  className="text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                >
                  Remove
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
