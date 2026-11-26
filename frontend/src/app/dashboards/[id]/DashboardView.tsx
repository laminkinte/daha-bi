"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import Link from "next/link";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import ChartCard from "@/components/charts/ChartCard";
import ChartBuilder from "@/components/charts/ChartBuilder";
import ChartErrorBoundary from "@/components/charts/ChartErrorBoundary";
import SlicerPanel, { selectionsToFilters, type SlicerSelection } from "@/components/dashboard/SlicerPanel";
import { Modal, BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL } from "@/components/Modal";
import { Skeleton, CardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import {
  api,
  ApiError,
  type Chart,
  type ChartFilter,
  type Collaborator,
  type Dashboard,
  type Dataset,
  type ReportSchedule,
  type InviteSent,
} from "@/lib/api";
import { InviteSentNotice, PendingInvites } from "@/components/PendingInvites";
import CommentsPanel, { useComments } from "@/components/comments/CommentsPanel";
import { downloadDashboardPdf } from "@/lib/dashboard-export";

function ChartIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3v18h18" />
      <path d="M7 15l4-6 4 3 5-8" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z" />
    </svg>
  );
}

type AiResult =
  | { response_type: "answer"; answer: string }
  | { response_type: "chart"; chart: { title: string } };

const AI_EXAMPLES = ["Revenue by region as a bar chart", "Monthly trend of orders", "Top 5 products by sales", "What's the average order value?"];

function AiPromptDialog({
  dashboardId,
  datasets,
  onCreated,
  onClose,
}: {
  dashboardId: number;
  datasets: Dataset[];
  onCreated: () => void;
  onClose: () => void;
}) {
  const [datasetId, setDatasetId] = useState<number | "">(datasets[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!prompt.trim() || !datasetId || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<AiResult>(`/dashboards/${dashboardId}/ai-prompt`, { dataset_id: datasetId, prompt });
      setResult(res);
      if (res.response_type === "chart") {
        setPrompt("");
        onCreated();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "AI request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={<SparkleIcon />}
      title="Ask AI"
      description="Describe the chart you want, or ask a question about your data."
      footer={
        <>
          <button onClick={onClose} className={BTN_SECONDARY}>
            {result?.response_type === "chart" ? "Done" : "Cancel"}
          </button>
          <button onClick={() => onSubmit()} disabled={submitting || !prompt.trim() || !datasetId} className={BTN_PRIMARY}>
            <SparkleIcon />
            {submitting ? "Thinking…" : "Ask"}
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4 p-5">
        <div>
          <label className={FIELD_LABEL}>Dataset</label>
          <select value={datasetId} onChange={(e) => setDatasetId(Number(e.target.value))} className={FIELD_INPUT}>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Your request</label>
          <textarea
            data-autofocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            rows={3}
            placeholder="e.g. revenue by region as a bar chart"
            className={`${FIELD_INPUT} resize-none`}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {AI_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-[var(--status-critical)]/10 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</p>}
        {result?.response_type === "answer" && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3.5 text-sm leading-6 text-[var(--text-primary)]">
            {result.answer}
          </div>
        )}
        {result?.response_type === "chart" && (
          <div className="flex items-center gap-2 rounded-lg bg-[var(--status-good)]/10 px-3.5 py-2.5 text-sm text-[var(--text-primary)]">
            <span className="text-[var(--status-good)]">✓</span>
            Added &ldquo;{result.chart.title}&rdquo; to this dashboard. Ask for another, or close.
          </div>
        )}
      </form>
    </Modal>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.5 6.8-3.9M8.6 13.5l6.8 3.9" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "dashboard";
}

function ExportButton({ dashboard, chartsRef }: { dashboard: Dashboard; chartsRef: RefObject<HTMLDivElement | null> }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportExcel() {
    setBusy("excel");
    setError(null);
    try {
      await api.download(`/dashboards/${dashboard.id}/export/excel`, `${slug(dashboard.name)}.xlsx`);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to export Excel.");
    } finally {
      setBusy(null);
    }
  }

  async function exportPdf() {
    if (!chartsRef.current) {
      setError("Nothing to export yet.");
      return;
    }
    setBusy("pdf");
    setError(null);
    try {
      await downloadDashboardPdf(
        chartsRef.current,
        dashboard.name,
        dashboard.description,
        `${slug(dashboard.name)}.pdf`,
        user?.low_bandwidth_mode ?? false
      );
      setOpen(false);
    } catch {
      setError("Failed to export PDF.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={"Export"}
        title={"Export"}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      >
        <DownloadIcon />
        <span className="hidden sm:inline">Export</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-52 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-2 text-sm shadow-lg">
          <button
            onClick={exportExcel}
            disabled={busy !== null}
            className="block w-full rounded-md px-3 py-2 text-left text-[var(--text-secondary)] hover:bg-[var(--page-plane)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {busy === "excel" ? "Exporting..." : "Export as Excel"}
          </button>
          <button
            onClick={exportPdf}
            disabled={busy !== null}
            className="block w-full rounded-md px-3 py-2 text-left text-[var(--text-secondary)] hover:bg-[var(--page-plane)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {busy === "pdf" ? "Exporting..." : "Export as PDF"}
          </button>
          {error && <p className="mt-1 px-3 text-xs text-[var(--status-critical)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ShareButton({
  dashboard,
  onChanged,
}: {
  dashboard: Dashboard;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicUrl =
    dashboard.is_shared && dashboard.share_token
      ? `${window.location.origin}/public/${dashboard.share_token}`
      : null;

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/dashboards/${dashboard.id}/share`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to enable sharing.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/dashboards/${dashboard.id}/share`);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to disable sharing.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!publicUrl) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={dashboard.is_shared ? "Shared" : "Share"}
        title={dashboard.is_shared ? "Shared" : "Share"}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      >
        <ShareIcon />
        <span className="hidden sm:inline">{dashboard.is_shared ? "Shared" : "Share"}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm shadow-lg">
          {!dashboard.is_shared ? (
            <>
              <p className="text-[var(--text-secondary)]">
                Create a public, read-only link anyone can view without logging in.
              </p>
              <button
                onClick={enable}
                disabled={busy}
                className="mt-3 w-full rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white disabled:opacity-60"
              >
                {busy ? "Enabling..." : "Enable public link"}
              </button>
            </>
          ) : (
            <>
              <p className="text-[var(--text-secondary)]">Anyone with this link can view this dashboard.</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={publicUrl ?? ""}
                  className="flex-1 truncate rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2 py-1.5 text-xs"
                />
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <button
                onClick={disable}
                disabled={busy}
                className="mt-3 w-full rounded-md border border-[var(--border)] px-3 py-1.5 text-[var(--status-critical)] disabled:opacity-60"
              >
                {busy ? "Disabling..." : "Disable public link"}
              </button>
            </>
          )}
          {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

function TeamIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <path d="M2 21v-1a7 7 0 0 1 14 0v1" />
      <circle cx="18" cy="8" r="2.5" />
      <path d="M17 14.5a5.5 5.5 0 0 1 5 5.5v1" />
    </svg>
  );
}

function CollaboratorsPanel({ dashboard }: { dashboard: Dashboard }) {
  const [open, setOpen] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteSent, setInviteSent] = useState<InviteSent | null>(null);
  const [inviteRefresh, setInviteRefresh] = useState(0);

  function load() {
    api
      .getRetrying<Collaborator[]>(`/dashboards/${dashboard.id}/collaborators`)
      .then(setCollaborators)
      .catch(() => {});
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<InviteSent | Collaborator>(`/dashboards/${dashboard.id}/collaborators`, { email, role });
      setEmail("");
      if ("pending" in res && res.pending) {
        setInviteSent(res);
        setInviteRefresh((n) => n + 1);
      } else {
        setInviteSent(null);
        load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to invite.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: number) {
    try {
      await api.del(`/dashboards/${dashboard.id}/collaborators/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove.");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={"Team"}
        title={"Team"}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      >
        <TeamIcon />
        <span className="hidden sm:inline">Team</span>
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm shadow-lg">
          <p className="font-medium text-[var(--text-primary)]">Share this dashboard</p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Invite anyone by email — teammates or people at partner companies. They only see this dashboard.
          </p>

          {collaborators.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {collaborators.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2.5 py-1.5 text-xs"
                >
                  <div>
                    <div className="text-[var(--text-primary)]">{c.user.name}</div>
                    <div className="text-[var(--text-muted)]">{c.user.email} &middot; {c.role}</div>
                  </div>
                  <button onClick={() => onRemove(c.id)} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={onInvite} className="mt-3 flex items-center gap-1.5">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              type="email"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2 py-1.5 text-xs"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
              className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-1.5 py-1.5 text-xs"
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Invite
            </button>
          </form>
          {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
          {inviteSent && (
            <div className="mt-3">
              <InviteSentNotice invite={inviteSent} onClose={() => setInviteSent(null)} />
            </div>
          )}
          <PendingInvites listUrl={`/dashboards/${dashboard.id}/invitations`} refreshKey={inviteRefresh} />
        </div>
      )}
    </div>
  );
}

function AiRecommendationsPanel({ dashboard }: { dashboard: Dashboard }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onOpen() {
    setOpen(true);
    if (analysis || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ analysis: string }>(`/dashboards/${dashboard.id}/ai-recommendations`, {});
      setAnalysis(res.analysis);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to get recommendations.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => (open ? setOpen(false) : onOpen())}
        aria-label={"AI insights"}
        title={"AI insights"}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      >
        <SparkleIcon />
        <span className="hidden sm:inline">AI insights</span>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm shadow-lg">
          {loading && <p className="text-[var(--text-muted)]">Analyzing this dashboard...</p>}
          {error && <p className="text-[var(--status-critical)]">{error}</p>}
          {analysis && <p className="whitespace-pre-line text-[var(--text-primary)]">{analysis}</p>}
        </div>
      )}
    </div>
  );
}

function ReportIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h16v16H4z" />
      <path d="M4 9h16M9 9v11" />
    </svg>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ReportSchedulesPanel({ dashboard }: { dashboard: Dashboard }) {
  const [open, setOpen] = useState(false);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [recipients, setRecipients] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [timeOfDay, setTimeOfDay] = useState("08:00");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .getRetrying<ReportSchedule[]>(`/dashboards/${dashboard.id}/report-schedules`)
      .then(setSchedules)
      .catch(() => {});
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const list = recipients
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    if (list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/dashboards/${dashboard.id}/report-schedules`, {
        recipients: list,
        frequency,
        day_of_week: frequency === "weekly" ? dayOfWeek : undefined,
        time_of_day: timeOfDay,
      });
      setRecipients("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function onSendNow(id: number) {
    setNotice(null);
    setError(null);
    try {
      await api.post(`/report-schedules/${id}/send-now`);
      setNotice("Sent. Locally this goes to storage/logs/laravel.log unless real SMTP is configured.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send.");
    }
  }

  async function onRemove(id: number) {
    try {
      await api.del(`/report-schedules/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to remove.");
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={"Reports"}
        title={"Reports"}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      >
        <ReportIcon />
        <span className="hidden sm:inline">Reports</span>
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-96 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4 text-sm shadow-lg">
          <p className="text-[var(--text-secondary)]">Email a summary of this dashboard on a schedule.</p>

          {schedules.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[var(--text-primary)]">
                      {s.frequency === "weekly" ? `Weekly, ${DAY_NAMES[s.day_of_week ?? 0]}` : "Daily"} at{" "}
                      {s.time_of_day.slice(0, 5)}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => onSendNow(s.id)} className="text-[var(--accent)]">
                        Send now
                      </button>
                      <button onClick={() => onRemove(s.id)} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]">
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-0.5 text-[var(--text-muted)]">{s.recipients.join(", ")}</div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={onCreate} className="mt-3 flex flex-col gap-2">
            <input
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="recipient1@email.com, recipient2@email.com"
              className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-2 py-1.5 text-xs"
            />
            <div className="flex items-center gap-1.5">
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as "daily" | "weekly")}
                className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-1.5 py-1.5 text-xs"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              {frequency === "weekly" && (
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-1.5 py-1.5 text-xs"
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="time"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-1.5 py-1.5 text-xs"
              />
              <button
                type="submit"
                disabled={busy}
                className="shrink-0 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                Schedule
              </button>
            </div>
          </form>
          {notice && <p className="mt-2 text-[var(--status-good)]">{notice}</p>}
          {error && <p className="mt-2 text-[var(--status-critical)]">{error}</p>}
        </div>
      )}
    </div>
  );
}

const GRID_ROW_HEIGHT = 32;
const GRID_COLS = 12;

/**
 * Smallest height (in grid rows) each chart type stays readable at. Older dashboards stored
 * h values of 2–4 from before the drag grid existed, which rendered charts ~100px tall; this
 * floor keeps every chart legible regardless of what was saved. 4 rows ≈ 176px, 9 ≈ 416px.
 */
const MIN_ROWS: Partial<Record<Chart["type"], number>> = { kpi: 4, table: 9 };
const DEFAULT_MIN_ROWS = 8;

/** Same positions and sizes, regardless of array identity or item order. */
function sameLayout(a: Layout, b: Layout): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((item) => [item.i, item]));
  return a.every((item) => {
    const o = byId.get(item.i);
    return !!o && o.x === item.x && o.y === item.y && o.w === item.w && o.h === item.h;
  });
}

function chartsToLayout(charts: Chart[]): Layout {
  return charts.map((chart, i) => {
    const pos = chart.position;
    const minH = MIN_ROWS[chart.type] ?? DEFAULT_MIN_ROWS;
    return {
      i: String(chart.id),
      x: pos?.x ?? (i * 6) % GRID_COLS,
      y: pos?.y ?? Math.floor(i / 2) * 9,
      w: Math.min(GRID_COLS, Math.max(3, pos?.w ?? 6)),
      h: Math.max(minH, pos?.h ?? 9),
      minW: 3,
      minH,
    };
  });
}

/**
 * A drag-and-resize dashboard canvas (Power BI-style) built on react-grid-layout. Chart position
 * is persisted to Chart.position, which the backend already stored as a free-form {x,y,w,h} JSON
 * column — only the frontend previously ignored x/y/h and used w for a static column-span. Layout
 * updates are applied to local state immediately (for a smooth drag/resize) but only written to
 * the backend on drag/resize *stop*, not on every intermediate frame.
 */
function DraggableChartGrid({
  dashboard,
  canEdit,
  crossFilter,
  onDrillDown,
  onDeleted,
  onUpdated,
  onEdit,
  chartsRef,
  dashboardFilters,
  refreshKey,
  commentCounts,
  onComment,
}: {
  commentCounts: Map<number, number>;
  onComment: (chart: Chart) => void;
  dashboardFilters: ChartFilter[];
  refreshKey: number;
  dashboard: Dashboard;
  canEdit: boolean;
  crossFilter: ChartFilter | null;
  onDrillDown: (field: string, value: string) => void;
  onDeleted: () => void;
  onUpdated: () => void;
  onEdit: (chart: Chart) => void;
  chartsRef: RefObject<HTMLDivElement | null>;
}) {
  const charts = dashboard.charts ?? [];
  const { width, containerRef, mounted } = useContainerWidth();
  const [layout, setLayout] = useState<Layout>(() => chartsToLayout(charts));

  useEffect(() => {
    Promise.resolve().then(() => setLayout(chartsToLayout(charts)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard.id, charts.length]);

  // Phones/narrow screens: stack every chart full-width in the desktop reading order (top-to-bottom,
  // then left-to-right). This is a display-only layout — dragging is off and nothing is persisted,
  // so opening a dashboard on a phone never rewrites its desktop arrangement.
  const isNarrow = mounted && width < 768;
  const displayLayout: Layout = isNarrow
    ? (() => {
        let y = 0;
        return [...layout]
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((item) => {
            const stacked = { ...item, x: 0, y, w: GRID_COLS };
            y += item.h;
            return stacked;
          });
      })()
    : layout;

  async function persist(newLayout: Layout) {
    for (const item of newLayout) {
      const chart = charts.find((c) => String(c.id) === item.i);
      const prev = chart?.position;
      if (!chart) continue;
      if (prev && prev.x === item.x && prev.y === item.y && prev.w === item.w && prev.h === item.h) continue;
      try {
        await api.put(`/charts/${chart.id}`, { position: { x: item.x, y: item.y, w: item.w, h: item.h } });
      } catch {
        // Best-effort — the grid stays visually where the user dropped it either way; a failed
        // save just means the position reverts to last-saved on the next full reload.
      }
    }
  }

  return (
    <div ref={chartsRef}>
      <div ref={containerRef}>
        {mounted && (
          <GridLayout
            width={width}
            layout={displayLayout}
            gridConfig={{ cols: GRID_COLS, rowHeight: GRID_ROW_HEIGHT, margin: isNarrow ? [0, 12] : [16, 16], containerPadding: [0, 0] }}
            dragConfig={{ enabled: canEdit && !isNarrow, handle: ".chart-drag-handle" }}
            resizeConfig={{ enabled: canEdit && !isNarrow }}
            onLayoutChange={(l) => {
              // Only store real changes: echoing an equal-but-new array back into the grid can make
              // it re-emit onLayoutChange, and that ping-pong is a render loop.
              if (!isNarrow) setLayout((cur) => (sameLayout(cur, l) ? cur : l));
            }}
            onDragStop={(l) => {
              if (!isNarrow) persist(l);
            }}
            onResizeStop={(l) => {
              if (!isNarrow) persist(l);
            }}
          >
            {charts.map((chart) => (
              <div key={String(chart.id)} className="h-full">
                <ChartErrorBoundary title={chart.title}>
                <ChartCard
                  chart={chart}
                  onDeleted={onDeleted}
                  onUpdated={onUpdated}
                  canEdit={canEdit}
                  crossFilter={crossFilter}
                  onDrillDown={onDrillDown}
                  onEdit={onEdit}
                  dashboardFilters={dashboardFilters}
                  refreshKey={refreshKey}
                  commentCount={commentCounts.get(chart.id) ?? 0}
                  onComment={onComment}
                />
                </ChartErrorBoundary>
              </div>
            ))}
          </GridLayout>
        )}
      </div>
    </div>
  );
}

function timeAgo(iso: string) {
  const minutes = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)} h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const ICON_BTN =
  "flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] shadow-sm transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]";

function DashboardDetail({ dashboardId }: { dashboardId: number }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [crossFilter, setCrossFilter] = useState<ChartFilter | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [builder, setBuilder] = useState<null | { chart?: Chart }>(null);
  const [askAi, setAskAi] = useState(false);
  const [selections, setSelections] = useState<Record<string, SlicerSelection>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [slicerError, setSlicerError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const comments = useComments(dashboardId);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentChart, setCommentChart] = useState<number | null>(null);
  const [focusComment, setFocusComment] = useState<number | null>(null);
  const chartsRef = useRef<HTMLDivElement>(null);

  // Notification links land here as ?comment=ID — open the panel on that thread.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("comment"));
    if (id) {
      Promise.resolve().then(() => {
        setFocusComment(id);
        setCommentsOpen(true);
      });
    }
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);

  const dashboardFilters = useMemo(() => selectionsToFilters(selections), [selections]);

  // Every field any chart's dataset has, offered as a slicer.
  const slicerColumns = useMemo(() => {
    const seen = new Map<string, { name: string; label: string }>();
    for (const chart of dashboard?.charts ?? []) {
      for (const c of chart.dataset?.columns ?? []) {
        if (seen.has(c.name)) continue;
        // CSV columns arrive labelled with their raw name ("payment_method"); show "Payment method".
        const pretty = c.label === c.name ? c.name.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase()) : c.label;
        seen.set(c.name, { name: c.name, label: pretty });
      }
    }
    return [...seen.values()];
  }, [dashboard?.charts]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current && !!rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen().catch(() => {});
  }

  async function saveSlicers(fields: string[]) {
    if (!dashboard) return;
    const previous = dashboard.settings;
    setSlicerError(null);
    setDashboard({ ...dashboard, settings: { ...previous, slicers: fields.map((field) => ({ field })) } });
    setSelections((sel) => Object.fromEntries(Object.entries(sel).filter(([f]) => fields.includes(f))));
    try {
      await api.put(`/dashboards/${dashboard.id}`, { settings: { slicers: fields.map((field) => ({ field })) } });
    } catch (err) {
      setDashboard((d) => (d ? { ...d, settings: previous } : d));
      setSlicerError(err instanceof ApiError ? err.message : "Couldn't save the filter panel.");
    }
  }

  function pick(field: string, value: string) {
    // Clicking the selected bar/slice again clears it, like Power BI.
    setCrossFilter((cur) => (cur && cur.field === field && cur.value === value ? null : { field, operator: "=", value }));
  }

  function load() {
    api
      .get<Dashboard>(`/dashboards/${dashboardId}`)
      .then((d) => {
        setLoadError(null);
        setDashboard(d);
      })
      .catch((err) =>
        setLoadError(
          err instanceof ApiError && err.status === 403
            ? "You don't have access to this dashboard."
            : err instanceof ApiError && err.status === 404
              ? "This dashboard doesn't exist."
              : "Failed to load this dashboard."
        )
      );
  }

  useEffect(() => {
    load();
    api.get<Dataset[]>("/datasets").then(setDatasets).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <EmptyState
          icon={<ChartIcon />}
          title={loadError}
          description="It may have been deleted, or you may not have permission to view it."
          action={
            <Link
              href="/dashboards"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
            >
              Back to dashboards
            </Link>
          }
        />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-7 w-64" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const role = dashboard.role ?? "owner";
  const canEdit = role === "owner" || role === "editor";

  const slicerFields = (dashboard.settings?.slicers ?? []).map((s) => s.field);
  const showSlicers = !!dashboard.charts?.length && (slicerFields.length > 0 || canEdit);

  return (
    <div ref={rootRef} className={`mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6 ${fullscreen ? "h-full overflow-y-auto bg-[var(--page-plane)]" : ""}`}>
      <nav className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
        <Link href="/dashboards" className="hover:text-[var(--accent)]">
          Dashboards
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate text-[var(--text-secondary)]">{dashboard.name}</span>
      </nav>
      <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{dashboard.name}</h1>
            {role !== "owner" && (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium capitalize text-[var(--text-secondary)]">
                {role}
              </span>
            )}
            {dashboard.is_shared && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                Public link on
              </span>
            )}
          </div>
          {dashboard.description && <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-[var(--text-secondary)]">{dashboard.description}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
            <span>
              {dashboard.charts?.length ?? 0} chart{dashboard.charts?.length === 1 ? "" : "s"}
            </span>
            {dashboard.data_refreshed_at && (
              <span className="flex items-center gap-1.5" title={new Date(dashboard.data_refreshed_at).toLocaleString()}>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-good)]" />
                Data refreshed {timeAgo(dashboard.data_refreshed_at)}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {dashboard.charts && dashboard.charts.length > 0 && (
            <>
              <button
                onClick={() => {
                  setRefreshKey((k) => k + 1);
                  load();
                }}
                className={ICON_BTN}
                title="Refresh data"
                aria-label="Refresh data"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
                </svg>
              </button>
              <button
                onClick={toggleFullscreen}
                className={ICON_BTN}
                title={fullscreen ? "Exit full screen" : "Full screen"}
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {fullscreen ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
                </svg>
              </button>
            </>
          )}
          {dashboard.charts && dashboard.charts.length > 0 && <ExportButton dashboard={dashboard} chartsRef={chartsRef} />}
          {dashboard.charts && dashboard.charts.length > 0 && <AiRecommendationsPanel dashboard={dashboard} />}
          {canEdit && <ReportSchedulesPanel dashboard={dashboard} />}
          <button
            onClick={() => {
              setCommentChart(null);
              setCommentsOpen((o) => !o);
            }}
            className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium shadow-sm transition-colors ${
              commentsOpen
                ? "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--accent)]"
                : "border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
            }`}
            aria-label={comments.openTotal ? `Comments, ${comments.openTotal} open` : "Comments"}
            title="Comments"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
            </svg>
            <span className="hidden sm:inline">Comments</span>
            {comments.openTotal > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-white">
                {comments.openTotal}
              </span>
            )}
          </button>
          {role === "owner" && <CollaboratorsPanel dashboard={dashboard} />}
          {role === "owner" && <ShareButton dashboard={dashboard} onChanged={load} />}
          {canEdit && datasets.length > 0 && (
            <>
              <span className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block" aria-hidden />
              <button
                onClick={() => setAskAi(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-[13px] font-medium text-[var(--accent)] transition-colors hover:border-[var(--accent)]/60"
              >
                <SparkleIcon />
                Ask AI
              </button>
              <button
                onClick={() => setBuilder({})}
                className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-[var(--accent-hover)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add chart
              </button>
            </>
          )}
        </div>
      </div>

      {canEdit && datasets.length === 0 && (
        <p className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          No datasets available yet.{" "}
          <Link href="/data-sources" className="font-medium text-[var(--accent)]">
            Add a data source
          </Link>{" "}
          to start adding charts.
        </p>
      )}

      {crossFilter && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--text-primary)]">
          <span className="text-[var(--accent)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </span>
          <span>
            Selected <strong>{slicerColumns.find((c) => c.name === crossFilter.field)?.label ?? crossFilter.field}</strong> ={" "}
            <strong>{String(crossFilter.value)}</strong>
            <span className="hidden text-[var(--text-muted)] sm:inline"> — other charts are filtered to it. Click it again to clear.</span>
          </span>
          <button
            onClick={() => setCrossFilter(null)}
            className="ml-auto shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
          >
            Clear selection
          </button>
        </div>
      )}
      {slicerError && <p className="mt-3 text-sm text-[var(--status-critical)]">{slicerError}</p>}

      {dashboard.charts && dashboard.charts.length > 0 ? (
        <div className="mt-6 flex flex-col gap-4 xl:flex-row">
          {showSlicers && (
            <SlicerPanel
              dashboardId={dashboard.id}
              slicers={slicerFields}
              columns={slicerColumns}
              selections={selections}
              canEdit={canEdit}
              onSelect={(field, sel) =>
                setSelections((cur) => {
                  const next = { ...cur };
                  if (sel) next[field] = sel;
                  else delete next[field];
                  return next;
                })
              }
              onSlicersChange={saveSlicers}
              onReset={() => setSelections({})}
            />
          )}
          <div className="min-w-0 flex-1">
          <DraggableChartGrid
            dashboard={dashboard}
            canEdit={canEdit}
            crossFilter={crossFilter}
            dashboardFilters={dashboardFilters}
            refreshKey={refreshKey}
            onDrillDown={pick}
            onDeleted={load}
            onUpdated={load}
            onEdit={(chart) => setBuilder({ chart })}
            chartsRef={chartsRef}
            commentCounts={comments.openByChart}
            onComment={(chart) => {
              setCommentChart(chart.id);
              setCommentsOpen(true);
            }}
          />
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-1)] px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <ChartIcon />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight">This dashboard is empty</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-muted)]">
            {canEdit ? "Add your first chart — build it yourself, or describe it and let AI build it." : "No charts have been added yet."}
          </p>
          {canEdit && datasets.length > 0 && (
            <div className="mx-auto mt-6 grid max-w-xl gap-3 sm:grid-cols-2">
              <button
                onClick={() => setBuilder({})}
                className="group rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left shadow-sm transition-colors hover:border-[var(--accent)]/60"
              >
                <span className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">Build a chart</span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">Pick a dataset, a visual and fields, with a live preview.</span>
              </button>
              <button
                onClick={() => setAskAi(true)}
                className="group rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 text-left shadow-sm transition-colors hover:border-[var(--accent)]/60"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                  <span className="text-[var(--accent)]">
                    <SparkleIcon />
                  </span>
                  Ask AI
                </span>
                <span className="mt-1 block text-xs text-[var(--text-muted)]">Describe it in plain words — &ldquo;sales by region&rdquo;.</span>
              </button>
            </div>
          )}
        </div>
      )}

      {builder && (
        <ChartBuilder
          dashboardId={dashboardId}
          datasets={datasets}
          chart={builder.chart}
          onClose={() => setBuilder(null)}
          onSaved={load}
        />
      )}
      {askAi && <AiPromptDialog dashboardId={dashboardId} datasets={datasets} onCreated={load} onClose={() => setAskAi(false)} />}
      <CommentsPanel
        dashboardId={dashboardId}
        open={commentsOpen}
        onClose={() => {
          setCommentsOpen(false);
          setFocusComment(null);
        }}
        charts={dashboard.charts ?? []}
        chartFilter={commentChart}
        onChartFilter={setCommentChart}
        focusId={focusComment}
        state={comments}
      />
    </div>
  );
}

export default function DashboardView({ dashboardId }: { dashboardId: number }) {
  return (
    <RequireAuth>
      <DashboardDetail dashboardId={dashboardId} />
    </RequireAuth>
  );
}
