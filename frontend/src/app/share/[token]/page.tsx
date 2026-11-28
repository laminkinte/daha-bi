"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Organization } from "@/lib/api";
import { useT } from "@/i18n/ui";

type Preview = {
  dashboard: string;
  from_company: string | null;
  shared_by: string | null;
  email: string;
  filtered: boolean;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
};

const BTN = "block w-full rounded-lg bg-[var(--accent)] px-3 py-2.5 text-center text-sm font-medium text-white shadow-sm disabled:opacity-60";
const BTN_GHOST =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2.5 text-center text-sm font-medium text-[var(--text-primary)]";

/** A partner company accepts a dashboard another company shared with it. */
export default function ShareAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const tr = useT();
  const { token } = use(params);
  const router = useRouter();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [orgId, setOrgId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Preview>(`/public/shares/${token}`)
      .then(setPreview)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : tr("Couldn't load this share.")));
  }, [token, tr]);

  useEffect(() => {
    if (!user) return;
    api
      .get<Organization[]>("/organizations")
      .then((list) => setOrgs(list.filter((o) => o.role === "owner" || o.role === "admin")))
      .catch(() => setOrgs([]));
  }, [user]);

  const manageable = orgs ?? [];
  const chosen = orgId ?? (manageable.find((o) => o.id === user?.current_organization_id) ?? manageable[0])?.id ?? null;

  async function accept() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ dashboard_id: number }>(`/shares/${token}/accept`, { organization_id: chosen });
      // The accepting workspace became the current one — a full reload so the whole app follows.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/dashboards/${res.dashboard_id}`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Couldn't accept the share."));
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <AuthShell title={tr("Share link not found")} subtitle={loadError}>
        <Link href="/dashboards" className="text-sm font-medium text-[var(--accent)] hover:underline">
          {tr("Go to Daha BI")}
        </Link>
      </AuthShell>
    );
  }

  if (!preview || loading) {
    return (
      <AuthShell title={tr("Loading…")}>
        <div className="h-40 animate-pulse rounded-xl bg-[var(--surface-2)]" />
      </AuthShell>
    );
  }

  const from = preview.from_company ?? "A company";
  const summary = (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">{tr("Shared dashboard")}</p>
      <p className="mt-1.5 text-base font-semibold text-[var(--text-primary)]">{preview.dashboard}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {tr("From")} <span className="font-medium text-[var(--text-primary)]">{from}</span>
        {preview.shared_by && <> {tr("· sent by")} {preview.shared_by}</>}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">
        <li>{tr("✓ Everyone in your workspace can view it — live, always up to date")}</li>
        <li>{tr("✓ View only:")} {from} {tr("keeps ownership and can stop sharing at any time")}</li>
        {preview.filtered && <li>{tr("✓ Shows only the part of the data")} {from} {tr("chose to share with you")}</li>}
      </ul>
    </div>
  );

  if (preview.status !== "pending") {
    return (
      <AuthShell
        title={preview.status === "accepted" ? tr("Already accepted") : tr("This link has expired")}
        subtitle={preview.status === "accepted" ? tr("This dashboard is already in a workspace.") : tr("Ask {from} to share it again.", { from: from })}
      >
        {summary}
        <Link href="/dashboards" className={BTN}>
          {tr("Go to your dashboards")}
        </Link>
      </AuthShell>
    );
  }

  if (!user) {
    const next = encodeURIComponent(`/share/${token}`);
    return (
      <AuthShell title={tr("{from} shared a dashboard with you", { from: from })} subtitle={tr("Sign in to add it to your company's workspace.")}>
        {summary}
        <div className="flex flex-col gap-2.5">
          <Link href={`/login?next=${next}`} className={BTN}>
            {tr("Sign in to accept")}
          </Link>
          <Link href={`/register?next=${next}`} className={BTN_GHOST}>
            {tr("Create a free account")}
          </Link>
        </div>
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">{tr("Sent to")} {preview.email}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={tr("Add “{dashboard}” to your workspace", { dashboard: preview.dashboard })}>
      {summary}
      {orgs === null ? (
        <div className="h-12 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      ) : manageable.length === 0 ? (
        <p className="rounded-lg bg-[var(--status-warning)]/12 px-3 py-2.5 text-sm text-[var(--text-secondary)]">
          {tr("You need to be an owner or admin of a workspace to accept for your company. Ask your workspace admin to open this link.")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[var(--text-secondary)]">
            {tr("Add it to")}
            <select
              value={chosen ?? ""}
              onChange={(e) => setOrgId(Number(e.target.value))}
              className="mt-1.5 block w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
            >
              {manageable.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="rounded-lg bg-[var(--status-critical)]/10 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</p>}
          <button onClick={accept} disabled={busy || !chosen} className={BTN}>
            {busy ? tr("Adding…") : tr("Accept for my company")}
          </button>
          <button onClick={() => router.push("/dashboards")} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            {tr("Not now")}
          </button>
        </div>
      )}
    </AuthShell>
  );
}
