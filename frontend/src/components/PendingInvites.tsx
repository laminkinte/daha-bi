"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type InviteSent, type PendingInvitation } from "@/lib/api";

function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt("Copy this link:", text);
        }
      }}
      className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

/**
 * A link that opens the user's own email app (Gmail, Outlook, Mail…) with the message filled in,
 * so they can send it from their own address instead of (or as well as) Daha BI's email.
 */
export function mailtoHref(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const SHARE_BTN =
  "shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

/**
 * Shown right after inviting someone without an account: confirms the email and hands over
 * the link, so it can also be sent from the user's own email, WhatsApp/Slack (or when email
 * isn't configured).
 */
export function InviteSentNotice({ invite, onClose }: { invite: InviteSent; onClose: () => void }) {
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`You're invited to Daha BI: ${invite.invite_url}`)}`;
  const ownEmail = mailtoHref(
    invite.email,
    "You're invited to Daha BI",
    `Hi,\n\nI'd like you to join me on Daha BI. Accept the invitation here (the link works for 7 days):\n${invite.invite_url}\n\nSee you there!`
  );
  return (
    <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3.5 text-sm" role="status">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[var(--text-primary)]">
          {invite.email_sent ? (
            <>
              Invitation emailed to <span className="font-semibold">{invite.email}</span>.
            </>
          ) : (
            <>
              Invitation created for <span className="font-semibold">{invite.email}</span>, but the email couldn&apos;t be sent. Share
              the link below instead.
            </>
          )}{" "}
          <span className="text-[var(--text-secondary)]">They&apos;ll join as {invite.role} once they sign up. The link works for 7 days.</span>
        </p>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          ✕
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <code className="min-w-0 basis-full truncate rounded-md bg-[var(--surface-1)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]">
          {invite.invite_url}
        </code>
        <a href={ownEmail} className={SHARE_BTN} title="Opens your email app with the invitation written for you">
          Send from my email
        </a>
        <a href={whatsapp} target="_blank" rel="noreferrer" className={SHARE_BTN}>
          Share on WhatsApp
        </a>
        <CopyButton text={invite.invite_url} />
      </div>
    </div>
  );
}

/** Pending invitations with resend (new link) and revoke. */
export function PendingInvites({ listUrl, refreshKey }: { listUrl: string; refreshKey: number }) {
  const [invites, setInvites] = useState<PendingInvitation[] | null>(null);
  const [fresh, setFresh] = useState<InviteSent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .get<PendingInvitation[]>(listUrl)
      .then((rows) => alive && setInvites(rows))
      .catch(() => alive && setInvites([]));
    return () => {
      alive = false;
    };
  }, [listUrl, refreshKey, reload]);

  async function resend(inv: PendingInvitation) {
    setError(null);
    try {
      const res = await api.post<InviteSent>(`/invitations/${inv.id}/resend`);
      setFresh({ ...res, pending: true, email: inv.email, role: inv.role });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't resend the invitation.");
    }
  }

  async function revoke(inv: PendingInvitation) {
    if (!confirm(`Revoke the invitation for ${inv.email}? The link will stop working.`)) return;
    setError(null);
    try {
      await api.del(`/invitations/${inv.id}`);
      setInvites((prev) => (prev ?? []).filter((i) => i.id !== inv.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't revoke the invitation.");
    }
  }

  if (!invites?.length && !fresh) return null;

  return (
    <div className="mt-4">
      {fresh && (
        <div className="mb-3">
          <InviteSentNotice invite={fresh} onClose={() => setFresh(null)} />
        </div>
      )}
      {!!invites?.length && (
        <>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Pending invitations ({invites.length})
          </p>
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--text-primary)]">{inv.email}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    <span className="capitalize">{inv.role}</span>
                    {inv.invited_by && <> · invited by {inv.invited_by}</>} ·{" "}
                    {inv.expired ? (
                      <span className="text-[var(--status-warning)]">expired</span>
                    ) : (
                      <>expires {new Date(inv.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</>
                    )}
                  </span>
                </span>
                <button type="button" onClick={() => resend(inv)} className="text-xs font-medium text-[var(--accent)] hover:underline">
                  {inv.expired ? "Send new link" : "Resend"}
                </button>
                <button type="button" onClick={() => revoke(inv)} className="text-xs text-[var(--status-critical)] hover:opacity-80">
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="mt-2 text-xs text-[var(--status-critical)]">{error}</p>}
    </div>
  );
}
