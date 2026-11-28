"use client";

import { use, useEffect, useState, type CSSProperties } from "react";
import ChartCard from "@/components/charts/ChartCard";
import ChartErrorBoundary from "@/components/charts/ChartErrorBoundary";
import { CardSkeleton, Skeleton } from "@/components/Skeleton";
import { BrandLogo, BrandStyle, PoweredBy } from "@/components/BrandStyle";
import { api, ApiError, type Branding, type Chart } from "@/lib/api";
import { useT } from "@/i18n/ui";

type EmbedPayload = { name: string; description: string | null; charts: Chart[]; branding: Branding };

/**
 * A dashboard as shown inside another website's <iframe>. Chrome-free, branded with the
 * embedding company's look. ?theme=dark|light picks the theme (light by default, since host
 * pages are usually light); ?header=0 hides the title bar for a tighter fit.
 */
export default function EmbedPage({ params }: { params: Promise<{ token: string }> }) {
  const tr = useT();
  const { token } = use(params);
  const [data, setData] = useState<EmbedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHeader, setShowHeader] = useState(true);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const theme = q.get("theme") === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    if (q.get("header") === "0") Promise.resolve().then(() => setShowHeader(false));

    api
      .get<EmbedPayload>(`/public/embeds/${token}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError && err.status === 404 ? tr("This embedded dashboard is no longer available.") : tr("Couldn't load this dashboard.")));
  }, [token, tr]);

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <BrandStyle color={data?.branding.color} />
      {showHeader && (
        <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 sm:px-6">
          {data ? <BrandLogo branding={data.branding} size={28} /> : <Skeleton className="h-7 w-7" />}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">{data?.name ?? " "}</h1>
            {data?.description && <p className="truncate text-xs text-[var(--text-muted)]">{tr(data.description)}</p>}
          </div>
          {data && !data.branding.logo_url && <span className="hidden text-sm font-medium text-[var(--text-secondary)] sm:block">{data.branding.name}</span>}
        </header>
      )}

      <main className="p-3 sm:p-5">
        {error && (
          <div className="mx-auto mt-16 max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">{error}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{tr("Ask the site owner for an updated embed code.")}</p>
          </div>
        )}

        {!error && !data && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-12">
            {data.charts.map((chart) => (
              <div
                key={chart.id}
                className={`${chart.type === "kpi" ? "h-[180px]" : "h-[400px]"} md:[grid-column:span_var(--chart-span)]`}
                style={{ "--chart-span": Math.min(12, Math.max(3, chart.position?.w ?? 6)) } as CSSProperties}
              >
                <ChartErrorBoundary title={tr(chart.title)}>
                  <ChartCard chart={chart} readOnly dataEndpoint={`/public/embeds/${token}/charts/${chart.id}/data`} />
                </ChartErrorBoundary>
              </div>
            ))}
            {data.charts.length === 0 && <p className="text-sm text-[var(--text-muted)] md:col-span-12">{tr("This dashboard has no charts yet.")}</p>}
          </div>
        )}

        {data && !data.branding.hide_powered_by && (
          <div className="mt-4 flex justify-end">
            <PoweredBy />
          </div>
        )}
      </main>
    </div>
  );
}
