"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  api,
  ApiError,
  type Chart,
  type CommentReply,
  type CommentSpace,
  type CommentsResponse,
  type CommentThread,
  type Mentionable,
} from "@/lib/api";
import MentionInput, { initials, mentionedIds } from "./MentionInput";
import { useT, translate, uiLocaleTag } from "@/i18n/ui";

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return translate("just now");
  if (mins < 60) return translate("{mins}m ago", { mins: mins });
  const h = Math.round(mins / 60);
  if (h < 24) return translate("{h}h ago", { h: h });
  const d = Math.round(h / 24);
  return d < 30 ? translate("{d}d ago", { d: d }) : new Date(iso).toLocaleDateString(uiLocaleTag(), { day: "numeric", month: "short" });
}

/** Threads for one dashboard, loaded once and shared by the panel and the chart badges. */
export function useComments(dashboardId: number) {
  const [threads, setThreads] = useState<CommentThread[] | null>(null);
  const [spaces, setSpaces] = useState<CommentSpace[]>([]);
  const [mySpace, setMySpace] = useState<CommentSpace | null>(null);

  const reload = useCallback(() => {
    api
      .get<CommentsResponse>(`/dashboards/${dashboardId}/comments`)
      .then((res) => {
        setThreads(res.threads);
        setSpaces(res.spaces);
        setMySpace(res.my_space);
      })
      .catch(() => setThreads((prev) => prev ?? []));
  }, [dashboardId]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Open (unresolved) thread counts per chart id; key 0 = whole dashboard. */
  const openByChart = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of threads ?? []) if (!t.resolved_at) m.set(t.chart_id ?? 0, (m.get(t.chart_id ?? 0) ?? 0) + 1);
    return m;
  }, [threads]);

  const openTotal = useMemo(() => (threads ?? []).filter((t) => !t.resolved_at).length, [threads]);

  return { threads, setThreads, spaces, mySpace, reload, openByChart, openTotal };
}

function Body({ text, people }: { text: string; people: Mentionable[] }) {
  const names = people.map((p) => p.name).sort((a, b) => b.length - a.length);
  if (!names.length) return <p className="whitespace-pre-wrap break-words">{text}</p>;
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "g");
  const parts = text.split(re);
  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-[var(--accent-soft)] px-0.5 font-medium text-[var(--accent)]">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </p>
  );
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

function Message({
  c,
  people,
  onDelete,
  extra,
}: {
  c: CommentReply;
  people: Mentionable[];
  onDelete: (id: number) => void;
  extra?: ReactNode;
}) {
  const tr = useT();
  const name = c.user?.name ?? tr("Deleted user");
  return (
    <div className="flex gap-2.5">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{name}</span>
          <span className="shrink-0 text-[11px] text-[var(--text-muted)]" title={new Date(c.created_at).toLocaleString(uiLocaleTag())}>
            {timeAgo(c.created_at)}
            {c.edited_at && tr(" · edited")}
          </span>
          {c.can_delete && (
            <button
              onClick={() => onDelete(c.id)}
              className="ms-auto shrink-0 text-[11px] text-[var(--text-muted)] hover:text-[var(--status-critical)]"
              aria-label={tr("Delete comment")}
            >
              {tr("Delete")}
            </button>
          )}
        </div>
        <div className="mt-0.5 text-sm leading-relaxed text-[var(--text-secondary)]">
          <Body text={c.body} people={people} />
        </div>
        {extra}
      </div>
    </div>
  );
}

export default function CommentsPanel({
  dashboardId,
  open,
  onClose,
  charts,
  chartFilter,
  onChartFilter,
  focusId,
  state,
  sharedBy,
}: {
  dashboardId: number;
  open: boolean;
  onClose: () => void;
  charts: Chart[];
  /** Show only threads on this chart (and new comments attach to it); null = all. */
  chartFilter: number | null;
  onChartFilter: (chartId: number | null) => void;
  /** A thread to scroll to and highlight (from a notification link). */
  focusId?: number | null;
  state: ReturnType<typeof useComments>;
  /** The owning company's name, when the viewer is a partner it shared with. */
  sharedBy?: string | null;
}) {
  const tr = useT();
  const { threads, setThreads, spaces, mySpace } = state;
  // Owner side: which conversation a new thread goes to (null = internal, team only).
  const [space, setSpace] = useState<number | null>(null);
  const [people, setPeople] = useState<Mentionable[]>([]);
  const [peopleFor, setPeopleFor] = useState<string>("");
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const chartTitle = (id: number | null) => (id ? (charts.find((c) => c.id === id)?.title ?? "A chart") : null);

  // Mention suggestions depend on the conversation: only people who can read it are offered.
  const replySpace = replyTo !== null ? ((threads ?? []).find((t) => t.id === replyTo)?.space?.id ?? null) : space;
  const peopleKey = `${dashboardId}:${replySpace ?? ""}`;
  useEffect(() => {
    if (!open || peopleFor === peopleKey) return;
    let alive = true;
    api
      .get<Mentionable[]>(`/dashboards/${dashboardId}/mentionable${replySpace ? `?space=${replySpace}` : ""}`)
      .then((p) => {
        if (!alive) return;
        setPeople(p);
        setPeopleFor(peopleKey);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, dashboardId, replySpace, peopleKey, peopleFor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Deep link from a notification: switch to the right tab and scroll the thread into view.
  useEffect(() => {
    if (!open || !focusId || !threads) return;
    const t = threads.find((x) => x.id === focusId || x.replies.some((r) => r.id === focusId));
    if (!t) return;
    const timer = setTimeout(() => {
      if (t.resolved_at) setTab("resolved");
      document.getElementById(`thread-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(timer);
  }, [open, focusId, threads]);

  const visible = (threads ?? []).filter(
    (t) => (tab === "open" ? !t.resolved_at : !!t.resolved_at) && (chartFilter === null || t.chart_id === chartFilter)
  );
  const resolvedCount = (threads ?? []).filter((t) => !!t.resolved_at && (chartFilter === null || t.chart_id === chartFilter)).length;
  const openCount = (threads ?? []).filter((t) => !t.resolved_at && (chartFilter === null || t.chart_id === chartFilter)).length;

  function upsert(thread: CommentThread) {
    setThreads((prev) => {
      const list = prev ?? [];
      return list.some((t) => t.id === thread.id) ? list.map((t) => (t.id === thread.id ? thread : t)) : [thread, ...list];
    });
  }

  async function post(body: string, parentId?: number) {
    setBusy(true);
    setError(null);
    try {
      const thread = await api.post<CommentThread>(`/dashboards/${dashboardId}/comments`, {
        body,
        chart_id: parentId ? undefined : chartFilter ?? undefined,
        parent_id: parentId,
        partner_organization_id: parentId ? undefined : space ?? undefined,
        mentions: mentionedIds(body, people),
      });
      upsert(thread);
      if (parentId) {
        setReplyDraft("");
        setReplyTo(null);
      } else {
        setDraft("");
        setTab("open");
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Couldn't post your comment."));
    } finally {
      setBusy(false);
    }
  }

  async function setResolved(t: CommentThread, resolved: boolean) {
    setError(null);
    try {
      upsert(await api.patch<CommentThread>(`/comments/${t.id}`, { resolved }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Couldn't update the thread."));
    }
  }

  async function remove(id: number) {
    if (!confirm(tr("Delete this comment?"))) return;
    setError(null);
    try {
      await api.del(`/comments/${id}`);
      setThreads((prev) =>
        (prev ?? [])
          .filter((t) => t.id !== id)
          .map((t) => ({ ...t, replies: t.replies.filter((r) => r.id !== id) }))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Couldn't delete the comment."));
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 sm:hidden" onClick={onClose} aria-hidden />
      <aside
        className="fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-pop)] sm:w-[400px]"
        style={{ animation: "fadeIn 140ms ease-out" }}
        aria-label={tr("Comments")}
      >
        <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">{tr("Comments")}</h2>
          <div className="ms-2 inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-xs">
            {(["open", "resolved"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-md px-2.5 py-1 font-medium capitalize ${tab === k ? "bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-secondary)]"}`}
              >
                {k} {k === "open" ? openCount : resolvedCount}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="ms-auto flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
            aria-label={tr("Close comments")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {chartFilter !== null && (
          <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-xs text-[var(--text-secondary)]">
            <span className="min-w-0 truncate">
              {tr("On chart")} <span className="font-semibold text-[var(--text-primary)]">{chartTitle(chartFilter)}</span>
            </span>
            <button onClick={() => onChartFilter(null)} className="ms-auto shrink-0 font-medium text-[var(--accent)] hover:underline">
              {tr("Show all")}
            </button>
          </div>
        )}

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
          {threads === null && (
            <div className="flex flex-col gap-3">
              <div className="h-16 animate-pulse rounded-lg bg-[var(--surface-2)]" />
              <div className="h-16 animate-pulse rounded-lg bg-[var(--surface-2)]" />
            </div>
          )}
          {threads !== null && visible.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {tab === "open" ? tr("No open comments") : tr("Nothing resolved yet")}
              </p>
              <p className="mx-auto mt-1 max-w-[16rem] text-xs text-[var(--text-muted)]">
                {tab === "open"
                  ? tr("Ask a question or flag a number — type @ to mention a teammate or partner and they'll get notified.")
                  : tr("Resolved threads end up here.")}
              </p>
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {visible.map((t) => (
              <li
                key={t.id}
                id={`thread-${t.id}`}
                className={`rounded-xl border p-3 ${
                  focusId && (t.id === focusId || t.replies.some((r) => r.id === focusId))
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/20"
                    : "border-[var(--border)]"
                } ${t.resolved_at ? "bg-[var(--surface-2)]/60" : "bg-[var(--surface-1)]"}`}
              >
                {t.chart_id && chartFilter === null && (
                  <button
                    onClick={() => onChartFilter(t.chart_id)}
                    className="mb-2 inline-flex max-w-full items-center gap-1 truncate rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--accent)]"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M5 19V11M12 19V5M19 19v-5" />
                    </svg>
                    <span className="truncate">{chartTitle(t.chart_id)}</span>
                  </button>
                )}
                {t.space && !mySpace && (
                  <span className="mb-2 ms-1 inline-flex items-center gap-1 rounded-md bg-[var(--status-warning)]/12 px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    {tr("With")} {t.space.name ?? tr("partner")}
                  </span>
                )}
                <Message c={t} people={people} onDelete={remove} />
                {t.replies.length > 0 && (
                  <div className="mt-3 flex flex-col gap-3 border-s-2 border-[var(--border)] ps-3">
                    {t.replies.map((r) => (
                      <Message key={r.id} c={r} people={people} onDelete={remove} />
                    ))}
                  </div>
                )}
                {replyTo === t.id ? (
                  <div className="mt-3">
                    <MentionInput
                      value={replyDraft}
                      onChange={setReplyDraft}
                      onSubmit={() => post(replyDraft, t.id)}
                      people={people}
                      placeholder={tr("Reply… (@ to mention)")}
                      autoFocus
                      disabled={busy}
                    />
                    <div className="mt-1.5 flex justify-end gap-2">
                      <button onClick={() => setReplyTo(null)} className="px-2 py-1 text-xs text-[var(--text-secondary)]">
                        {tr("Cancel")}
                      </button>
                      <button
                        onClick={() => post(replyDraft, t.id)}
                        disabled={busy || !replyDraft.trim()}
                        className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {tr("Reply")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2.5 flex items-center gap-3 text-xs">
                    <button
                      onClick={() => {
                        setReplyTo(t.id);
                        setReplyDraft("");
                      }}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {tr("Reply")}
                    </button>
                    {t.can_resolve &&
                      (t.resolved_at ? (
                        <button onClick={() => setResolved(t, false)} className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                          {tr("Reopen")}
                        </button>
                      ) : (
                        <button onClick={() => setResolved(t, true)} className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] hover:text-[var(--status-good)]">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                          {tr("Resolve")}
                        </button>
                      ))}
                    {t.resolved_at && (
                      <span className="ms-auto text-[11px] text-[var(--status-good)]">
                        {tr("✓ Resolved")}{t.resolved_by ? tr(" by {resolved_by}", { resolved_by: t.resolved_by }) : ""}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-[var(--border)] p-3">
          {error && <p className="mb-2 text-xs text-[var(--status-critical)]">{error}</p>}
          {mySpace && (
            <p className="mb-2 text-[11px] text-[var(--text-muted)]">
              {tr("Private between")} {mySpace.name ?? tr("your company")} {tr("and")} {sharedBy ?? tr("the dashboard owner")}{tr(". Other companies can't see it.")}
            </p>
          )}
          {!mySpace && spaces.length > 0 && (
            <label className="mb-2 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              {tr("Visible to")}
              <select
                value={space ?? ""}
                onChange={(e) => setSpace(e.target.value ? Number(e.target.value) : null)}
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--text-primary)]"
              >
                <option value="">{tr("Your team only (internal)")}</option>
                {spaces.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {tr("Your team +")} {sp.name ?? tr("partner")}
                  </option>
                ))}
              </select>
            </label>
          )}
          <MentionInput
            value={draft}
            onChange={setDraft}
            onSubmit={() => post(draft)}
            people={people}
            placeholder={chartFilter !== null ? tr("Comment on “{v0}”… (@ to mention)", { v0: chartTitle(chartFilter) }) : tr("Comment on this dashboard… (@ to mention)")}
            disabled={busy}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">{tr("Enter to send · Shift+Enter for a new line")}</span>
            <button
              onClick={() => post(draft)}
              disabled={busy || !draft.trim()}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? tr("Posting…") : tr("Comment")}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
