"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import RequireAuth from "@/components/RequireAuth";
import { StatCard } from "@/components/StatCard";
import { RowSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useRouter } from "next/navigation";
import { api, ApiError, type DashboardTemplate, type DataSource, type Dashboard, type Dataset } from "@/lib/api";

function GridIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

const TEMPLATE_ICON_PATHS: Record<string, string> = {
  "trending-up": "M3 17l6-6 4 4 8-8M15 7h6v6",
  wallet: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm14 6h.01",
  users: "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  landmark: "M3 21h18M5 21V9m4 12V9m6 12V9m4 12V9M3 9l9-6 9 6M4 9h16",
  sprout: "M12 21v-8M8 13a4 4 0 0 1-4-4c3.5 0 5.5 1.5 6.5 3M16 13a4 4 0 0 0 4-4c-3.5 0-5.5 1.5-6.5 3",
};

function TemplateIcon({ icon }: { icon: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={TEMPLATE_ICON_PATHS[icon] ?? TEMPLATE_ICON_PATHS["trending-up"]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TemplateGalleryPanel({ onCreated }: { onCreated: (dashboardId: number) => void }) {
  const [templates, setTemplates] = useState<DashboardTemplate[] | null>(null);
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [selected, setSelected] = useState<DashboardTemplate | null>(null);
  const [datasetId, setDatasetId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardTemplate[]>("/dashboard-templates").then(setTemplates).catch(() => setTemplates([]));
    api.get<Dataset[]>("/datasets").then(setDatasets).catch(() => setDatasets([]));
  }, []);

  function selectTemplate(t: DashboardTemplate) {
    setSelected(t);
    setName(t.name);
    setError(null);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!selected || !datasetId) return;
    setCreating(true);
    setError(null);
    try {
      const dashboard = await api.post<{ id: number }>("/dashboard-templates", {
        template: selected.key,
        dataset_id: datasetId,
        name,
      });
      onCreated(dashboard.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create dashboard from template.");
      setCreating(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <h2 className="text-sm font-medium text-[var(--text-primary)]">Start from a template</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Picks sensible charts from your data automatically — a KPI, a breakdown, a trend, and a
        table. Everything&apos;s a normal chart afterward, fully editable.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {templates === null && <p className="text-xs text-[var(--text-muted)]">Loading...</p>}
        {templates?.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTemplate(t)}
            className={`flex flex-col items-start gap-1.5 rounded-md border p-3 text-left transition-colors ${
              selected?.key === t.key
                ? "border-[var(--series-1)] bg-[var(--series-1)]/5"
                : "border-[var(--border)] hover:border-[var(--series-1)]/50"
            }`}
          >
            <span className="text-[var(--series-1)]">
              <TemplateIcon icon={t.icon} />
            </span>
            <span className="text-sm font-medium text-[var(--text-primary)]">{t.name}</span>
            <span className="text-xs text-[var(--text-muted)]">{t.description}</span>
          </button>
        ))}
      </div>

      {selected && (
        <form onSubmit={onCreate} className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dashboard name"
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
          />
          <select
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="">Choose a dataset...</option>
            {datasets?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating || !datasetId || !name.trim()}
            className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {creating ? "Creating..." : "Create dashboard"}
          </button>
        </form>
      )}
      {datasets?.length === 0 && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Connect a data source first — templates need a dataset to build charts from.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-[var(--status-critical)]">{error}</p>}
    </div>
  );
}

function DashboardsList() {
  const t = useTranslations("dashboards");
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[] | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<Dashboard[]>("/dashboards").then(setDashboards).catch(() => setDashboards([]));
  }

  useEffect(() => {
    load();
    api.get<DataSource[]>("/data-sources").then(setDataSources).catch(() => setDataSources([]));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.post("/dashboards", { name });
      setName("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create dashboard.");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this dashboard and all its charts?")) return;
    setError(null);
    try {
      await api.del(`/dashboards/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete dashboard.");
    }
  }

  async function onDuplicate(id: number) {
    setError(null);
    try {
      await api.post(`/dashboards/${id}/duplicate`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to duplicate dashboard.");
    }
  }

  const totalCharts = useMemo(
    () => dashboards?.reduce((sum, d) => sum + (d.charts_count ?? 0), 0) ?? 0,
    [dashboards]
  );

  const filtered = useMemo(() => {
    if (!dashboards) return null;
    const q = search.trim().toLowerCase();
    if (!q) return dashboards;
    return dashboards.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q)
    );
  }, [dashboards, search]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplates((s) => !s)}
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {t("fromTemplate")}
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white"
          >
            {t("newDashboard")}
          </button>
        </div>
      </div>

      {showTemplates && <TemplateGalleryPanel onCreated={(id) => router.push(`/dashboards/${id}`)} />}

      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard label="Dashboards" value={dashboards?.length ?? "—"} />
        <StatCard label="Charts" value={dashboards ? totalCharts : "—"} />
        <StatCard label="Data Sources" value={dataSources?.length ?? "—"} />
      </div>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="mt-6 flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dashboard name"
            className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Create
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-[var(--status-critical)]">{error}</p>}

      {dashboards && dashboards.length > 0 && (
        <div className="relative mt-8 max-w-xs">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dashboards..."
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--series-1)]"
          />
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {dashboards === null && (
          <>
            <RowSkeleton />
            <RowSkeleton />
          </>
        )}
        {dashboards?.length === 0 && (
          <EmptyState
            icon={<GridIcon />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <button
                onClick={() => setShowForm(true)}
                className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white"
              >
                {t("newDashboard")}
              </button>
            }
          />
        )}
        {filtered && filtered.length === 0 && dashboards && dashboards.length > 0 && (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">
            No dashboards match &ldquo;{search}&rdquo;.
          </p>
        )}
        {filtered?.map((d) => (
          <div
            key={d.id}
            className="group flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 transition-shadow hover:shadow-sm"
          >
            <Link href={`/dashboards/${d.id}`} className="flex-1">
              <div className="flex items-center gap-2">
                <div className="font-medium text-[var(--text-primary)] group-hover:text-[var(--series-1)]">
                  {d.name}
                </div>
                {d.role && d.role !== "owner" && (
                  <span className="rounded-full bg-[var(--page-plane)] px-2 py-0.5 text-xs capitalize text-[var(--text-muted)]">
                    {d.role}
                  </span>
                )}
              </div>
              {d.description && (
                <div className="text-sm text-[var(--text-muted)]">{d.description}</div>
              )}
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                {d.charts_count ?? 0} chart{d.charts_count === 1 ? "" : "s"}
              </div>
            </Link>
            {(!d.role || d.role === "owner") && (
              <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => onDuplicate(d.id)}
                  className="rounded-md border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => onDelete(d.id)}
                  className="rounded-md border border-[var(--border)] px-3 py-1 text-sm text-[var(--status-critical)]"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardsPage() {
  return (
    <RequireAuth>
      <DashboardsList />
    </RequireAuth>
  );
}
