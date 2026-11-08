import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";

const POINTS = [
  { title: "Connect in minutes", body: "CSV, Excel, MySQL, PostgreSQL, SQL Server or any REST API." },
  { title: "Ask in plain language", body: "Daha AI answers questions and builds charts for you." },
  { title: "Built for your phone", body: "Every dashboard works on mobile, in any currency." },
];

/**
 * Shared frame for login / register / password screens: brand story panel on desktop,
 * just the form on phones. Children are the form card's contents.
 */
export function AuthShell({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--page-plane)]">
      <aside
        className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden p-10 text-white lg:flex"
        style={{ background: "linear-gradient(150deg, #0a5c47 0%, #0b7a5e 45%, #12a37c 100%)" }}
      >
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-[#f0b429] opacity-20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-16 top-1/3 h-72 w-72 rounded-full bg-white opacity-10 blur-3xl" />

        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/15 ring-1 ring-white/25">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 19V11M12 19V5M19 19v-5" />
            </svg>
          </span>
          <span className="text-lg font-semibold tracking-tight">Daha BI</span>
        </Link>

        <div className="relative">
          <h2 className="max-w-sm text-[30px] font-semibold leading-tight tracking-tight">
            Business intelligence that fits in your pocket.
          </h2>
          <ul className="mt-8 flex flex-col gap-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </span>
                <span>
                  <span className="block font-medium">{p.title}</span>
                  <span className="block text-sm text-white/75">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} DAHA SMART TECH</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Daha BI</span>
          </Link>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm text-[var(--text-secondary)]">{subtitle}</div>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** Consistent field styling for auth forms. */
export const AUTH_INPUT =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none";
