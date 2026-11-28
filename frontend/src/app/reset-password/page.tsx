"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell, AUTH_INPUT } from "@/components/AuthShell";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useT } from "@/i18n/ui";

function ResetPasswordForm() {
  const tr = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/reset-password", {
        token,
        email,
        password,
        password_confirmation: passwordConfirmation,
      });
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Something went wrong."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title={tr("Set a new password")}>
      <div>
        {!token || !email ? (
          <p className="text-sm text-[var(--status-critical)]">
            {tr("This reset link is missing or invalid. Request a new one from the")}{" "}
            <Link href="/forgot-password" className="text-[var(--accent)]">
              {tr("forgot password")}
            </Link>{" "}
            page.
          </p>
        ) : done ? (
          <p className="rounded-lg bg-[var(--status-good)]/10 p-3 text-sm text-[var(--status-good)]">
            {tr("Password reset. Redirecting you to log in...")}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{tr("New password")}</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={AUTH_INPUT}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{tr("Confirm new password")}</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                className={AUTH_INPUT}
              />
            </div>

            {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-60"
            >
              {submitting ? tr("Resetting...") : tr("Reset password")}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
