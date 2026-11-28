"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type Branding, type Organization, type User } from "@/lib/api";
import { BrandLogo, BrandStyle, PoweredBy } from "@/components/BrandStyle";
import { useT } from "@/i18n/ui";

const PRESETS = ["#0b7a5e", "#1d4ed8", "#7c3aed", "#be123c", "#c2410c", "#0f766e", "#334155"];

/**
 * White-label settings: brand name, colour, logo and the "Powered by Daha BI" badge.
 * Applies to this workspace's app, its public links, dashboards it shares, and its embeds.
 */
export default function BrandingSection() {
  const tr = useT();
  const { user, updateUser } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [current, setCurrent] = useState<(Branding & { brand_name: string | null }) | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("");
  const [hide, setHide] = useState(false);
  const [logo, setLogo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user?.current_organization_id) return;
    api
      .get<Organization[]>("/organizations")
      .then((orgs) => {
        const o = orgs.find((x) => x.id === user.current_organization_id) ?? null;
        setOrg(o);
        if (!o) return;
        return api.get<Branding & { brand_name: string | null }>(`/organizations/${o.id}/branding`).then((b) => {
          setCurrent(b);
          setName(b.brand_name ?? "");
          setColor(b.color ?? "");
          setHide(b.hide_powered_by);
        });
      })
      .catch(() => {});
  }, [user?.current_organization_id]);

  useEffect(() => {
    if (!logo) return;
    const url = URL.createObjectURL(logo);
    Promise.resolve().then(() => setPreview(url));
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  if (!org || !current) return null;
  const canManage = org.role === "owner" || org.role === "admin";
  if (!canManage) return null;

  const previewBranding: Branding = {
    name: name.trim() || org.name,
    color: color || null,
    logo_url: removeLogo ? null : (preview ?? current.logo_url),
    hide_powered_by: hide,
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!org) return;
    setSaving(true);
    setMessage(null);
    const form = new FormData();
    form.append("brand_name", name.trim());
    if (color) form.append("brand_color", color);
    form.append("brand_hide_powered_by", hide ? "1" : "0");
    if (logo) form.append("logo", logo);
    if (removeLogo && !logo) form.append("remove_logo", "1");
    try {
      const b = await api.post<Branding & { brand_name: string | null }>(`/organizations/${org.id}/branding`, form);
      setCurrent(b);
      setLogo(null);
      setPreview(null);
      setRemoveLogo(false);
      setMessage({ ok: true, text: "Branding saved — your workspace, shared dashboards and embeds now use it." });
      // Refresh the signed-in user so the sidebar re-themes immediately.
      api.get<User>("/user").then(updateUser).catch(() => {});
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? ((err.errors ? Object.values(err.errors)[0]?.[0] : null) ?? err.message) : tr("Couldn't save branding.") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5 sm:p-6">
      <h2 className="-mx-5 -mt-5 mb-4 border-b border-[var(--border)] px-5 py-3.5 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] sm:-mx-6 sm:-mt-6 sm:px-6">
        {tr("Branding")}
      </h2>
      <p className="text-sm text-[var(--text-secondary)]">
        {tr("Make Daha BI look like your company — on your workspace, public links, dashboards you share with partners, and embeds.")}
      </p>

      <form onSubmit={save} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="brand-name" className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
            {tr("Brand name")}
          </label>
          <input
            id="brand-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={org.name}
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{tr("Brand colour")}</span>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-[var(--text-primary)]" : "border-transparent"}`}
                style={{ background: c }}
                aria-label={tr("Use {c}", { c: c })}
              />
            ))}
            <label className="flex items-center gap-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-secondary)]">
              <input type="color" value={color || "#0b7a5e"} onChange={(e) => setColor(e.target.value)} className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" />
              {color || tr("Default")}
            </label>
            {color && (
              <button type="button" onClick={() => setColor("")} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                {tr("Reset")}
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{tr("Very light colours are deepened automatically so text stays readable.")}</p>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{tr("Logo")}</span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              {current.logo_url || logo ? tr("Replace logo") : tr("Upload logo")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  setLogo(e.target.files?.[0] ?? null);
                  setRemoveLogo(false);
                }}
              />
            </label>
            {(current.logo_url || logo) && !removeLogo && (
              <button
                type="button"
                onClick={() => {
                  setLogo(null);
                  setPreview(null);
                  setRemoveLogo(true);
                }}
                className="text-xs text-[var(--status-critical)] hover:opacity-80"
              >
                {tr("Remove")}
              </button>
            )}
            <span className="text-[11px] text-[var(--text-muted)]">{tr("PNG, JPG or WebP, up to 512 KB. A wide logo on a transparent background works best.")}</span>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          {tr("Hide the “Powered by Daha BI” badge on embeds and public links")}
        </label>

        {/* Live preview of an embedded dashboard header in the chosen brand. */}
        <div>
          <span className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{tr("Preview")}</span>
          <div className="brand-preview overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--page-plane)]">
            <BrandStyle color={color || null} />
            <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
              <BrandLogo branding={previewBranding} size={28} />
              <span className="text-sm font-semibold text-[var(--text-primary)]">{previewBranding.name}</span>
              <span className="ms-auto rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white">{tr("Button")}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-[var(--accent)]">{tr("Links and highlights use your colour")}</span>
              {!hide && <PoweredBy />}
            </div>
          </div>
        </div>

        {message && <p className={`text-sm ${message.ok ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"}`}>{tr(message.text)}</p>}
        <div>
          <button type="submit" disabled={saving} className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">
            {saving ? tr("Saving…") : tr("Save branding")}
          </button>
        </div>
      </form>
    </div>
  );
}
