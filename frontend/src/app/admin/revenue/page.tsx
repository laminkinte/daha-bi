"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { StatCard } from "@/components/StatCard";
import { money, PlanBadge } from "@/components/admin/shared";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { api, type AdminPayment, type AdminStats, type AdminSubscription } from "@/lib/api";
import { AdminPage } from "@/components/AdminShell";

/** Paystack and Stripe revenue are separate currencies, not one combined total. */
function combinedRevenue(ngnKobo: number, usdCents: number): string {
  const parts = [ngnKobo > 0 && money(ngnKobo, "NGN"), usdCents > 0 && money(usdCents, "USD")].filter(Boolean);
  return parts.length > 0 ? parts.join(" + ") : money(0, "NGN");
}

const SUBSCRIPTION_COLUMNS: Column<AdminSubscription>[] = [
  {
    key: "organization",
    label: "Organization",
    value: (s) => s.name,
    render: (s) => (
      <>
        {s.name}
        <div className="text-xs text-[var(--text-muted)]">{s.billing_email ?? "—"}</div>
      </>
    ),
  },
  {
    key: "members",
    label: "Members",
    value: (s) => s.members_count,
    align: "right",
  },
  {
    key: "plan",
    label: "Plan",
    value: (s) => s.plan ?? "free",
    render: (s) => <PlanBadge plan={s.plan} status={s.plan_status} />,
  },
  {
    key: "interval",
    label: "Interval",
    value: (s) => s.billing_interval ?? "monthly",
    render: (s) => <span className="capitalize">{s.billing_interval ?? "monthly"}</span>,
  },
  {
    key: "subscribed",
    label: "Subscribed",
    value: (s) => s.subscribed_at ?? null,
    render: (s) => (s.subscribed_at ? new Date(s.subscribed_at).toLocaleDateString() : "—"),
  },
  {
    key: "renews",
    label: "Renews / trial ends",
    value: (s) => s.current_period_end ?? s.trial_ends_at ?? null,
    render: (s) =>
      s.current_period_end
        ? new Date(s.current_period_end).toLocaleDateString()
        : s.trial_ends_at
          ? new Date(s.trial_ends_at).toLocaleDateString()
          : "—",
  },
  {
    key: "lifetime_paid",
    label: "Lifetime paid",
    // NGN and USD totals can't be collapsed into one sortable number without mixing currencies
    // again (the exact bug fixed elsewhere on this page), so this column isn't sortable.
    value: (s) => combinedRevenue(s.lifetime_paid_ngn_kobo ?? 0, s.lifetime_paid_usd_cents ?? 0),
    sortable: false,
  },
];

const PAYMENT_COLUMNS: Column<AdminPayment>[] = [
  {
    key: "organization",
    label: "Organization",
    value: (p) => p.organization?.name ?? null,
    render: (p) => (
      <>
        {p.organization?.name ?? "—"}
        {/* No user on an automated renewal charge — no human initiated it. */}
        <div className="text-xs text-[var(--text-muted)]">{p.user ? p.user.email : "Automated renewal"}</div>
      </>
    ),
  },
  { key: "plan", label: "Plan", value: (p) => p.plan, render: (p) => <span className="capitalize">{p.plan}</span> },
  {
    key: "amount",
    label: "Amount",
    value: (p) => money(p.amount, p.currency),
    // Formatted strings across different currencies ("$10" vs "₦15,000") don't have a
    // meaningful sort order, so this is left unsortable rather than faking one.
    sortable: false,
  },
  {
    key: "status",
    label: "Status",
    value: (p) => p.status,
    render: (p) => (
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
          p.status === "success"
            ? "bg-[var(--status-good)]/15 text-[var(--status-good)]"
            : "bg-[var(--status-critical)]/15 text-[var(--status-critical)]"
        }`}
      >
        {p.status}
      </span>
    ),
  },
  {
    key: "date",
    label: "Date",
    value: (p) => p.created_at,
    render: (p) => new Date(p.created_at).toLocaleDateString(),
  },
];

function SubscriptionsView() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [subs, setSubs] = useState<AdminSubscription[] | null>(null);
  const [payments, setPayments] = useState<AdminPayment[] | null>(null);

  useEffect(() => {
    api.get<AdminStats>("/admin/stats").then(setStats).catch(() => {});
    api.get<AdminSubscription[]>("/admin/subscriptions").then(setSubs).catch(() => setSubs([]));
    api.get<AdminPayment[]>("/admin/payments").then(setPayments).catch(() => setPayments([]));
  }, []);

  return (
    <AdminPage title="Revenue" description="What Daha BI is earning, and who's paying for it.">

      {stats && !stats.payments_configured && (
        <div className="mb-6 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/10 px-4 py-3 text-sm text-[var(--text-secondary)]">
          Neither Paystack nor Stripe is configured yet (no <code>PAYSTACK_SECRET_KEY</code> or{" "}
          <code>STRIPE_SECRET_KEY</code>) — the numbers below reflect plans assigned manually so far, not real
          payments. Checkout will start working the moment real keys are added.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Revenue this month"
          value={stats ? combinedRevenue(stats.payments_this_month_ngn_kobo, stats.payments_this_month_usd_cents) : "—"}
        />
        <StatCard
          label="Total revenue"
          value={stats ? combinedRevenue(stats.total_revenue_ngn_kobo, stats.total_revenue_usd_cents) : "—"}
        />
        <StatCard label="Past due" value={stats?.past_due_users ?? "—"} />
        <StatCard label="Free" value={stats?.free_users ?? "—"} />
        <StatCard label="Growth" value={stats?.growth_users ?? "—"} />
        <StatCard label="Business" value={stats?.business_users ?? "—"} />
        <StatCard label="Trialing" value={stats?.trialing_users ?? "—"} />
      </div>

      <h2 className="mt-8 text-sm font-medium text-[var(--text-primary)]">Active subscriptions</h2>
      <div className="mt-3">
        <DataTable
          columns={SUBSCRIPTION_COLUMNS}
          rows={subs}
          getRowKey={(s) => s.id}
          filename="daha-bi-subscriptions"
          emptyMessage="No paid or trialing subscriptions yet."
        />
      </div>

      <h2 className="mt-8 text-sm font-medium text-[var(--text-primary)]">Recent payments</h2>
      <div className="mt-3">
        <DataTable
          columns={PAYMENT_COLUMNS}
          rows={payments}
          getRowKey={(p) => p.id}
          filename="daha-bi-payments"
          emptyMessage="No payments recorded yet."
        />
      </div>
    </AdminPage>
  );
}

export default function AdminRevenuePage() {
  return (
    <RequireAuth>
      <SubscriptionsView />
    </RequireAuth>
  );
}
