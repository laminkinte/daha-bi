"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError, type ReferralsSummary } from "@/lib/api";
import { PageHeader, PAGE_CONTAINER } from "@/components/PageHeader";
import { useT, uiLocaleTag } from "@/i18n/ui";

function GiftIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" />
    </svg>
  );
}

function Referrals() {
  const tr = useT();
  const [summary, setSummary] = useState<ReferralsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getRetrying<ReferralsSummary>("/referrals")
      .then(setSummary)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : tr("Failed to load referrals.")));
  }, [tr]);

  const referralLink =
    summary && typeof window !== "undefined"
      ? `${window.location.origin}/register?ref=${summary.referral_code}`
      : "";

  async function copyLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`${PAGE_CONTAINER} max-w-3xl`}>
      <PageHeader
        icon="gift"
        title={tr("Refer & Earn")}
        description={tr("Share your link. Everyone who signs up through it is tracked here.")}
      />

      {loadError && <p className="mt-6 text-sm text-[var(--status-critical)]">{loadError}</p>}

      {!loadError && !summary && (
        <p className="mt-6 text-sm text-[var(--text-muted)]">{tr("Loading...")}</p>
      )}

      {summary && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <StatCard label={tr("Referral code")} value={summary.referral_code} />
            <StatCard label={tr("People referred")} value={summary.referral_count} />
          </div>

          <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              {tr("Your invite link")}
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={referralLink}
                className="flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-3 py-2 text-sm"
              />
              <button
                onClick={copyLink}
                className="shrink-0 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
              >
                {copied ? tr("Copied!") : tr("Copy")}
              </button>
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">{tr("Your referrals")}</h2>
            {summary.referrals.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<GiftIcon />}
                  title={tr("No referrals yet")}
                  description={tr("Share your link above — anyone who signs up through it will show up here.")}
                />
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {summary.referrals.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm"
                  >
                    <span className="text-[var(--text-primary)]">{r.name}</span>
                    <span className="text-[var(--text-muted)]">
                      {new Date(r.created_at).toLocaleDateString(uiLocaleTag())}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ReferralsPage() {
  return (
    <RequireAuth>
      <Referrals />
    </RequireAuth>
  );
}
