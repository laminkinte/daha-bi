"use client";

import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { useT } from "@/i18n/ui";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Log in", href: "/login" },
      { label: "Get started", href: "/register" },
    ],
  },
  {
    title: "Company",
    links: [{ label: "About", href: "/about" }],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
    ],
  },
];

export default function Footer() {
  const tr = useT();
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface-1)]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-5">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark />
              <span className="font-semibold text-[var(--text-primary)]">Daha BI</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-[var(--text-muted)]">
              {tr("Mobile-first business intelligence, built for the way growing businesses actually work — anywhere in the world.")}
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {tr(col.title)}
              </h3>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                      {tr(link.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--border)] pt-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>&copy; {new Date().getFullYear()} {tr("Daha BI. All rights reserved.")}</span>
          <span>{tr("Built for growing businesses everywhere, from Lagos to London to Lima.")}</span>
        </div>
      </div>
    </footer>
  );
}
