"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { api, type Alert, type Organization } from "@/lib/api";
import AdminShell from "./AdminShell";
import LanguageSwitcher from "./LanguageSwitcher";
import { useEffect, useState, type ReactNode } from "react";

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
      <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </svg>
  );
}

function NotebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 3v18M9 8h7M9 12h7M9 16h4" />
    </svg>
  );
}

function FlowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="5" cy="18" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M7.2 7.2 15.8 10.8M7.2 16.8 15.8 13.2" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="4" width="20" height="13" rx="1.5" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/dashboards", labelKey: "dashboards", icon: DashboardIcon },
  { href: "/chat", labelKey: "aiChat", icon: SparkleIcon },
  { href: "/datasets", labelKey: "datasets", icon: LayersIcon },
  { href: "/data-sources", labelKey: "dataSources", icon: DatabaseIcon },
  { href: "/data-models", labelKey: "dataModels", icon: FlowIcon },
  { href: "/notebook", labelKey: "notebook", icon: NotebookIcon },
  { href: "/alerts", labelKey: "alerts", icon: BellIcon },
  { href: "/referrals", labelKey: "referrals", icon: GiftIcon },
] as const;

type PlanNotice = { text: string; tone: "warning" | "critical" };

/**
 * Surfaces trial/payment urgency right in the sidebar — previously this only lived inside
 * Settings, so a past-due or about-to-expire account had no passive visibility.
 */
function planNotice(user: { plan_status?: string; trial_ends_at?: string | null }): PlanNotice | null {
  if (user.plan_status === "past_due") {
    return { text: "Payment past due", tone: "critical" };
  }

  if (user.plan_status === "canceled") {
    return { text: "Subscription canceled", tone: "critical" };
  }

  if (user.plan_status === "trialing" && user.trial_ends_at) {
    const daysLeft = Math.ceil(
      (new Date(user.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysLeft <= 0) return { text: "Trial expired", tone: "critical" };
    if (daysLeft <= 3) return { text: `Trial ends in ${daysLeft}d`, tone: "warning" };
    return { text: `Trial: ${daysLeft}d left`, tone: "warning" };
  }

  return null;
}

const THEME_OPTIONS = [
  { value: "light" as const, icon: SunIcon, label: "Light" },
  { value: "system" as const, icon: SystemIcon, label: "System" },
  { value: "dark" as const, icon: MoonIcon, label: "Dark" },
];

export default function Sidebar({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [breachedCount, setBreachedCount] = useState(0);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [switchingOrg, setSwitchingOrg] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        setCollapsed(window.localStorage.getItem("daha_bi_sidebar_collapsed") === "1");
      } catch {
        // ignore — sidebar just stays expanded
      }
    });
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("daha_bi_sidebar_collapsed", next ? "1" : "0");
      } catch {
        // ignore — collapse state just won't persist across reloads
      }
      return next;
    });
  }

  useEffect(() => {
    if (!user) return;
    function refresh() {
      api
        .getRetrying<Alert[]>("/alerts")
        .then((alerts) => setBreachedCount(alerts.filter((a) => a.last_status === "breached").length))
        .catch(() => {});
    }
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api.getRetrying<Organization[]>("/organizations").then(setOrganizations).catch(() => {});
  }, [user]);

  async function switchOrganization(organizationId: number) {
    setSwitchingOrg(true);
    try {
      await api.put("/user/organization", { organization_id: organizationId });
      // Every org-scoped list (dashboards, data sources, ...) needs a fresh fetch under the new
      // org — simplest correct approach is a full reload rather than re-plumbing every page.
      window.location.reload();
    } catch {
      setSwitchingOrg(false);
    }
  }

  if (!user) return <>{children}</>;

  const notice = user.current_organization ? planNotice(user.current_organization) : null;

  if (pathname?.startsWith("/admin")) {
    return <AdminShell>{children}</AdminShell>;
  }

  const navContent = (
    <>
      <div className={`flex items-center px-5 py-5 ${collapsed ? "md:justify-center md:px-3" : "justify-between"}`}>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--series-1)] text-sm font-bold text-white">
            D
          </div>
          <span className={`font-semibold text-[var(--text-primary)] ${collapsed ? "md:hidden" : ""}`}>Daha BI</span>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="text-[var(--text-muted)] md:hidden"
          aria-label="Close menu"
        >
          <CloseIcon />
        </button>
      </div>

      <button
        onClick={toggleCollapsed}
        className="mx-3 mb-2 hidden items-center justify-center gap-2 rounded-md border border-[var(--border)] py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] md:flex"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <CollapseIcon collapsed={collapsed} />
        {!collapsed && "Collapse"}
      </button>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? t(labelKey) : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                collapsed ? "md:relative md:justify-center md:px-2" : ""
              } ${
                active
                  ? "bg-[var(--series-1)]/10 font-medium text-[var(--series-1)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--page-plane)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon />
              <span className={collapsed ? "md:hidden" : ""}>{t(labelKey)}</span>
              {href === "/alerts" && breachedCount > 0 && (
                <span
                  className={`rounded-full bg-[var(--status-critical)] px-1.5 py-0.5 text-[10px] font-semibold text-white ${
                    collapsed ? "md:absolute md:right-1 md:top-1" : "ml-auto"
                  }`}
                >
                  {breachedCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={`border-t border-[var(--border)] px-3 py-3 ${collapsed ? "md:px-2" : ""}`}>
        {organizations.length > 1 && (
          <select
            value={user.current_organization_id ?? ""}
            onChange={(e) => switchOrganization(Number(e.target.value))}
            disabled={switchingOrg}
            className={`mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1.5 text-xs text-[var(--text-secondary)] disabled:opacity-60 ${
              collapsed ? "md:hidden" : ""
            }`}
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        )}
        <div
          className={`mb-2 flex items-center gap-1 rounded-md bg-[var(--page-plane)] p-1 ${collapsed ? "md:hidden" : ""}`}
        >
          {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              title={label}
              aria-label={label}
              className={`flex flex-1 items-center justify-center rounded py-1.5 transition-colors ${
                theme === value
                  ? "bg-[var(--surface-1)] text-[var(--series-1)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon />
            </button>
          ))}
        </div>
        {notice && (
          <Link
            href="/settings"
            title={collapsed ? notice.text : undefined}
            className={`mb-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${
              collapsed ? "md:justify-center md:px-2" : ""
            } ${
              notice.tone === "critical"
                ? "bg-[var(--status-critical)]/10 text-[var(--status-critical)]"
                : "bg-[var(--status-warning)]/10 text-[var(--status-warning)]"
            }`}
          >
            <WarningIcon />
            <span className={collapsed ? "md:hidden" : ""}>{notice.text}</span>
          </Link>
        )}
        <Link
          href="/settings"
          title={collapsed ? user.email : undefined}
          className={`mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            collapsed ? "md:justify-center md:px-2" : ""
          } ${
            pathname === "/settings"
              ? "bg-[var(--series-1)]/10 font-medium text-[var(--series-1)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--page-plane)] hover:text-[var(--text-primary)]"
          }`}
        >
          <SettingsIcon />
          <span className={`truncate ${collapsed ? "md:hidden" : ""}`}>{user.email}</span>
        </Link>
        {user.is_admin && (
          <Link
            href="/admin"
            title={collapsed ? t("admin") : undefined}
            className={`mb-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--page-plane)] hover:text-[var(--text-primary)] ${
              collapsed ? "md:justify-center md:px-2" : ""
            }`}
          >
            <ShieldIcon />
            <span className={collapsed ? "md:hidden" : ""}>{t("admin")}</span>
          </Link>
        )}
        <div className={collapsed ? "md:hidden" : ""}>
          <LanguageSwitcher />
        </div>
        <button
          onClick={() => logout()}
          title={collapsed ? t("logOut") : undefined}
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--page-plane)] hover:text-[var(--status-critical)] ${
            collapsed ? "md:justify-center md:px-2" : ""
          }`}
        >
          <LogoutIcon />
          <span className={collapsed ? "md:hidden" : ""}>{t("logOut")}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--series-1)] text-xs font-bold text-white">
            D
          </div>
          <span className="font-semibold text-[var(--text-primary)]">Daha BI</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="text-[var(--text-secondary)]"
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-x-hidden border-r border-[var(--border)] bg-[var(--surface-1)] transition-[transform,width] md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 ${
          collapsed ? "md:w-16" : "md:w-56"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {navContent}
      </aside>

      <div className="min-w-0 flex-1 pt-14 md:pt-0">{children}</div>
    </div>
  );
}
