"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import RequireAuth from "@/components/RequireAuth";
import { StatCard } from "@/components/StatCard";
import { RowSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useRouter } from "next/navigation";
import { Modal, BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL } from "@/components/Modal";
import { api, ApiError, type DashboardTemplate, type DataSource, type Dashboard, type Dataset } from "@/lib/api";

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BarsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 20V10M12 20V4M18 20v-7" />
    </svg>
  );
}

function DbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const steps: [number, string][] = [
    [60, "s"], [60, "m"], [24, "h"], [7, "d"], [4.35, "w"], [12, "mo"],
  ];
  let value = seconds;
  let unit = "s";
  for (const [size, label] of steps) {
    unit = label;
    if (value < size) break;
    value /= size;
  }
  if (unit === "s") return "just now";
  return `${Math.floor(value)}${unit} ago`;
}

/**
 * Decorative mini-layout so each card reads as "a dashboard" at a glance. Deterministic per
 * dashboard id (so cards don't reshuffle on reload) and drawn only in the brand tint — it's an
 * illustration, not data, so it must not borrow chart-series colors.
 */
function DashboardThumbnail({ seed, charts }: { seed: number; charts: number }) {
  const rand = (n: number) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  const bars = Array.from({ length: 7 }, (_, i) => 25 + rand(i) * 70);

  return (
    <div className="relative h-28 border-b border-[var(--border)] bg-[var(--surface-2)] p-3">
      {charts === 0 ? (
        <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)]">
          Empty dashboard
        </div>
      ) : (
        <div className="grid h-full grid-cols-5 gap-2">
          <div className="col-span-2 flex flex-col justify-between rounded-lg bg-[var(--surface-1)] p-2.5 shadow-sm">
            <div className="h-1.5 w-10 rounded-full bg-[var(--text-muted)]/25" />
            <div className="h-4 w-14 rounded bg-[var(--accent)]/80" />
            <div className="h-1.5 w-8 rounded-full bg-[var(--accent)]/30" />
          </div>
          <div className="col-span-3 flex items-end gap-1 rounded-lg bg-[var(--surface-1)] p-2.5 shadow-sm">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm bg-[var(--accent)]" style={{ height: `${h}%`, opacity: 0.35 + (i / bars.length) * 0.55 }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GridIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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

type CreateMode = "blank" | "template";

/**
 * One dialog for both ways of starting a dashboard: blank (name + description) or from a template
 * (which builds starter charts from a dataset). Either way it lands the user inside the new dashboard.
 */
function CreateDashboardDialog({
  initialMode,
  onClose,
  onCreated,
}: {
  initialMode: CreateMode;
  onClose: () => void;
  onCreated: (dashboardId: number) => void;
}) {
  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templates, setTemplates] = useState<DashboardTemplate[] | null>(null);
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [template, setTemplate] = useState<DashboardTemplate | null>(null);
  const [datasetId, setDatasetId] = useState<number | "">("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardTemplate[]>("/dashboard-templates").then(setTemplates).catch(() => setTemplates([]));
    api
      .get<Dataset[]>("/datasets")
      .then((all) => {
        setDatasets(all);
        if (all[0]) setDatasetId(all[0].id);
      })
      .catch(() => setDatasets([]));
  }, []);

  function pickTemplate(t: DashboardTemplate) {
    setTemplate(t);
    if (!name.trim() || templates?.some((x) => x.name === name)) setName(t.name);
  }

  const canCreate = mode === "blank" ? !!name.trim() : !!template && !!datasetId && !!name.trim();

  async function create(e?: FormEvent) {
    e?.preventDefault();
    if (!canCreate || creating) return;
    setCreating(true);
    setError(null);
    try {
      const dashboard =
        mode === "blank"
          ? await api.post<{ id: number }>("/dashboards", { name: name.trim(), description: description.trim() || null })
          : await api.post<{ id: number }>("/dashboard-templates", { template: template!.key, dataset_id: datasetId, name: name.trim() });
      onCreated(dashboard.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create dashboard.");
      setCreating(false);
    }
  }

  const modeCard = (value: CreateMode, title: string, hint: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
        mode === value
          ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
          : "border-[var(--border)] hover:border-[var(--accent)]/50"
      }`}
    >
      <span className={`mt-0.5 ${mode === value ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{hint}</span>
      </span>
    </button>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={<GridIcon size={18} />}
      title="New dashboard"
      description="Start from scratch, or let a template lay out the first charts for you."
      footer={
        <>
          {error && <p className="mr-auto text-sm text-[var(--status-critical)]">{error}</p>}
          <button onClick={onClose} className={BTN_SECONDARY}>
            Cancel
          </button>
          <button onClick={() => create()} disabled={!canCreate || creating} className={BTN_PRIMARY}>
            {creating ? "Creating…" : "Create dashboard"}
          </button>
        </>
      }
    >
      <form onSubmit={create} className="space-y-5 p-5">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {modeCard("blank", "Blank dashboard", "An empty canvas — add charts one by one.", <PlusIcon />)}
          {modeCard("template", "From a template", "Starter charts picked from your data.", <TemplateIcon icon="sprout" />)}
        </div>

        {mode === "template" && (
          <div>
            <label className={FIELD_LABEL}>Template</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {templates === null &&
                [0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface-2)]" />)}
              {templates?.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                    template?.key === t.key
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--border)] hover:border-[var(--accent)]/50"
                  }`}
                >
                  <span className="text-[var(--accent)]">
                    <TemplateIcon icon={t.icon} />
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">{t.name}</span>
                  <span className="line-clamp-2 text-[11.5px] leading-4 text-[var(--text-muted)]">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={mode === "template" ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
          <div>
            <label className={FIELD_LABEL}>Name</label>
            <input
              data-autofocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === "template" ? template?.name ?? "Pick a template" : "e.g. Weekly sales review"}
              className={FIELD_INPUT}
              maxLength={255}
            />
          </div>
          {mode === "blank" ? (
            <div>
              <label className={FIELD_LABEL}>
                Description <span className="font-normal text-[var(--text-muted)]">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={255}
                placeholder="What is this dashboard for?"
                className={`${FIELD_INPUT} resize-none`}
              />
            </div>
          ) : (
            <div>
              <label className={FIELD_LABEL}>Build it from</label>
              <select value={datasetId} onChange={(e) => setDatasetId(e.target.value ? Number(e.target.value) : "")} className={FIELD_INPUT}>
                {datasets?.length === 0 && <option value="">No datasets yet</option>}
                {datasets?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {mode === "template" && datasets?.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            Templates need a dataset to build charts from.{" "}
            <Link href="/data-sources" className="font-medium text-[var(--accent)]">
              Connect a data source
            </Link>{" "}
            first.
          </p>
        )}
      </form>
    </Modal>
  );
}

function DashboardsList() {
  const t = useTranslations("dashboards");
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[] | null>(null);
  const [search, setSearch] = useState("");
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<Dashboard[]>("/dashboards").then(setDashboards).catch(() => setDashboards([]));
  }

  useEffect(() => {
    load();
    api.get<DataSource[]>("/data-sources").then(setDataSources).catch(() => setDataSources([]));
  }, []);

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
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[0.16] blur-3xl"
          style={{ background: "var(--accent-glow)" }}
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">{greeting()}</p>
            <h1 className="mt-1.5 text-[28px] font-semibold leading-tight tracking-tight">{t("title")}</h1>
            <p className="mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCreateMode("template")}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <TemplateIcon icon="sprout" />
              {t("fromTemplate")}
            </button>
            <button
              onClick={() => setCreateMode("blank")}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[var(--accent-hover)]"
            >
              <PlusIcon />
              {t("newDashboard")}
            </button>
          </div>
        </div>
      </div>

      {createMode && (
        <CreateDashboardDialog
          initialMode={createMode}
          onClose={() => setCreateMode(null)}
          onCreated={(id) => router.push(`/dashboards/${id}`)}
        />
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard label="Dashboards" value={dashboards?.length ?? "—"} icon={<GridIcon size={16} />} />
        <StatCard label="Charts" value={dashboards ? totalCharts : "—"} icon={<BarsIcon />} />
        <StatCard label="Data Sources" value={dataSources?.length ?? "—"} icon={<DbIcon />} hint={dataSources?.length === 0 ? "Connect one to start building" : undefined} />
      </div>

      {error && <p className="mt-2 text-sm text-[var(--status-critical)]">{error}</p>}

      {dashboards && dashboards.length > 0 && (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            All dashboards <span className="ml-1 font-normal text-[var(--text-muted)]">{filtered?.length ?? 0}</span>
          </h2>
          <div className="relative w-full sm:max-w-xs">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <SearchIcon />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dashboards..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] py-2 pl-9 pr-3 text-sm outline-none"
            />
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dashboards === null && (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        )}
        {dashboards?.length === 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
          <EmptyState
            icon={<GridIcon />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <button
                onClick={() => setCreateMode("blank")}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
              >
                <PlusIcon />
                {t("newDashboard")}
              </button>
            }
          />
          </div>
        )}
        {filtered && filtered.length === 0 && dashboards && dashboards.length > 0 && (
          <p className="py-6 text-center text-sm text-[var(--text-muted)] sm:col-span-2 lg:col-span-3">
            No dashboards match &ldquo;{search}&rdquo;.
          </p>
        )}
        {filtered?.map((d) => (
          <div
            key={d.id}
            className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-lg"
          >
            <Link href={`/dashboards/${d.id}`} className="flex flex-1 flex-col">
              <DashboardThumbnail seed={d.id} charts={d.charts_count ?? 0} />
              <div className="flex flex-1 flex-col px-4 pb-3 pt-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="line-clamp-1 font-semibold tracking-tight text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                    {d.name}
                  </div>
                  {d.role && d.role !== "owner" && (
                    <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium capitalize text-[var(--text-secondary)]">
                      {d.role}
                    </span>
                  )}
                  {d.is_shared && (
                    <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                      Public
                    </span>
                  )}
                </div>
                <div className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] text-[var(--text-muted)]">
                  {d.description || "No description"}
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <BarsIcon size={12} />
                    {d.charts_count ?? 0} chart{d.charts_count === 1 ? "" : "s"}
                  </span>
                  {d.updated_at && <span>Updated {timeAgo(d.updated_at)}</span>}
                </div>
              </div>
            </Link>
            {(!d.role || d.role === "owner") && (
              <div className="flex items-center gap-1 border-t border-[var(--border)] px-2 py-1.5">
                <Link
                  href={`/dashboards/${d.id}`}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                >
                  Open
                </Link>
                <button
                  onClick={() => onDuplicate(d.id)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => onDelete(d.id)}
                  className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10"
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
