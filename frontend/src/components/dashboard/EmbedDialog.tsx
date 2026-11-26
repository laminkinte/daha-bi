"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal, BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL } from "@/components/Modal";
import { api, ApiError, type DashboardEmbed, type RowFilter } from "@/lib/api";
import { FilterRow, describe, type Column } from "./CompanySharesDialog";

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          window.prompt("Copy:", text);
        }
      }}
      className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

const EXPIRY: { value: string; label: string }[] = [
  { value: "", label: "Never" },
  { value: "7", label: "In 7 days" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In 1 year" },
];

export default function EmbedDialog({
  dashboardId,
  dashboardName,
  columns,
  sharedBy,
  open,
  onClose,
}: {
  dashboardId: number;
  dashboardName: string;
  columns: Column[];
  /** Set for a partner: their embeds always stay within what this company shares with them. */
  sharedBy?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [embeds, setEmbeds] = useState<DashboardEmbed[] | null>(null);
  const [name, setName] = useState("");
  const [domains, setDomains] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [filters, setFilters] = useState<RowFilter[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .get<DashboardEmbed[]>(`/dashboards/${dashboardId}/embeds`)
      .then((rows) => alive && setEmbeds(rows))
      .catch(() => alive && setEmbeds([]));
    return () => {
      alive = false;
    };
  }, [open, dashboardId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const embed = await api.post<DashboardEmbed>(`/dashboards/${dashboardId}/embeds`, {
        name,
        allowed_domains: domains
          .split(/[\s,]+/)
          .map((d) => d.trim())
          .filter(Boolean),
        expires_in_days: expiry ? Number(expiry) : null,
        row_filters: filters
          .map((f) => ({ ...f, value: Array.isArray(f.value) ? f.value.map((v) => v.trim()).filter(Boolean) : f.value.trim() }))
          .filter((f) => (Array.isArray(f.value) ? f.value.length : f.value)),
      });
      setEmbeds((prev) => [embed, ...(prev ?? [])]);
      setFresh(embed.id);
      setName("");
      setDomains("");
      setFilters([]);
    } catch (err) {
      setError(err instanceof ApiError ? (err.errors ? Object.values(err.errors)[0]?.[0] : null) ?? err.message : "Couldn't create the embed.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(embed: DashboardEmbed) {
    if (!confirm(`Revoke “${embed.name}”? It stops working on every site using it.`)) return;
    try {
      await api.del(`/embeds/${embed.id}`);
      setEmbeds((prev) => (prev ?? []).filter((x) => x.id !== embed.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't revoke the embed.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Embed in a website or app"
      description={`Put a live, read-only “${dashboardName}” inside your own site, portal or intranet with a copy-paste code.`}
      footer={
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          Done
        </button>
      }
    >
      <div className="px-5 py-4">
        {sharedBy && (
          <p className="mb-4 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Embeds show only the data {sharedBy} shares with your company, and stop working if they stop sharing.
          </p>
        )}

        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={FIELD_LABEL} htmlFor="embed-name">
              Name (for you)
            </label>
            <input
              id="embed-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer portal, Intranet home page"
              className={FIELD_INPUT}
              data-autofocus
            />
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="embed-domains">
              Only on these websites
            </label>
            <textarea
              id="embed-domains"
              rows={2}
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder={"portal.yourcompany.com\n*.yourcompany.com"}
              className={`${FIELD_INPUT} resize-none font-mono text-xs`}
            />
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">Leave empty to allow any site. Recommended: list them.</p>
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="embed-expiry">
              Expires
            </label>
            <select id="embed-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={FIELD_INPUT}>
              {EXPIRY.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <span className={FIELD_LABEL}>Which rows does it show?</span>
            {filters.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">
                {sharedBy ? "Everything you can see." : "All rows."}{" "}
                {columns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilters([{ field: columns[0]!.name, operator: "=", value: "" }])}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    Limit the data…
                  </button>
                )}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {filters.map((f, i) => (
                  <FilterRow
                    key={i}
                    dashboardId={dashboardId}
                    columns={columns}
                    filter={f}
                    onChange={(nf) => setFilters((cur) => cur.map((x, j) => (j === i ? nf : x)))}
                    onRemove={() => setFilters((cur) => cur.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-sm text-[var(--status-critical)] sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy || !name.trim()} className={BTN_PRIMARY}>
              {busy ? "Creating…" : "Create embed code"}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Embed codes {embeds ? `(${embeds.length})` : ""}
          </p>
          {embeds === null && <div className="h-16 animate-pulse rounded-lg bg-[var(--surface-2)]" />}
          {embeds?.length === 0 && <p className="text-sm text-[var(--text-muted)]">None yet.</p>}
          <ul className="flex flex-col gap-3">
            {embeds?.map((e) => (
              <li
                key={e.id}
                className={`rounded-xl border p-3 ${fresh === e.id ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/15" : "border-[var(--border)]"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--text-primary)]">{e.name}</span>
                  {e.live ? (
                    <span className="rounded-full bg-[var(--status-good)]/12 px-2 py-0.5 text-[11px] font-medium text-[var(--status-good)]">Live</span>
                  ) : (
                    <span className="rounded-full bg-[var(--status-warning)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">Expired</span>
                  )}
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {e.view_count} view{e.view_count === 1 ? "" : "s"}
                    {e.expires_at && ` · until ${new Date(e.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`}
                  </span>
                  <button type="button" onClick={() => revoke(e)} className="ml-auto text-xs text-[var(--status-critical)] hover:opacity-80">
                    Revoke
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {e.allowed_domains.length ? `Only on ${e.allowed_domains.join(", ")}` : "Any website"} · Shows:{" "}
                  {describe(e.row_filters, columns)}
                  {e.inherits_share_filters && " (within your shared data)"}
                </p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--surface-2)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {e.snippet}
                </pre>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopyBtn text={e.snippet} label="Copy embed code" />
                  <CopyBtn text={e.url} label="Copy link" />
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Preview ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
