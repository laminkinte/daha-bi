"use client";

import { useEffect, useState, type CSSProperties } from "react";
import ChartCard from "@/components/charts/ChartCard";
import { CardSkeleton, Skeleton } from "@/components/Skeleton";
import { api, ApiError, type Dashboard } from "@/lib/api";
import { BrandLogo, BrandStyle, PoweredBy } from "@/components/BrandStyle";
import { useT } from "@/i18n/ui";

export default function PublicDashboardView({ token }: { token: string }) {
  const tr = useT();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    api
      .get<Dashboard>(`/public/dashboards/${token}`)
      .then(setDashboard)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <BrandStyle color={dashboard?.branding?.color} />
      <header className="border-b border-[var(--border)] bg-[var(--surface-1)]">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-4 sm:px-8">
          <BrandLogo branding={dashboard?.branding ?? { name: "Daha BI", color: null, logo_url: null, hide_powered_by: false }} size={28} />
          <span className="font-semibold text-[var(--text-primary)]">{dashboard?.branding?.name ?? "Daha BI"}</span>
          <span className="ms-2 rounded-full bg-[var(--page-plane)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            {tr("Shared dashboard")}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
        {notFound && (
          <p className="text-sm text-[var(--text-muted)]">
            {tr("This dashboard link is invalid or is no longer shared.")}
          </p>
        )}

        {!notFound && !dashboard && (
          <>
            <Skeleton className="h-7 w-64" />
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          </>
        )}

        {dashboard && (
          <>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{dashboard.name}</h1>
            {dashboard.description && (
              <p className="mt-1 text-sm text-[var(--text-muted)]">{tr(dashboard.description)}</p>
            )}

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-12">
              {dashboard.charts?.map((chart) => (
                <div
                  key={chart.id}
                  className="h-[420px] md:[grid-column:span_var(--chart-span)]"
                  style={{ "--chart-span": Math.min(12, Math.max(3, chart.position?.w ?? 6)) } as CSSProperties}
                >
                  <ChartCard
                    chart={chart}
                    readOnly
                    dataEndpoint={`/public/dashboards/${token}/charts/${chart.id}/data`}
                  />
                </div>
              ))}
            </div>
            {!dashboard.branding?.hide_powered_by && (
              <div className="mt-6 flex justify-end">
                <PoweredBy />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
