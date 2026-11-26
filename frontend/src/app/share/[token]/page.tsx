"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Organization } from "@/lib/api";

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
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load this share."));
  }, [token]);

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
      setError(err instanceof ApiError ? err.message : "Couldn't accept the share.");
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <AuthShell title="Share link not found" subtitle={loadError}>
        <Link href="/dashboards" className="text-sm font-medium text-[var(--accent)] hover:underline">
          Go to Daha BI
        </Link>
      </AuthShell>
    );
  }

  if (!preview || loading) {
    return (
      <AuthShell title="Loading…">
        <div className="h-40 animate-pulse rounded-xl bg-[var(--surface-2)]" />
      </AuthShell>
    );
  }

  const from = preview.from_company ?? "A company";
  const summary = (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Shared dashboard</p>
      <p className="mt-1.5 text-base font-semibold text-[var(--text-primary)]">{preview.dashboard}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        From <span className="font-medium text-[var(--text-primary)]">{from}</span>
        {preview.shared_by && <> · sent by {preview.shared_by}</>}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">
        <li>✓ Everyone in your workspace can view it — live, always up to date</li>
        <li>✓ View only: {from} keeps ownership and can stop sharing at any time</li>
        {preview.filtered && <li>✓ Shows only the part of the data {from} chose to share with you</li>}
      </ul>
    </div>
  );

  if (preview.status !== "pending") {
    return (
      <AuthShell
        title={preview.status === "accepted" ? "Already accepted" : "This link has expired"}
        subtitle={preview.status === "accepted" ? "This dashboard is already in a workspace." : `Ask ${from} to share it again.`}
      >
        {summary}
        <Link href="/dashboards" className={BTN}>
          Go to your dashboards
        </Link>
      </AuthShell>
    );
  }

  if (!user) {
    const next = encodeURIComponent(`/share/${token}`);
    return (
      <AuthShell title={`${from} shared a dashboard with you`} subtitle="Sign in to add it to your company's workspace.">
        {summary}
        <div className="flex flex-col gap-2.5">
          <Link href={`/login?next=${next}`} className={BTN}>
            Sign in to accept
          </Link>
          <Link href={`/register?next=${next}`} className={BTN_GHOST}>
            Create a free account
          </Link>
        </div>
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">Sent to {preview.email}</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Add “${preview.dashboard}” to your workspace`}>
      {summary}
      {orgs === null ? (
        <div className="h-12 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      ) : manageable.length === 0 ? (
        <p className="rounded-lg bg-[var(--status-warning)]/12 px-3 py-2.5 text-sm text-[var(--text-secondary)]">
          You need to be an owner or admin of a workspace to accept for your company. Ask your workspace admin to open this link.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-[var(--text-secondary)]">
            Add it to
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
            {busy ? "Adding…" : "Accept for my company"}
          </button>
          <button onClick={() => router.push("/dashboards")} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Not now
          </button>
        </div>
      )}
    </AuthShell>
  );
}
