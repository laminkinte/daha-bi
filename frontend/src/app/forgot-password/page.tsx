"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthShell, AUTH_INPUT } from "@/components/AuthShell";
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
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a link to reset it.">
      <div>
        {sent ? (
          <p className="rounded-lg bg-[var(--status-good)]/10 p-3 text-sm text-[var(--status-good)]">
            If an account exists for that email, a reset link has been sent.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Email</label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={AUTH_INPUT}
              />
            </div>

            {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-60"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
          <Link href="/login" className="font-medium text-[var(--accent)] hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
