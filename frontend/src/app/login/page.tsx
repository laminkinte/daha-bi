"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import PasswordInput from "@/components/PasswordInput";
import { AuthShell, AUTH_INPUT } from "@/components/AuthShell";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const next = useSearchParams().get("next");
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
      await login(submittedEmail, submittedPassword, next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("somethingWentWrong"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title={t("title")} subtitle={t("demoNotice")}>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              {t("email")}
            </label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={AUTH_INPUT}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-[var(--text-secondary)]">{t("password")}</label>
              <Link href="/forgot-password" className="text-xs font-medium text-[var(--accent)] hover:underline">
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
            <p className="rounded-lg bg-[var(--status-critical)]/10 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            {submitting ? t("submitting") : t("submit")}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
          {t("noAccount")}{" "}
          <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-medium text-[var(--accent)] hover:underline">
            {t("register")}
          </Link>
        </p>
    </AuthShell>
  );
}
