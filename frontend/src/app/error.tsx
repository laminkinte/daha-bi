"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--status-critical)] text-xl font-bold text-white">
        !
      </div>
      <h1 className="mt-6 text-3xl font-semibold text-[var(--text-primary)]">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
        This page hit an unexpected error. You can try again, or head back to your dashboards.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={retry}
          className="rounded-md bg-[var(--series-1)] px-5 py-2.5 text-sm font-medium text-white"
        >
          Try again
        </button>
        <Link
          href="/dashboards"
          className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Back to dashboards
        </Link>
      </div>
    </div>
  );
}
