"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--series-1)] text-xl font-bold text-white">
        D
      </div>
      <h1 className="mt-6 text-3xl font-semibold text-[var(--text-primary)]">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
        The page you&apos;re looking for doesn&apos;t exist, or may have moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-[var(--series-1)] px-5 py-2.5 text-sm font-medium text-white"
      >
        Back to daha-bi
      </Link>
    </div>
  );
}
