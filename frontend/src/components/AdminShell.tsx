"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { ReactNode } from "react";

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </svg>
  );
}

const ADMIN_NAV = [
  { href: "/admin", label: "Subscriptions & Revenue" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/content", label: "Site Content" },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">Loading...</div>;
  }

  if (!user?.is_admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[var(--page-plane)] px-6 text-center">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Not authorized</h1>
        <p className="text-sm text-[var(--text-muted)]">This area is only available to daha-bi administrators.</p>
        <Link href="/dashboards" className="mt-2 text-sm text-[var(--series-1)]">
          Back to daha-bi
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-white">
              <ShieldIcon />
              <span className="font-semibold">Daha BI</span>
              <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-200">Admin</span>
            </div>
            <nav className="flex items-center gap-1">
              {ADMIN_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    pathname === item.href
                      ? "bg-zinc-800 font-medium text-white"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-400">{user.email}</span>
            <Link href="/dashboards" className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200">
              <ExitIcon />
              Exit to product
            </Link>
            <button onClick={() => logout()} className="text-zinc-400 hover:text-zinc-200">
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="bg-[var(--page-plane)]">{children}</main>
    </div>
  );
}
