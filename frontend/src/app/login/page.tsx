"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import PasswordInput from "@/components/PasswordInput";

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const tCommon = useTranslations("common");
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    // Read directly from the form instead of trusting React state alone —
    // some browsers' autofill sets the DOM value without firing onChange,
    // which would otherwise silently submit stale/empty state.
    const formData = new FormData(e.currentTarget);
    const submittedEmail = String(formData.get("email") ?? email);
    const submittedPassword = String(formData.get("password") ?? password);
    try {
      await login(submittedEmail, submittedPassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("somethingWentWrong"));
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
          <span className="font-semibold text-[var(--text-primary)]">{t("brand")}</span>
        </div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {t("demoNotice")}
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-[var(--text-secondary)]">
              {t("email")}
            </label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-sm text-[var(--text-secondary)]">{t("password")}</label>
              <Link href="/forgot-password" className="text-xs text-[var(--accent)]">
                {t("forgotPassword")}
              </Link>
            </div>
            <PasswordInput
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--status-critical)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          {t("noAccount")}{" "}
          <Link href="/register" className="text-[var(--accent)]">
            {t("register")}
          </Link>
        </p>
      </div>
    </div>
  );
}
