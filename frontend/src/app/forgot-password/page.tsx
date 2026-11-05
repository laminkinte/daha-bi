"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/forgot-password", { email });
      setSent(true);
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
            D
          </div>
          <span className="font-semibold text-[var(--text-primary)]">Daha BI</span>
        </div>
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>

        {sent ? (
          <p className="mt-6 rounded-md bg-[var(--status-good)]/10 p-3 text-sm text-[var(--status-good)]">
            If an account exists for that email, a reset link has been sent.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm text-[var(--text-secondary)]">Email</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>

            {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          <Link href="/login" className="text-[var(--accent)]">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
