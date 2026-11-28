"use client";

import Link from "next/link";
import { useT } from "@/i18n/ui";

export default function NotFound() {
  const tr = useT();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent)] text-xl font-bold text-white">
        {tr("D")}
      </div>
      <h1 className="mt-6 text-3xl font-semibold text-[var(--text-primary)]">{tr("Page not found")}</h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
        {tr("The page you're looking for doesn't exist, or may have moved.")}
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white"
      >
        {tr("Back to daha-bi")}
      </Link>
    </div>
  );
}
