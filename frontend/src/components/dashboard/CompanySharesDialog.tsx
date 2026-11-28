"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal, BTN_PRIMARY, BTN_SECONDARY, FIELD_INPUT, FIELD_LABEL } from "@/components/Modal";
import { api, ApiError, type CompanyShare, type RowFilter } from "@/lib/api";
import { mailtoHref, SHARE_BTN } from "@/components/PendingInvites";
import { useT, translate } from "@/i18n/ui";

export type Column = { name: string; label: string };

const OPS: { value: RowFilter["operator"]; label: string }[] = [
  { value: "=", label: "is" },
  { value: "!=", label: "is not" },
  { value: "in", label: "is any of" },
  { value: "contains", label: "contains" },
];

export function describe(filters: RowFilter[], columns: Column[]): string {
  if (!filters.length) return translate("All rows");
  return filters
    .map((f) => {
      const label = columns.find((c) => c.name === f.field)?.label ?? f.field;
      const op = OPS.find((o) => o.value === f.operator)?.label ?? f.operator;
      const value = Array.isArray(f.value) ? f.value.join(", ") : f.value;
      return `${label} ${op} ${value}`;
    })
    .join(" and ");
}

/** One editable "only rows where …" condition. Values are suggested from the data itself. */
export function FilterRow({
  dashboardId,
  columns,
  filter,
  onChange,
  onRemove,
}: {
  dashboardId: number;
  columns: Column[];
  filter: RowFilter;
  onChange: (f: RowFilter) => void;
  onRemove: () => void;
}) {
  const tr = useT();
  const [values, setValues] = useState<string[]>([]);
  useEffect(() => {
    if (!filter.field) return;
    let alive = true;
    api
      .get<{ values: string[] }>(`/dashboards/${dashboardId}/slicer-values?field=${encodeURIComponent(filter.field)}`)
      .then((r) => alive && setValues(r.values))
      .catch(() => alive && setValues([]));
    return () => {
      alive = false;
    };
  }, [dashboardId, filter.field]);

  const listId = `vals-${filter.field}`;
  const text = Array.isArray(filter.value) ? filter.value.join(", ") : filter.value;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2">
      <select
        value={filter.field}
        onChange={(e) => onChange({ ...filter, field: e.target.value, value: "" })}
        className={`${FIELD_INPUT} !w-auto min-w-0 flex-1`}
        aria-label={tr("Field")}
      >
        {columns.map((c) => (
          <option key={c.name} value={c.name}>
            {tr(c.label)}
          </option>
        ))}
      </select>
      <select
        value={filter.operator}
        onChange={(e) => onChange({ ...filter, operator: e.target.value as RowFilter["operator"] })}
        className={`${FIELD_INPUT} !w-auto`}
        aria-label={tr("Condition")}
      >
        {OPS.map((o) => (
          <option key={o.value} value={o.value}>
            {tr(o.label)}
          </option>
        ))}
      </select>
      <input
        list={listId}
        value={text}
        onChange={(e) =>
          onChange({
            ...filter,
            value: filter.operator === "in" ? e.target.value.split(",").map((v) => v.trimStart()) : e.target.value,
          })
        }
        placeholder={filter.operator === "in" ? tr("Lagos, Accra") : tr("Value")}
        className={`${FIELD_INPUT} min-w-[8rem] flex-1`}
        aria-label={tr("Value")}
      />
      <datalist id={listId}>
        {values.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <button type="button" onClick={onRemove} className="px-1 text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label={tr("Remove condition")}>
        ✕
      </button>
    </div>
  );
}

export default function CompanySharesDialog({
  dashboardId,
  dashboardName,
  columns,
  open,
  onClose,
}: {
  dashboardId: number;
  dashboardName: string;
  columns: Column[];
  open: boolean;
  onClose: () => void;
}) {
  const tr = useT();
  const [shares, setShares] = useState<CompanyShare[] | null>(null);
  const [email, setEmail] = useState("");
  const [filters, setFilters] = useState<RowFilter[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CompanyShare | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api
      .get<CompanyShare[]>(`/dashboards/${dashboardId}/company-shares`)
      .then((rows) => alive && setShares(rows))
      .catch(() => alive && setShares([]));
    return () => {
      alive = false;
    };
  }, [open, dashboardId]);

  const cleaned = (list: RowFilter[]) =>
    list
      .map((f) => ({ ...f, value: Array.isArray(f.value) ? f.value.map((v) => v.trim()).filter(Boolean) : f.value.trim() }))
      .filter((f) => f.field && (Array.isArray(f.value) ? f.value.length : f.value));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const share = await api.post<CompanyShare>(`/dashboards/${dashboardId}/company-shares`, {
        email,
        row_filters: cleaned(filters),
      });
      setCreated(share);
      setShares((prev) => [share, ...(prev ?? [])]);
      setEmail("");
      setFilters([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Couldn't share the dashboard."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(share: CompanyShare) {
    const who = share.company ?? share.email;
    if (!confirm(tr("Stop sharing “{dashboardName}” with {who}? They lose access immediately.", { dashboardName: dashboardName, who: who }))) return;
    try {
      await api.del(`/company-shares/${share.id}`);
      setShares((prev) => (prev ?? []).filter((s) => s.id !== share.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tr("Couldn't stop sharing."));
    }
  }

  const statusChip = (s: CompanyShare) =>
    s.status === "active" ? (
      <span className="rounded-full bg-[var(--status-good)]/12 px-2 py-0.5 text-[11px] font-medium text-[var(--status-good)]">{tr("Active")}</span>
    ) : s.status === "pending" ? (
      <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">{tr("Waiting to accept")}</span>
    ) : (
      <span className="rounded-full bg-[var(--status-warning)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">{tr("Link expired")}</span>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={tr("Share with another company")}
      description={tr("Give a partner's whole workspace live, read-only access to “{dashboardName}”. Their own admins decide who on their team sees it.", { dashboardName: dashboardName })}
      footer={
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          {tr("Done")}
        </button>
      }
    >
      <div className="px-5 py-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className={FIELD_LABEL} htmlFor="share-email">
            {tr("Partner contact's email")}
          </label>
          <input
            id="share-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={tr("admin@partnercompany.com")}
            className={FIELD_INPUT}
            data-autofocus
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {tr("They'll get a link to accept for their company. No account yet? They can create one for free.")}
          </p>
        </div>

        <div>
          <span className={FIELD_LABEL}>{tr("Which rows can they see?")}</span>
          {filters.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              {tr("All rows.")}{" "}
              {columns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters([{ field: columns[0]!.name, operator: "=", value: "" }])}
                  className="font-medium text-[var(--accent)] hover:underline"
                >
                  {tr("Only show their own data…")}
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
              {filters.length < 5 && (
                <button
                  type="button"
                  onClick={() => setFilters((cur) => [...cur, { field: columns[0]!.name, operator: "=", value: "" }])}
                  className="self-start text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  {tr("+ And another condition")}
                </button>
              )}
              <p className="text-xs text-[var(--text-muted)]">
                {tr("Applied to every chart, filter, export and AI answer they see. You can change it later.")}
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}
        <div>
          <button type="submit" disabled={busy || !email} className={BTN_PRIMARY}>
            {busy ? tr("Sharing…") : tr("Share dashboard")}
          </button>
        </div>
      </form>

      {created?.share_url && (
        <div className="mt-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-3.5 text-sm" role="status">
          <p className="text-[var(--text-primary)]">
            {created.email_sent ? (
              <>
                {tr("Sent to")} <span className="font-semibold">{created.email}</span>.
              </>
            ) : (
              <>
                {tr("Created for")} <span className="font-semibold">{created.email}</span>{tr(", but the email couldn't be sent.")}
              </>
            )}{" "}
            <span className="text-[var(--text-secondary)]">{tr("You can also send them this link (valid 14 days):")}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 basis-full truncate rounded-md bg-[var(--surface-1)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]">
              {created.share_url}
            </code>
            <a
              href={mailtoHref(
                created.email ?? "",
                `${dashboardName} — shared with your company on Daha BI`,
                `Hi,\n\nI've shared the "${dashboardName}" dashboard with your company on Daha BI. Open it here (the link works for 14 days):\n${created.share_url}\n\nBest regards`
              )}
              className={SHARE_BTN}
              title={tr("Opens your email app with the message written for you")}
            >
              {tr("Send from my email")}
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(created.share_url!);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  window.prompt(tr("Copy this link:"), created.share_url);
                }
              }}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]"
            >
              {copied ? tr("Copied ✓") : tr("Copy link")}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${dashboardName} — shared with your company on Daha BI: ${created.share_url}`)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]"
            >
              {tr("Share on WhatsApp")}
            </a>
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {tr("Companies with access")} {shares ? `(${shares.length})` : ""}
        </p>
        {shares === null && <div className="h-14 animate-pulse rounded-lg bg-[var(--surface-2)]" />}
        {shares?.length === 0 && <p className="text-sm text-[var(--text-muted)]">{tr("Not shared with any company yet.")}</p>}
        {!!shares?.length && (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {shares.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-[var(--text-primary)]">{s.company ?? s.email}</span>
                    {statusChip(s)}
                  </span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">
                    {s.company ? `${s.email} · ` : ""}{tr("Sees:")} {describe(s.row_filters, columns)}
                  </span>
                </span>
                <button type="button" onClick={() => revoke(s)} className="text-xs text-[var(--status-critical)] hover:opacity-80">
                  {s.status === "active" ? tr("Stop sharing") : tr("Cancel")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </Modal>
  );
}
