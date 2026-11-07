"use client";

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import ChartRenderer from "@/components/charts/ChartRenderer";
import {
  api,
  ApiError,
  type AiConversation,
  type AiMessage,
  type Chart,
  type ChartType,
  type Dashboard,
  type Dataset,
} from "@/lib/api";

function previewChart(
  datasetId: number,
  id: number,
  title: string,
  type: ChartType,
  config: Record<string, string>
): Chart {
  return {
    id: -id,
    dashboard_id: 0,
    dataset_id: datasetId,
    title,
    type,
    config,
    filters: null,
    position: null,
  };
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-.8 13.6a2 2 0 0 1-2 1.9H6.8a2 2 0 0 1-2-1.9L4 6h16Z" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}

function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
    </svg>
  );
}

const SUGGESTED_PROMPTS = [
  "Build a full dashboard from this dataset",
  "What's the overall summary of this data?",
  "Show me the top performers",
  "Are there any trends over time?",
];

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function SaveChartButton({
  message,
  dashboards,
  onSaved,
}: {
  message: AiMessage;
  dashboards: Dashboard[];
  onSaved: (chartId: number, dashboardName: string) => void;
}) {
  const [dashboardId, setDashboardId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!dashboardId) return;
    setSaving(true);
    setError(null);
    try {
      const chart = await api.post<{ id: number }>(`/ai-messages/${message.id}/save-chart`, {
        dashboard_id: dashboardId,
      });
      const dashboard = dashboards.find((d) => d.id === dashboardId);
      onSaved(chart.id, dashboard?.name ?? "dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save chart.");
    } finally {
      setSaving(false);
    }
  }

  if (dashboards.length === 0) {
    return <p className="mt-2 text-[var(--text-muted)]">Create a dashboard first to save this chart.</p>;
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5">
        <select
          value={dashboardId}
          onChange={(e) => setDashboardId(Number(e.target.value))}
          className="rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs"
        >
          <option value="">Choose dashboard...</option>
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button
          onClick={onSave}
          disabled={!dashboardId || saving}
          className="rounded bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save chart"}
        </button>
      </div>
      {error && <p className="mt-1 text-[var(--status-critical)]">{error}</p>}
    </div>
  );
}

function SaveDashboardButton({
  message,
  onSaved,
}: {
  message: AiMessage;
  onSaved: (dashboardId: number, name: string) => void;
}) {
  const [name, setName] = useState(message.dashboard_title ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const dashboard = await api.post<{ id: number; name: string }>(`/ai-messages/${message.id}/save-dashboard`, {
        name: name.trim() || undefined,
      });
      onSaved(dashboard.id, dashboard.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create dashboard.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dashboard name"
          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="shrink-0 rounded bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          {saving ? "Creating..." : "Create dashboard"}
        </button>
      </div>
      {error && <p className="mt-1 text-[var(--status-critical)]">{error}</p>}
    </div>
  );
}

function ChatContent() {
  const [conversations, setConversations] = useState<AiConversation[] | null>(null);
  // null = still loading. Starting as [] made the page claim "No datasets yet" while the
  // request was in flight (and forever, if it failed — the error was swallowed).
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);
  const [datasetsError, setDatasetsError] = useState(false);
  // Phones show one pane at a time; this opens the "start a chat" pane from the list.
  const [composing, setComposing] = useState(false);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [active, setActive] = useState<AiConversation | null>(null);
  const [loadingActive, setLoadingActive] = useState(false);
  const [newDatasetId, setNewDatasetId] = useState<number | "">("");
  const [savedDashboardNames, setSavedDashboardNames] = useState<Record<number, string>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nextTempId = useRef(0);

  function loadConversations() {
    api
      .get<AiConversation[]>("/ai-conversations")
      .then(setConversations)
      .catch(() => setConversations((prev) => prev ?? []));
  }

  function loadDatasets() {
    api
      .get<Dataset[]>("/datasets")
      .then(setDatasets)
      .catch(() => setDatasetsError(true));
  }

  useEffect(() => {
    loadDatasets();
    api.get<Dashboard[]>("/dashboards").then(setDashboards).catch(() => {});
    loadConversations();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages?.length]);

  function openConversation(id: number) {
    setActiveId(id);
    setLoadingActive(true);
    setError(null);
    api
      .get<AiConversation>(`/ai-conversations/${id}`)
      .then((c) => setActive(c))
      .catch(() => setError("Failed to load conversation."))
      .finally(() => setLoadingActive(false));
  }

  function startNewChat() {
    setActiveId(null);
    setActive(null);
    setError(null);
    setComposing(true);
  }

  function backToList() {
    setActiveId(null);
    setActive(null);
    setComposing(false);
  }

  async function createConversation(datasetId: number) {
    setNewDatasetId(datasetId);
    setError(null);
    try {
      const conv = await api.post<AiConversation>("/ai-conversations", { dataset_id: datasetId });
      setConversations((prev) => [conv, ...(prev ?? [])]);
      setActive({ ...conv, messages: [] });
      setActiveId(conv.id);
      setComposing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start conversation.");
    } finally {
      setNewDatasetId("");
    }
  }

  async function onDeleteConversation(id: number, e?: MouseEvent) {
    e?.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      await api.del(`/ai-conversations/${id}`);
      setConversations((prev) => (prev ?? []).filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setActive(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete conversation.");
    }
  }

  async function sendMessage(content: string) {
    if (!content.trim() || !activeId || sending) return;
    nextTempId.current -= 1;
    const tempId = nextTempId.current;
    setInput("");
    setSending(true);
    setError(null);
    setActive((prev) =>
      prev
        ? {
            ...prev,
            messages: [
              ...(prev.messages ?? []),
              {
                id: tempId,
                conversation_id: activeId,
                role: "user",
                content,
                response_type: null,
                chart_title: null,
                chart_type: null,
                chart_config: null,
                chart_data: null,
                analysis: null,
                chart_id: null,
                dashboard_title: null,
                dashboard_charts: null,
                dashboard_id: null,
                created_at: new Date().toISOString(),
              },
            ],
          }
        : prev
    );

    try {
      const res = await api.post<{ user_message: AiMessage; assistant_message: AiMessage }>(
        `/ai-conversations/${activeId}/messages`,
        { content }
      );
      setActive((prev) => {
        if (!prev) return prev;
        const rest = (prev.messages ?? []).filter((m) => m.id !== tempId);
        return { ...prev, messages: [...rest, res.user_message, res.assistant_message] };
      });
      loadConversations();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "AI request failed.");
      // The user message may have been persisted server-side even though the AI reply failed —
      // re-sync with the server instead of guessing.
      openConversation(activeId);
    } finally {
      setSending(false);
    }
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function onProposalSaved(messageId: number, patch: Partial<AiMessage>, name: string) {
    setActive((prev) =>
      prev
        ? { ...prev, messages: (prev.messages ?? []).map((m) => (m.id === messageId ? { ...m, ...patch } : m)) }
        : prev
    );
    setSavedDashboardNames((prev) => ({ ...prev, [messageId]: name }));
  }


  const conversationList = (
    <div className="flex h-full w-full flex-col border-[var(--border)] bg-[var(--surface-1)] md:w-72 md:shrink-0 md:border-r">
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
            <SparkleIcon />
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">AI Chat</h1>
        </div>
        <button
          onClick={startNewChat}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white shadow-sm"
        >
          <PlusIcon />
          New chat
        </button>
      </div>
      <div className="px-4 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Recent</div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations === null && (
          <div className="flex flex-col gap-2 px-2">
            <div className="h-10 animate-pulse rounded-lg bg-[var(--surface-2)]" />
            <div className="h-10 animate-pulse rounded-lg bg-[var(--surface-2)]" />
          </div>
        )}
        {conversations?.map((c) => (
          <div
            key={c.id}
            className={`mb-0.5 flex items-center gap-1 rounded-lg pr-1 transition-colors ${
              activeId === c.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--surface-2)]"
            }`}
          >
            <button onClick={() => openConversation(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left text-sm">
              <span
                className={`block truncate font-medium ${activeId === c.id ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}
              >
                {c.title ?? "New chat"}
              </span>
              <span className="block truncate text-xs text-[var(--text-muted)]">
                {c.dataset?.name} · {relativeTime(c.updated_at)}
              </span>
            </button>
            <button
              onClick={(e) => onDeleteConversation(c.id, e)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--status-critical)]/10 hover:text-[var(--status-critical)]"
              title="Delete conversation"
              aria-label="Delete conversation"
            >
              <TrashIcon />
            </button>
          </div>
        ))}
        {conversations?.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-[var(--text-muted)]">
            No conversations yet. Start one to ask questions about your data in plain language.
          </p>
        )}
      </div>
    </div>
  );

  const startPanel = (
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-8 sm:justify-center sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="text-center">
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ background: "var(--accent-glow)" }}
          >
            <SparkleIcon size={26} />
          </div>
          <h2 className="mt-4 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Ask your data anything</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">
            Pick a dataset, then ask in plain language — &ldquo;Which region grew fastest?&rdquo; or &ldquo;Chart revenue by
            month&rdquo;. Daha AI answers and builds charts you can save to a dashboard.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {datasets === null && !datasetsError &&
            [0, 1, 2, 3].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-xl bg-[var(--surface-2)]" />)}
          {datasetsError && (
            <div className="rounded-xl border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/5 p-4 text-sm sm:col-span-2">
              <span className="text-[var(--status-critical)]">Couldn&apos;t load your datasets.</span>{" "}
              <button
                onClick={() => {
                  setDatasetsError(false);
                  loadDatasets();
                }}
                className="font-medium text-[var(--accent)] hover:underline"
              >
                Try again
              </button>
            </div>
          )}
          {datasets?.length === 0 && (
            <div className="sm:col-span-2">
              <EmptyState
                icon={<SparkleIcon />}
                title="No datasets yet"
                description="Connect a data source first — then you can chat with it here."
                action={
                  <Link href="/data-sources" className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white">
                    Add a data source
                  </Link>
                }
              />
            </div>
          )}
          {datasets?.map((d) => (
            <button
              key={d.id}
              onClick={() => createConversation(d.id)}
              disabled={newDatasetId !== ""}
              className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-left transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)] disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary)] group-hover:bg-[var(--surface-1)] group-hover:text-[var(--accent)]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 10h18M9 10v10" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">{d.name}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">
                  {d.row_count.toLocaleString()} rows · {d.columns.length} columns
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium text-[var(--accent)]">
                {newDatasetId === d.id ? "Starting…" : "Chat →"}
              </span>
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-center text-sm text-[var(--status-critical)]">{error}</p>}
      </div>
    </div>
  );

  const showConversation = activeId !== null || active !== null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] md:h-screen">
      {/* Phones show one pane at a time: list → (start | conversation). Desktop shows both. */}
      <div className={showConversation || composing ? "hidden md:flex md:h-full" : "flex h-full w-full md:w-auto"}>
        {conversationList}
      </div>

      <div className={showConversation || composing ? "flex h-full flex-1 flex-col" : "hidden md:flex md:flex-1 md:flex-col"}>
        {!showConversation ? (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 md:hidden">
              <button onClick={backToList} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Back to chats">
                <BackIcon />
              </button>
              <span className="font-medium text-[var(--text-primary)]">New chat</span>
            </div>
            {startPanel}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 md:px-6">
              <button onClick={backToList} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] md:hidden" aria-label="Back to chats">
                <BackIcon />
              </button>
              <div className="min-w-0">
                <h1 className="truncate font-medium text-[var(--text-primary)]">{active?.title ?? "New chat"}</h1>
                {active?.dataset && <p className="truncate text-xs text-[var(--text-muted)]">Chatting about {active.dataset.name}</p>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
              <div className="mx-auto max-w-3xl">
              {loadingActive && (
                <div className="flex flex-col gap-3" aria-label="Loading conversation">
                  <div className="ml-auto h-10 w-1/3 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
                  <div className="h-20 w-2/3 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
                </div>
              )}
              {!loadingActive && active?.messages?.length === 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Try one of these to get started:</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => sendMessage(p)}
                        disabled={sending}
                        className="rounded-full border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-60"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-3">
                {active?.messages?.map((m) => {
                  if (m.response_type === "dashboard") {
                    const chartsWithData = (m.dashboard_charts ?? []).filter((c) => c.chart_data);
                    return (
                      <div key={m.id} className="flex justify-start">
                        <div className="w-full max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3.5 sm:max-w-3xl">
                          <h3 className="font-medium text-[var(--text-primary)]">{m.dashboard_title}</h3>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{m.content}</p>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {chartsWithData.map((c, i) => (
                              <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] p-2.5">
                                <p className="mb-1 truncate text-xs font-medium text-[var(--text-primary)]">{c.chart_title}</p>
                                <ChartRenderer
                                  chart={previewChart(active!.dataset_id, m.id * 1000 + i, c.chart_title, c.chart_type, c.chart_config)}
                                  data={c.chart_data!}
                                />
                              </div>
                            ))}
                          </div>
                          {m.analysis && (
                            <div className="mt-3 flex items-start gap-2 rounded-md bg-[var(--page-plane)] p-2.5 text-xs text-[var(--text-secondary)]">
                              <span className="mt-0.5 shrink-0 text-[var(--accent)]">
                                <SparkleIcon />
                              </span>
                              <p>{m.analysis}</p>
                            </div>
                          )}
                          <div className="mt-3 border-t border-[var(--border)] pt-3">
                            {m.dashboard_id ? (
                              <p className="text-xs text-[var(--status-good)]">
                                ✓ Created
                                {savedDashboardNames[m.id] && (
                                  <>
                                    :{" "}
                                    <Link href={`/dashboards/${m.dashboard_id}`} className="text-[var(--accent)] underline">
                                      {savedDashboardNames[m.id]}
                                    </Link>
                                  </>
                                )}
                              </p>
                            ) : (
                              <>
                                <p className="mb-1.5 text-xs font-medium text-[var(--text-primary)]">
                                  Ready to create this dashboard?
                                </p>
                                <SaveDashboardButton
                                  message={m}
                                  onSaved={(dashboardId, name) => onProposalSaved(m.id, { dashboard_id: dashboardId }, name)}
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (m.response_type === "chart") {
                    return (
                      <div key={m.id} className="flex justify-start">
                        <div className="w-full max-w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3.5 sm:max-w-xl">
                          <p className="text-sm text-[var(--text-primary)]">{m.content}</p>
                          {m.chart_data ? (
                            <div className="mt-2">
                              <ChartRenderer
                                chart={previewChart(active!.dataset_id, m.id, m.chart_title ?? "Chart", m.chart_type ?? "bar", m.chart_config ?? {})}
                                data={m.chart_data}
                              />
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-[var(--text-muted)]">
                              {m.chart_type} chart
                              {m.chart_config?.x_field ? ` · ${m.chart_config.x_field}` : ""}
                              {m.chart_config?.y_field ? ` / ${m.chart_config.y_field}` : ""}
                            </p>
                          )}
                          {m.analysis && (
                            <div className="mt-3 flex items-start gap-2 rounded-md bg-[var(--page-plane)] p-2.5 text-xs text-[var(--text-secondary)]">
                              <span className="mt-0.5 shrink-0 text-[var(--accent)]">
                                <SparkleIcon />
                              </span>
                              <p>{m.analysis}</p>
                            </div>
                          )}
                          <div className="mt-3">
                            {m.chart_id ? (
                              <p className="text-xs text-[var(--status-good)]">
                                ✓ Saved{savedDashboardNames[m.id] ? ` to ${savedDashboardNames[m.id]}` : ""}
                              </p>
                            ) : (
                              <SaveChartButton
                                message={m}
                                dashboards={dashboards}
                                onSaved={(chartId, name) => onProposalSaved(m.id, { chart_id: chartId }, name)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      {m.role !== "user" && (
                        <span
                          className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ background: "var(--accent-glow)" }}
                          aria-hidden
                        >
                          <SparkleIcon size={13} />
                        </span>
                      )}
                      <div
                        className={`max-w-[85%] px-4 py-2.5 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "rounded-2xl rounded-br-md bg-[var(--accent)] text-white"
                            : "rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] shadow-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      </div>
                    </div>
                  );
                })}
                {sending && (
                  <div className="flex items-end gap-2">
                    <span
                      className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ background: "var(--accent-glow)" }}
                      aria-hidden
                    >
                      <SparkleIcon size={13} />
                    </span>
                    <div
                      className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3"
                      role="status"
                      aria-label="Daha AI is thinking"
                    >
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-muted)]"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div ref={bottomRef} />
              </div>
            </div>

            {error && <p className="px-4 pb-2 text-sm text-[var(--status-critical)] md:px-6">{error}</p>}

            <form onSubmit={onSend} className="border-t border-[var(--border)] bg-[var(--surface-1)] p-3 md:px-6 md:py-4">
              <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--page-plane)] p-1.5 pl-4 shadow-sm focus-within:border-[var(--accent)]">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question or ask for a chart…"
                  className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus-visible:outline-none"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white disabled:opacity-40"
                  aria-label="Send"
                >
                  <SendIcon />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <RequireAuth>
      <ChatContent />
    </RequireAuth>
  );
}
