"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useT, translate, uiLocaleTag } from "@/i18n/ui";

const I = {
  overview: <path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z" />,
  users: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  workspaces: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1" />,
  revenue: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  content: <path d="M4 4h16v16H4zM4 9h16M9 9v11" />,
  health: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  activity: <path d="M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4M3 4v5h5" />,
};

const NAV: { href: string; label: string; icon: keyof typeof I; group: string }[] = [
  { href: "/admin", label: "Overview", icon: "overview", group: "Platform" },
  { href: "/admin/users", label: "Users", icon: "users", group: "Platform" },
  { href: "/admin/workspaces", label: "Workspaces", icon: "workspaces", group: "Platform" },
  { href: "/admin/revenue", label: "Revenue", icon: "revenue", group: "Business" },
  { href: "/admin/content", label: "Site content", icon: "content", group: "Business" },
  { href: "/admin/health", label: "System health", icon: "health", group: "Operations" },
  { href: "/admin/activity", label: "Admin log", icon: "activity", group: "Operations" },
];

function Icon({ name }: { name: keyof typeof I }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {I[name]}
    </svg>
  );
}

/**
 * Super-admin console frame: a dark navigation rail (clearly "not the product") with grouped
 * sections, the signed-in admin, and a way back to the product. Collapses to a top bar on phones.
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const tr = useT();
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--page-plane)] text-sm text-[var(--text-muted)]">{tr("Loading…")}</div>;
  }

  if (!user?.is_admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[var(--page-plane)] px-6 text-center">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{tr("Not authorized")}</h1>
        <p className="text-sm text-[var(--text-muted)]">{tr("This area is only available to platform administrators.")}</p>
        <Link href="/dashboards" className="mt-2 text-sm font-medium text-[var(--accent)]">
          {tr("Back to Daha BI")}
        </Link>
      </div>
    );
  }

  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname?.startsWith(href));
  const groups = [...new Set(NAV.map((n) => n.group))];

  const rail = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" />
          </svg>
        </span>
        <span className="leading-tight">
          <span className="block text-[14px] font-semibold tracking-tight text-white">Daha BI</span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-400/90">{tr("Admin console")}</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {groups.map((g) => (
          <div key={g} className="mb-5">
            <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{tr(g)}</div>
            {NAV.filter((n) => n.group === g).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                  active(n.href) ? "bg-white/10 font-medium text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                }`}
              >
                <span className={active(n.href) ? "text-emerald-400" : ""}>
                  <Icon name={n.icon} />
                </span>
                {tr(n.label)}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-300">
            {user.name
              .split(/\s+/)
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium text-zinc-100">{user.name}</span>
            <span className="block truncate text-[11px] text-zinc-500">{user.email}</span>
          </span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1">
          <Link href="/dashboards" className="rounded-md px-2 py-1.5 text-center text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
            {tr("Open product")}
          </Link>
          <button onClick={() => logout()} className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
            {tr("Log out")}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--page-plane)]">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 bg-[#0d1416] lg:block">{rail}</aside>

      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-[#0d1416] px-4 py-3 lg:hidden">
        <span className="text-sm font-semibold text-white">
          Daha BI <span className="text-emerald-400">{tr("Admin")}</span>
        </span>
        <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-zinc-300" aria-label={tr("Open admin menu")}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-64 bg-[#0d1416]">{rail}</aside>
        </div>
      )}

      <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}

/** Consistent page header + width for every admin page. */
export function AdminPage({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h1>
          {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export const ADMIN_CARD = "rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-card)]";

export function StatusDot({ status }: { status: "ok" | "warn" | "fail" }) {
  const c = status === "ok" ? "bg-[var(--status-good)]" : status === "warn" ? "bg-[var(--status-warning)]" : "bg-[var(--status-critical)]";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} aria-label={status} />;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return translate("Just now");
  if (mins < 60) return translate("{mins} min ago", { mins: mins });
  const h = Math.round(mins / 60);
  if (h < 24) return translate("{h} h ago", { h: h });
  const d = Math.round(h / 24);
  return d < 60 ? translate("{d} d ago", { d: d }) : new Date(iso).toLocaleDateString(uiLocaleTag(), { day: "numeric", month: "short", year: "numeric" });
}
