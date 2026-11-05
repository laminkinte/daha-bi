"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import PasswordInput from "@/components/PasswordInput";

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function passwordStrength(password: string): { label: string; score: number; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: "Weak", score: 1, color: "var(--status-critical)" };
  if (score === 2) return { label: "Fair", score: 2, color: "var(--status-warning)" };
  if (score <= 4) return { label: "Good", score: 3, color: "var(--series-1)" };
  return { label: "Strong", score: 4, color: "var(--status-good)" };
}

function RegisterForm() {
  const t = useTranslations("auth.register");
  const tCommon = useTranslations("common");
  const { register } = useAuth();
  const searchParams = useSearchParams();
  const referralCode = searchParams.get("ref") ?? undefined;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = password ? passwordStrength(password) : null;
  const meetsMinLength = password.length >= 8;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const submittedName = String(formData.get("name") ?? name);
    const submittedEmail = String(formData.get("email") ?? email);
    const submittedPassword = String(formData.get("password") ?? password);
    try {
      await register(submittedName, submittedEmail, submittedPassword, referralCode);
    } catch (err) {
      if (err instanceof ApiError) {
        const firstFieldError = err.errors
          ? Object.values(err.errors)[0]?.[0]
          : undefined;
        setError(firstFieldError ?? err.message);
      } else {
        setError(tCommon("somethingWentWrong"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page-plane)]">
      <PublicHeader />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t("subtitle")}</p>
          {referralCode && (
            <p className="mt-3 rounded-md bg-[var(--status-good)]/10 px-3 py-2 text-sm text-[var(--status-good)]">
              {t("referredNotice")}
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm text-[var(--text-secondary)]">
                {t("name")}
              </label>
              <input
                name="name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
              />
            </div>
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
                className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-[var(--text-secondary)]">
                {t("password")}
              </label>
              <PasswordInput
                name="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {password && strength && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-colors"
                        style={{ background: i < strength.score ? strength.color : "var(--border)" }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: strength.color }}>
                    {strength.label} password
                  </p>
                </div>
              )}
              <p
                className={`mt-1.5 flex items-center gap-1 text-xs ${
                  meetsMinLength ? "text-[var(--status-good)]" : "text-[var(--text-muted)]"
                }`}
              >
                {meetsMinLength && <CheckIcon />}
                {t("minLength")}
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                required
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span>
                {t("agreePrefix")}{" "}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="text-[var(--series-1)] hover:underline">
                  {t("termsOfService")}
                </Link>{" "}
                {t("and")}{" "}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--series-1)] hover:underline">
                  {t("privacyPolicy")}
                </Link>
                .
              </span>
            </label>

            {error && (
              <p className="text-sm text-[var(--status-critical)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !agreed}
              className="mt-2 rounded-md bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {submitting ? t("submitting") : t("submit")}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
            {t("haveAccount")}{" "}
            <Link href="/login" className="text-[var(--series-1)]">
              {t("login")}
            </Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
