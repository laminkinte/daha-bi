"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";

function ResetPasswordForm() {
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
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--series-1)] text-sm font-bold text-white">
            D
          </div>
          <span className="font-semibold text-[var(--text-primary)]">Daha BI</span>
        </div>
        <h1 className="text-xl font-semibold">Set a new password</h1>

        {!token || !email ? (
          <p className="mt-4 text-sm text-[var(--status-critical)]">
            This reset link is missing or invalid. Request a new one from the{" "}
            <Link href="/forgot-password" className="text-[var(--series-1)]">
              forgot password
            </Link>{" "}
            page.
          </p>
        ) : done ? (
          <p className="mt-6 rounded-md bg-[var(--status-good)]/10 p-3 text-sm text-[var(--status-good)]">
            Password reset. Redirecting you to log in...
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm text-[var(--text-secondary)]">New password</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--text-secondary)]">Confirm new password</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
              />
            </div>

            {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-md bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
