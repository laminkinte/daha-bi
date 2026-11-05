"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { formatValue } from "@/lib/format-value";
import { api, ApiError, type BillingInterval, type Organization, type OrgRole, type Plan, type PricingTier } from "@/lib/api";
import BillingIntervalToggle, { yearlySavingsPercent } from "@/components/BillingIntervalToggle";

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PricingContent() {
  const { user } = useAuth();
  const [tiers, setTiers] = useState<PricingTier[] | null>(null);
  const [busyPlan, setBusyPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly");
  const [orgRole, setOrgRole] = useState<OrgRole | null>(null);

  useEffect(() => {
    api
      .get<{ pricing_tiers: PricingTier[] }>("/site-settings")
      .then((res) => setTiers(res.pricing_tiers))
      .catch(() => setTiers([]));
  }, []);

  useEffect(() => {
    if (!user?.current_organization_id) return;
    api
      .get<Organization[]>("/organizations")
      .then((orgs) => setOrgRole(orgs.find((o) => o.id === user.current_organization_id)?.role ?? null))
      .catch(() => {});
  }, [user?.current_organization_id]);

  const canManageBilling = orgRole === "owner" || orgRole === "admin";

  async function onSelect(plan: Plan) {
    if (!user) return; // handled by the Link fallback below
    if (plan === "free") return;
    setError(null);
    setBusyPlan(plan);
    try {
      const res = await api.post<{ url: string }>("/billing/stripe/checkout", { plan, interval });
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start checkout.");
      setBusyPlan(null);
    }
  }

  async function onSelectFlutterwave(plan: Plan) {
    if (!user || plan === "free") return;
    setError(null);
    setBusyPlan(plan);
    try {
      const res = await api.post<{ link: string }>("/billing/flutterwave/checkout", { plan, interval });
      window.location.assign(res.link);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start checkout.");
      setBusyPlan(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      {!user && <PublicHeader />}
      <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-[var(--text-primary)] sm:text-4xl">
          Simple pricing, wherever you are
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[var(--text-secondary)]">
          Start free. Upgrade only when your team actually needs more. One secure checkout, in US Dollars, that
          accepts cards issued anywhere in the world.
        </p>
      </div>

      {error && <p className="mx-auto mt-6 max-w-md text-center text-sm text-[var(--status-critical)]">{error}</p>}

      {tiers && tiers.length > 0 && (
        <div className="mt-8 flex justify-center">
          <BillingIntervalToggle
            value={interval}
            onChange={setBillingInterval}
            savingsPercent={yearlySavingsPercent(
              tiers.find((t) => t.plan === "growth")?.amount_usd_cents ?? 0,
              tiers.find((t) => t.plan === "growth")?.amount_usd_cents_yearly ?? 0
            )}
          />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {tiers?.map((tier) => {
          const isCurrent = user?.current_organization?.plan === tier.plan;
          const cta = tier.plan === "free" ? "Get started free" : `Upgrade to ${tier.name}`;
          const isYearly = interval === "yearly" && tier.plan !== "free";
          const amountCents = isYearly ? tier.amount_usd_cents_yearly : tier.amount_usd_cents;
          const periodLabel = tier.plan === "free" ? tier.period : isYearly ? "/ year" : tier.period;
          return (
            <div
              key={tier.name}
              className={`rounded-xl border p-6 ${
                tier.highlighted
                  ? "border-[var(--accent)] bg-[var(--surface-1)] shadow-sm"
                  : "border-[var(--border)] bg-[var(--surface-1)]"
              }`}
            >
              {tier.highlighted && (
                <div className="mb-3 inline-block rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-xs font-medium text-white">
                  Most popular
                </div>
              )}
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{tier.name}</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{tier.tagline}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                  {formatValue(amountCents / 100, "currency", "USD")}
                </span>
                <span className="text-sm text-[var(--text-muted)]">{periodLabel}</span>
              </div>

              {!user ? (
                <Link
                  href="/register"
                  className={`mt-6 block rounded-md px-4 py-2.5 text-center text-sm font-medium ${
                    tier.highlighted
                      ? "bg-[var(--accent)] text-white"
                      : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tier.plan === "free" ? cta : "Start free trial"}
                </Link>
              ) : isCurrent ? (
                <div className="mt-6 rounded-md border border-[var(--border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--text-muted)]">
                  Current plan
                </div>
              ) : tier.plan === "free" ? (
                <Link
                  href="/dashboards"
                  className="mt-6 block rounded-md border border-[var(--border)] px-4 py-2.5 text-center text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Go to dashboards
                </Link>
              ) : !canManageBilling ? (
                <div className="mt-6 rounded-md border border-[var(--border)] px-4 py-2.5 text-center text-sm text-[var(--text-muted)]">
                  Ask your organization&apos;s owner or admin
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onSelect(tier.plan)}
                    disabled={busyPlan !== null}
                    className={`mt-6 block w-full rounded-md px-4 py-2.5 text-center text-sm font-medium disabled:opacity-60 ${
                      tier.highlighted
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {busyPlan === tier.plan ? "Redirecting..." : cta}
                  </button>
                  <button
                    onClick={() => onSelectFlutterwave(tier.plan)}
                    disabled={busyPlan !== null}
                    className="mt-2 block w-full text-center text-xs text-[var(--accent)] hover:underline disabled:opacity-60"
                  >
                    or pay with Flutterwave (NGN)
                  </button>
                </>
              )}

              <ul className="mt-6 flex flex-col gap-2.5 text-sm text-[var(--text-secondary)]">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--status-good)]">
                      <CheckIcon />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-10 text-center text-sm text-[var(--text-muted)]">
        Need something custom for a larger organization?{" "}
        <a href="mailto:hello@daha.bi" className="text-[var(--accent)]">
          Get in touch
        </a>
        .
      </p>
      </div>
      {!user && <Footer />}
    </div>
  );
}

export default function PricingPage() {
  return <PricingContent />;
}
