"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { formatValue } from "@/lib/format-value";
import {
  api,
  ApiError,
  type AuditLog,
  type BillingInterval,
  type InviteSent,
  type Organization,
  type OrganizationMember,
  type OrgRole,
  type Plan,
  type PricingTier,
  type User,
} from "@/lib/api";
import BillingIntervalToggle, { yearlySavingsPercent } from "@/components/BillingIntervalToggle";
import DataTable, { type Column } from "@/components/admin/DataTable";
import { PageHeader, PAGE_CONTAINER } from "@/components/PageHeader";
import { InviteSentNotice, PendingInvites } from "@/components/PendingInvites";

const PLAN_LABELS: Record<Plan, string> = { free: "Free", growth: "Growth", business: "Business" };

const ORG_ROLES: OrgRole[] = ["owner", "admin", "analyst", "viewer"];

function OrganizationSection() {
  const t = useTranslations("settings");
  const { user } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("analyst");
  const [inviting, setInviting] = useState(false);
  const [inviteSent, setInviteSent] = useState<InviteSent | null>(null);
  const [inviteRefresh, setInviteRefresh] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.current_organization_id) return;
    api
      .get<Organization[]>("/organizations")
      .then((orgs) => {
        const current = orgs.find((o) => o.id === user.current_organization_id);
        if (current) {
          setOrg(current);
          setName(current.name);
        }
      })
      .catch(() => {});
  }, [user?.current_organization_id]);

  function loadMembers(organizationId: number) {
    api
      .get<OrganizationMember[]>(`/organizations/${organizationId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]));
  }

  useEffect(() => {
    if (org) loadMembers(org.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id]);

  if (!org) return null;

  const canManage = org.role === "owner" || org.role === "admin";

  async function saveName() {
    if (!org || name === org.name) return;
    setSavingName(true);
    setError(null);
    try {
      const updated = await api.put<Organization>(`/organizations/${org.id}`, { name });
      setOrg({ ...org, name: updated.name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to rename organization.");
    } finally {
      setSavingName(false);
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!org || !inviteEmail) return;
    setInviting(true);
    setError(null);
    try {
      const res = await api.post<InviteSent | OrganizationMember>(`/organizations/${org.id}/members`, { email: inviteEmail, role: inviteRole });
      setInviteEmail("");
      if ("pending" in res && res.pending) {
        // No account yet — an invitation link was emailed instead.
        setInviteSent(res);
        setInviteRefresh((n) => n + 1);
      } else {
        setInviteSent(null);
        loadMembers(org.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite member.");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(memberId: number, role: OrgRole) {
    if (!org) return;
    setError(null);
    try {
      await api.put(`/organizations/${org.id}/members/${memberId}`, { role });
      loadMembers(org.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update role.");
    }
  }

  async function removeMember(memberId: number) {
    if (!org) return;
    setError(null);
    try {
      await api.del(`/organizations/${org.id}/members/${memberId}`);
      loadMembers(org.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove member.");
    }
  }

  const columns: Column<OrganizationMember>[] = [
    { key: "name", label: "Name", value: (m) => m.name },
    { key: "email", label: "Email", value: (m) => m.email },
    {
      key: "role",
      label: "Role",
      value: (m) => m.role,
      render: (m) =>
        canManage && m.id !== user?.id ? (
          <select
            value={m.role}
            onChange={(e) => changeRole(m.id, e.target.value as OrgRole)}
            className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs capitalize"
          >
            {ORG_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <span className="capitalize">{m.role}</span>
        ),
    },
    {
      key: "actions",
      label: "",
      value: () => null,
      sortable: false,
      excludeFromCsv: true,
      render: (m) =>
        canManage && m.id !== user?.id ? (
          <button
            onClick={() => removeMember(m.id)}
            className="text-xs text-[var(--status-critical)] hover:opacity-80"
          >
            Remove
          </button>
        ) : null,
    },
  ];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6">
      <h2 className="-mx-5 -mt-5 mb-4 border-b border-[var(--border)] px-5 py-3.5 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] sm:-mx-6 sm:-mt-6 sm:px-6">{t("organization")}</h2>

      <div className="mt-3 flex items-center gap-2">
        {canManage ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={saveName}
              disabled={savingName || name === org.name}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {savingName ? "Saving..." : "Save"}
            </button>
          </>
        ) : (
          <span className="text-lg font-semibold text-[var(--text-primary)]">{org.name}</span>
        )}
      </div>
      <p className="mt-1 text-xs capitalize text-[var(--text-muted)]">Your role: {org.role}</p>

      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={members}
          getRowKey={(m) => m.id}
          filename="organization-members"
          emptyMessage="No members yet."
          search={false}
        />
      </div>

      {canManage && (
        <form onSubmit={invite} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            type="email"
            placeholder="Invite by email — teammates or partners..."
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as OrgRole)}
            className="rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm capitalize"
          >
            {ORG_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting || !inviteEmail}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {inviting ? "Inviting..." : "Invite"}
          </button>
        </form>
      )}
      {canManage && inviteSent && (
        <div className="mt-3">
          <InviteSentNotice invite={inviteSent} onClose={() => setInviteSent(null)} />
        </div>
      )}
      {canManage && <PendingInvites listUrl={`/organizations/${org.id}/invitations`} refreshKey={inviteRefresh} />}
      {canManage && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          People without an account get an email with a secure 7-day link. Owner/admin can create and edit everything;
          analyst can create and edit dashboards and data sources; viewer is read-only.
        </p>
      )}
    </div>
  );
}

const AUDIT_LOG_COLUMNS: Column<AuditLog>[] = [
  {
    key: "when",
    label: "When",
    value: (l) => l.created_at,
    render: (l) => new Date(l.created_at).toLocaleString(),
  },
  {
    key: "who",
    label: "Who",
    value: (l) => l.user?.name ?? "System",
  },
  {
    key: "description",
    label: "What happened",
    value: (l) => l.description,
  },
  { key: "ip", label: "IP", value: (l) => l.ip_address ?? "—" },
];

/**
 * Only rendered content when the caller is owner/admin — same audience allowed to manage
 * members and billing. A viewer/analyst simply doesn't see this card.
 */
function ActivitySection() {
  const t = useTranslations("settings");
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<number | null>(null);
  const [canView, setCanView] = useState(false);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);

  useEffect(() => {
    if (!user?.current_organization_id) return;
    api
      .get<Organization[]>("/organizations")
      .then((orgs) => {
        const current = orgs.find((o) => o.id === user.current_organization_id);
        setOrgId(current?.id ?? null);
        setCanView(current?.role === "owner" || current?.role === "admin");
      })
      .catch(() => {});
  }, [user?.current_organization_id]);

  useEffect(() => {
    if (!orgId || !canView) return;
    api
      .get<AuditLog[]>(`/organizations/${orgId}/audit-logs`)
      .then(setLogs)
      .catch(() => setLogs([]));
  }, [orgId, canView]);

  if (!canView) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6">
      <h2 className="-mx-5 -mt-5 mb-4 border-b border-[var(--border)] px-5 py-3.5 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] sm:-mx-6 sm:-mt-6 sm:px-6">{t("activity")}</h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Who did what to your organization&apos;s members, data sources, and dashboards.
      </p>
      <div className="mt-4">
        <DataTable
          columns={AUDIT_LOG_COLUMNS}
          rows={logs}
          getRowKey={(l) => l.id}
          filename="organization-activity"
          emptyMessage="No activity recorded yet."
        />
      </div>
    </div>
  );
}

function PlanSection() {
  const t = useTranslations("settings");
  const { user } = useAuth();
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
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

  if (!user || !user.current_organization) return null;

  const org = user.current_organization;
  const plan = org.plan;
  const otherPlans: Plan[] = (["growth", "business"] as Plan[]).filter((p) => p !== plan);
  const canManageBilling = orgRole === "owner" || orgRole === "admin";

  async function upgrade(target: Plan) {
    setError(null);
    setBusy(target);
    try {
      const res = await api.post<{ url: string }>("/billing/stripe/checkout", { plan: target, interval });
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start checkout.");
      setBusy(null);
    }
  }

  async function upgradeWithFlutterwave(target: Plan) {
    setError(null);
    setBusy(target);
    try {
      const res = await api.post<{ link: string }>("/billing/flutterwave/checkout", { plan: target, interval });
      window.location.assign(res.link);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start checkout.");
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6">
      <h2 className="-mx-5 -mt-5 mb-4 border-b border-[var(--border)] px-5 py-3.5 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] sm:-mx-6 sm:-mt-6 sm:px-6">{t("plan")}</h2>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-lg font-semibold text-[var(--text-primary)]">{PLAN_LABELS[plan]}</span>
        {org.plan_status !== "active" && (
          <span className="rounded-full bg-[var(--status-warning)]/15 px-2 py-0.5 text-xs font-medium capitalize text-[var(--status-warning)]">
            {org.plan_status}
          </span>
        )}
      </div>
      {plan !== "free" && org.current_period_end && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Renews {new Date(org.current_period_end).toLocaleDateString()}
          {org.billing_interval ? ` · billed ${org.billing_interval}` : ""}
        </p>
      )}
      {plan === "free" && <p className="mt-1 text-sm text-[var(--text-muted)]">Free, forever.</p>}

      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}

      {!canManageBilling && otherPlans.length > 0 && (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Only an organization owner or admin can change the plan.
        </p>
      )}

      {canManageBilling && otherPlans.length > 0 && (
        <>
          <div className="mt-4">
            <BillingIntervalToggle
              value={interval}
              onChange={setBillingInterval}
              savingsPercent={yearlySavingsPercent(
                tiers.find((t) => t.plan === "growth")?.amount_usd_cents ?? 0,
                tiers.find((t) => t.plan === "growth")?.amount_usd_cents_yearly ?? 0
              )}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {otherPlans.map((p) => {
              const tier = tiers.find((t) => t.plan === p);
              const amountCents = tier ? (interval === "yearly" ? tier.amount_usd_cents_yearly : tier.amount_usd_cents) : null;
              const price = amountCents !== null ? formatValue(amountCents / 100, "currency", "USD") : null;
              const suffix = interval === "yearly" ? "/yr" : "/mo";
              return (
                <div key={p} className="flex items-center gap-2">
                  <button
                    onClick={() => upgrade(p)}
                    disabled={busy !== null}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-60"
                  >
                    {busy === p
                      ? "Redirecting..."
                      : `Switch to ${PLAN_LABELS[p]}${price ? ` — ${price}${suffix}` : ""}`}
                  </button>
                  <button
                    onClick={() => upgradeWithFlutterwave(p)}
                    disabled={busy !== null}
                    className="text-xs text-[var(--accent)] hover:underline disabled:opacity-60"
                  >
                    or pay with Flutterwave (NGN)
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      <p className="mt-4 text-xs text-[var(--text-muted)]">
        <Link href="/pricing" className="text-[var(--accent)]">
          See full plan comparison
        </Link>
      </p>
    </div>
  );
}

function ProfileForm() {
  const t = useTranslations("settings");
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [lowBandwidth, setLowBandwidth] = useState(user?.low_bandwidth_mode ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.put<User>("/user", { name, email, low_bandwidth_mode: lowBandwidth });
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6">
      <h2 className="-mx-5 -mt-5 mb-4 border-b border-[var(--border)] px-5 py-3.5 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] sm:-mx-6 sm:-mt-6 sm:px-6">{t("profile")}</h2>
      <div className="mt-4 flex flex-col gap-3 sm:max-w-sm">
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={lowBandwidth}
            onChange={(e) => setLowBandwidth(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Low-bandwidth mode
            <span className="block text-xs text-[var(--text-muted)]">
              Trims chart data and export file sizes for a slow or metered connection.
            </span>
          </span>
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && <span className="text-sm text-[var(--status-good)]">Saved.</span>}
      </div>
    </form>
  );
}

function PasswordForm() {
  const t = useTranslations("settings");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put("/user/password", {
        current_password: currentPassword,
        password,
        password_confirmation: passwordConfirmation,
      });
      setCurrentPassword("");
      setPassword("");
      setPasswordConfirmation("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6">
      <h2 className="-mx-5 -mt-5 mb-4 border-b border-[var(--border)] px-5 py-3.5 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] sm:-mx-6 sm:-mt-6 sm:px-6">{t("password")}</h2>
      <div className="mt-4 flex flex-col gap-3 sm:max-w-sm">
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-[var(--text-secondary)]">Confirm new password</label>
          <input
            type="password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Updating..." : "Update password"}
        </button>
        {saved && <span className="text-sm text-[var(--status-good)]">Updated.</span>}
      </div>
    </form>
  );
}

function Settings() {
  const t = useTranslations("settings");
  return (
    <div className={`${PAGE_CONTAINER} max-w-2xl`}>
      <PageHeader icon="settings" title={t("title")} description="Your workspace, plan, profile and password." />

      <div className="mt-6 flex flex-col gap-6">
        <OrganizationSection />
        <ActivitySection />
        <PlanSection />
        <ProfileForm />
        <PasswordForm />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  );
}
