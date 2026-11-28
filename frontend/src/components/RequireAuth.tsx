"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/i18n/ui";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const tr = useT();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[var(--text-muted)]">
        {tr("Loading...")}
      </div>
    );
  }

  return <>{children}</>;
}
