"use client";

import { use, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell, AUTH_INPUT } from "@/components/AuthShell";
import PasswordInput from "@/components/PasswordInput";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, setToken, type User } from "@/lib/api";

type Preview = {
  email: string;
  organization: string;
  dashboard: string | null;
  dashboard_id: number | null;
  role: string;
  invited_by: string | null;
  status: "pending" | "accepted" | "expired";
  expires_at: string;
  has_account: boolean;
};

type AcceptResult = { organization_id: number; dashboard_id: number | null; user: User };

const ROLE_WORDS: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  analyst: "an analyst",
  viewer: "a viewer",
  editor: "an editor",
};

const BTN = "w-full rounded-lg bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-white shadow-sm disabled:opacity-60";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { user, loading, logout, updateUser } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Preview>(`/public/invitations/${token}`)
      .then(setPreview)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load this invitation."));
  }, [token]);

  function goTo(result: { dashboard_id: number | null }) {
    router.push(result.dashboard_id ? `/dashboards/${result.dashboard_id}` : "/dashboards");
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const accept = () =>
    run(async () => {
      const res = await api.post<AcceptResult>(`/invitations/${token}/accept`);
      updateUser(res.user);
      goTo(res);
    });

  const signIn = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api.post<{ user: User; token: string }>("/login", { email: preview!.email, password });
      setToken(res.token);
      updateUser(res.user);
      const accepted = await api.post<AcceptResult>(`/invitations/${token}/accept`);
      updateUser(accepted.user);
      goTo(accepted);
    });
  };

  const signUp = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api.post<{ user: User; token: string; invite_error?: string }>("/register", {
        name,
        email: preview!.email,
        password,
        invite_token: token,
      });
      setToken(res.token);
      updateUser(res.user);
      if (res.invite_error) {
        setError(`Your account was created, but: ${res.invite_error}`);
        setBusy(false);
        return;
      }
      goTo({ dashboard_id: preview!.dashboard_id });
    });
  };

  if (loadError) {
    return (
      <AuthShell title="Invitation not found" subtitle={loadError}>
        <Link href="/login" className="text-sm font-medium text-[var(--accent)] hover:underline">
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  if (!preview || loading) {
    return (
      <AuthShell title="Loading invitation…">
        <div className="h-40 animate-pulse rounded-xl bg-[var(--surface-2)]" />
      </AuthShell>
    );
  }

  const target = preview.dashboard ? `the “${preview.dashboard}” dashboard` : preview.organization;
  const summary = (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Invitation</p>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">{preview.invited_by ?? "Someone"}</span> invited{" "}
        <span className="font-medium text-[var(--text-primary)]">{preview.email}</span> to join {target}
        {preview.dashboard && <> (shared by {preview.organization})</>} as {ROLE_WORDS[preview.role] ?? preview.role}.
      </p>
    </div>
  );

  if (preview.status !== "pending") {
    return (
      <AuthShell
        title={preview.status === "accepted" ? "Invitation already used" : "Invitation expired"}
        subtitle={
          preview.status === "accepted"
            ? "This invitation has already been accepted. Sign in to continue."
            : `Ask ${preview.invited_by ?? "the person who invited you"} to send a new one.`
        }
      >
        <Link href={user ? "/dashboards" : "/login"} className={`${BTN} block text-center`}>
          {user ? "Go to your dashboards" : "Sign in"}
        </Link>
      </AuthShell>
    );
  }

  const errorBox = error && (
    <p className="rounded-lg bg-[var(--status-critical)]/10 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</p>
  );

  if (user) {
    const matches = user.email.toLowerCase() === preview.email.toLowerCase();
    return (
      <AuthShell title={`Join ${target}`}>
        {summary}
        {matches ? (
          <div className="flex flex-col gap-3">
            {errorBox}
            <button onClick={accept} disabled={busy} className={BTN}>
              {busy ? "Joining…" : "Accept invitation"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm text-[var(--text-secondary)]">
            <p>
              You&apos;re signed in as <span className="font-medium text-[var(--text-primary)]">{user.email}</span>. This invitation only
              works for {preview.email}.
            </p>
            <button onClick={() => void logout()} className={BTN}>
              Sign out and switch account
            </button>
          </div>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Join ${target}`} subtitle={preview.has_account ? "Sign in to accept." : "Create your free account to accept."}>
      {summary}
      <form onSubmit={preview.has_account ? signIn : signUp} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Email</label>
          <input value={preview.email} readOnly className={`${AUTH_INPUT} cursor-not-allowed opacity-75`} />
        </div>
        {!preview.has_account && (
          <div>
            <label htmlFor="invite-name" className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              Your name
            </label>
            <input id="invite-name" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={AUTH_INPUT} />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
            {preview.has_account ? "Password" : "Choose a password"}
          </label>
          <PasswordInput
            name="password"
            required
            minLength={preview.has_account ? undefined : 8}
            autoComplete={preview.has_account ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {errorBox}
        <button type="submit" disabled={busy} className={BTN}>
          {busy ? "Please wait…" : preview.has_account ? "Sign in and accept" : "Create account and join"}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        Expires {new Date(preview.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
      </p>
    </AuthShell>
  );
}
