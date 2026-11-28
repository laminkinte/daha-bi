"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { api, type AppNotification } from "@/lib/api";
import { useT, translate } from "@/i18n/ui";

/** Fired when a notification is opened: { dashboardId, commentId }. DashboardView listens. */
export const OPEN_COMMENT_EVENT = "daha:open-comment";

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return translate("just now");
  if (mins < 60) return translate("{n}m", { n: mins });
  const h = Math.round(mins / 60);
  return h < 24 ? translate("{n}h", { n: h }) : translate("{n}d", { n: Math.round(h / 24) });
}

/**
 * In-app notifications (mentions, replies). Polls once a minute and whenever the tab regains
 * focus. The list is position:fixed so the sidebar's overflow clipping can't cut it off.
 */
export default function NotificationBell({ compact = false }: { compact?: boolean }) {
  const tr = useT();
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[] | null>(null);

  const load = useCallback(() => {
    api
      .get<{ unread: number; items: AppNotification[] }>("/notifications")
      .then((res) => {
        setUnread(res.unread);
        setItems(res.items);
      })
      .catch(() => setItems((prev) => prev ?? []));
  }, []);

  useEffect(() => {
    // The sidebar and the phone top bar each render a bell (CSS hides one) — only the visible
    // one polls, so there's one request a minute, not two.
    const poll = () => {
      if (btnRef.current?.offsetParent !== null) load();
    };
    poll();
    const timer = setInterval(poll, 60_000);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = Math.min(360, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 8, left });
    }
    setOpen((o) => !o);
    if (!open) load();
  }

  async function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => (prev ?? []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      api.post(`/notifications/${n.id}/read`).catch(() => {});
    }
    // Already on that dashboard? It listens for this and jumps to the thread without a reload.
    window.dispatchEvent(new CustomEvent(OPEN_COMMENT_EVENT, { detail: { dashboardId: n.data.dashboard_id, commentId: n.data.comment_id } }));
    router.push(`/dashboards/${n.data.dashboard_id}?comment=${n.data.comment_id}`);
  }

  async function readAll() {
    setUnread(0);
    setItems((prev) => (prev ?? []).map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    api.post("/notifications/read-all").catch(() => {});
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`relative flex items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] ${
          compact ? "h-8 w-8" : "h-8 w-8"
        } ${open ? "bg-[var(--surface-2)] text-[var(--text-primary)]" : ""}`}
        aria-label={unread ? tr("Notifications, {unread} unread", { unread: unread }) : tr("Notifications")}
        title={tr("Notifications")}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-critical)] px-1 text-[9.5px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Rendered into <body>: the sidebar clips (and, with its transform, re-anchors) anything
          positioned inside it, which cut the panel off on desktop. */}
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[60] flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-pop)]"
          style={{ top: pos.top, left: pos.left, width: Math.min(360, typeof window !== "undefined" ? window.innerWidth - 16 : 360), animation: "popIn 120ms ease-out" }}
          role="dialog"
          aria-label={tr("Notifications")}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">{tr("Notifications")}</span>
            {unread > 0 && (
              <button onClick={readAll} className="text-xs font-medium text-[var(--accent)] hover:underline">
                {tr("Mark all read")}
              </button>
            )}
          </div>
          <div className="overflow-y-auto">
            {items === null && <div className="m-3 h-14 animate-pulse rounded-lg bg-[var(--surface-2)]" />}
            {items?.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                {tr("You're all caught up. Mentions and replies to your comments show up here.")}
              </p>
            )}
            {items?.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`flex w-full gap-3 border-b border-[var(--border)] px-4 py-3 text-start last:border-b-0 hover:bg-[var(--surface-2)] ${
                  n.read_at ? "" : "bg-[var(--accent-soft)]/50"
                }`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-[var(--accent)]"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug text-[var(--text-primary)]">{tr(n.data.title)}</span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">&ldquo;{n.data.excerpt}&rdquo;</span>
                </span>
                <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{timeAgo(n.created_at)}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
