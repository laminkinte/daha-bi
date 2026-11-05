"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { ICON_KEYS, LandingIcon } from "@/lib/landing-icons";
import {
  api,
  ApiError,
  type LandingFaq,
  type LandingFeature,
  type LandingHero,
  type LandingStat,
  type LandingStep,
  type PricingTier,
  type SiteSettings,
} from "@/lib/api";

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--page-plane)] px-3 py-2 text-sm outline-none focus:border-[var(--series-1)]";
const labelClass = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";

function SectionCard({
  title,
  description,
  children,
  onSave,
  saving,
  saved,
  error,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-5">
      <h2 className="font-medium text-[var(--text-primary)]">{title}</h2>
      <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
      {error && <p className="mt-3 text-sm text-[var(--status-critical)]">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && <span className="text-sm text-[var(--status-good)]">Saved — live on the site now.</span>}
      </div>
    </div>
  );
}

function useSaveSetting<T>(key: string) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(value: T) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.put(`/admin/site-settings/${key}`, { value });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return { save, saving, saved, error };
}

function HeroSection({ initial }: { initial: LandingHero }) {
  const [hero, setHero] = useState(initial);
  const { save, saving, saved, error } = useSaveSetting<LandingHero>("landing_hero");

  return (
    <SectionCard
      title="Hero"
      description="The big headline at the top of the welcome page."
      onSave={() => save(hero)}
      saving={saving}
      saved={saved}
      error={error}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Headline (before highlight)</label>
          <input value={hero.headline_prefix} onChange={(e) => setHero({ ...hero, headline_prefix: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Highlighted phrase</label>
          <input value={hero.headline_highlight} onChange={(e) => setHero({ ...hero, headline_highlight: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Headline (after highlight)</label>
          <input value={hero.headline_suffix} onChange={(e) => setHero({ ...hero, headline_suffix: e.target.value })} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Subheadline</label>
        <textarea
          value={hero.subheadline}
          onChange={(e) => setHero({ ...hero, subheadline: e.target.value })}
          rows={2}
          className={inputClass}
        />
      </div>
    </SectionCard>
  );
}

function StatsSection({ initial }: { initial: LandingStat[] }) {
  const [stats, setStats] = useState(initial);
  const { save, saving, saved, error } = useSaveSetting<LandingStat[]>("landing_stats");

  function update(i: number, patch: Partial<LandingStat>) {
    setStats(stats.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  return (
    <SectionCard
      title="Stats bar"
      description="The row of numbers below the hero (e.g. 180+ world currencies)."
      onSave={() => save(stats)}
      saving={saving}
      saved={saved}
      error={error}
    >
      {stats.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={s.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="Value, e.g. 180+"
            className={`${inputClass} w-32`}
          />
          <input
            value={s.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Label"
            className={inputClass}
          />
          <button
            onClick={() => setStats(stats.filter((_, idx) => idx !== i))}
            className="shrink-0 text-xs text-[var(--status-critical)]"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={() => setStats([...stats, { value: "", label: "" }])}
        className="self-start rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
      >
        + Add stat
      </button>
    </SectionCard>
  );
}

function StepsSection({ initial }: { initial: LandingStep[] }) {
  const [steps, setSteps] = useState(initial);
  const { save, saving, saved, error } = useSaveSetting<LandingStep[]>("landing_steps");

  function update(i: number, patch: Partial<LandingStep>) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  return (
    <SectionCard
      title="How it works"
      description="The 3-step walkthrough section."
      onSave={() => save(steps)}
      saving={saving}
      saved={saved}
      error={error}
    >
      {steps.map((s, i) => (
        <div key={i} className="rounded-md border border-[var(--border)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-muted)]">Step {i + 1}</span>
            <button onClick={() => setSteps(steps.filter((_, idx) => idx !== i))} className="text-xs text-[var(--status-critical)]">
              Remove
            </button>
          </div>
          <input
            value={s.title}
            onChange={(e) => update(i, { title: e.target.value })}
            placeholder="Title"
            className={`${inputClass} mt-2`}
          />
          <textarea
            value={s.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="Description"
            rows={2}
            className={`${inputClass} mt-2`}
          />
        </div>
      ))}
      <button
        onClick={() => setSteps([...steps, { title: "", description: "" }])}
        className="self-start rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
      >
        + Add step
      </button>
    </SectionCard>
  );
}

function FeaturesSection({ initial }: { initial: LandingFeature[] }) {
  const [features, setFeatures] = useState(initial);
  const { save, saving, saved, error } = useSaveSetting<LandingFeature[]>("landing_features");

  function update(i: number, patch: Partial<LandingFeature>) {
    setFeatures(features.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  return (
    <SectionCard
      title="Features grid"
      description="The 'Everything you need' grid of feature cards."
      onSave={() => save(features)}
      saving={saving}
      saved={saved}
      error={error}
    >
      {features.map((f, i) => (
        <div key={i} className="rounded-md border border-[var(--border)] p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--series-1)]/10 text-[var(--series-1)]">
                <LandingIcon name={f.icon} />
              </span>
              <select
                value={f.icon}
                onChange={(e) => update(i, { icon: e.target.value })}
                className="rounded border border-[var(--border)] bg-[var(--page-plane)] px-2 py-1 text-xs"
              >
                {ICON_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={() => setFeatures(features.filter((_, idx) => idx !== i))} className="text-xs text-[var(--status-critical)]">
              Remove
            </button>
          </div>
          <input
            value={f.title}
            onChange={(e) => update(i, { title: e.target.value })}
            placeholder="Title"
            className={`${inputClass} mt-2`}
          />
          <textarea
            value={f.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="Description"
            rows={2}
            className={`${inputClass} mt-2`}
          />
        </div>
      ))}
      <button
        onClick={() => setFeatures([...features, { icon: ICON_KEYS[0], title: "", description: "" }])}
        className="self-start rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
      >
        + Add feature
      </button>
    </SectionCard>
  );
}

function FaqsSection({ initial }: { initial: LandingFaq[] }) {
  const [faqs, setFaqs] = useState(initial);
  const { save, saving, saved, error } = useSaveSetting<LandingFaq[]>("landing_faqs");

  function update(i: number, patch: Partial<LandingFaq>) {
    setFaqs(faqs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  return (
    <SectionCard
      title="FAQ"
      description="The frequently-asked-questions accordion."
      onSave={() => save(faqs)}
      saving={saving}
      saved={saved}
      error={error}
    >
      {faqs.map((f, i) => (
        <div key={i} className="rounded-md border border-[var(--border)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-muted)]">Question {i + 1}</span>
            <button onClick={() => setFaqs(faqs.filter((_, idx) => idx !== i))} className="text-xs text-[var(--status-critical)]">
              Remove
            </button>
          </div>
          <input
            value={f.question}
            onChange={(e) => update(i, { question: e.target.value })}
            placeholder="Question"
            className={`${inputClass} mt-2`}
          />
          <textarea
            value={f.answer}
            onChange={(e) => update(i, { answer: e.target.value })}
            placeholder="Answer"
            rows={2}
            className={`${inputClass} mt-2`}
          />
        </div>
      ))}
      <button
        onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}
        className="self-start rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
      >
        + Add question
      </button>
    </SectionCard>
  );
}

function PricingSection({ initial }: { initial: PricingTier[] }) {
  const [tiers, setTiers] = useState(initial);
  const { save, saving, saved, error } = useSaveSetting<PricingTier[]>("pricing_tiers");

  function update(i: number, patch: Partial<PricingTier>) {
    setTiers(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  return (
    <SectionCard
      title="Pricing"
      description="What each tier costs and includes — this is also exactly what gets charged at checkout, so changes here take effect immediately."
      onSave={() => save(tiers)}
      saving={saving}
      saved={saved}
      error={error}
    >
      {tiers.map((t, i) => (
        <div key={t.plan} className="rounded-md border border-[var(--border)] p-3">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[var(--page-plane)] px-2 py-0.5 text-xs font-medium capitalize text-[var(--text-secondary)]">
              {t.plan}
            </span>
            {t.plan !== "free" && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={t.highlighted}
                  onChange={(e) => update(i, { highlighted: e.target.checked })}
                />
                &quot;Most popular&quot; badge
              </label>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className={labelClass}>Name</label>
              <input value={t.name} onChange={(e) => update(i, { name: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Price ($/mo)</label>
              <input
                type="number"
                min={0}
                value={t.amount_usd_cents / 100}
                onChange={(e) =>
                  update(i, { amount_usd_cents: Math.max(0, Math.round(Number(e.target.value) * 100)) })
                }
                disabled={t.plan === "free"}
                className={`${inputClass} disabled:opacity-60`}
              />
            </div>
            <div>
              <label className={labelClass}>Price ($/yr)</label>
              <input
                type="number"
                min={0}
                value={t.amount_usd_cents_yearly / 100}
                onChange={(e) =>
                  update(i, { amount_usd_cents_yearly: Math.max(0, Math.round(Number(e.target.value) * 100)) })
                }
                disabled={t.plan === "free"}
                className={`${inputClass} disabled:opacity-60`}
              />
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Period text (monthly)</label>
              <input value={t.period} onChange={(e) => update(i, { period: e.target.value })} className={inputClass} />
            </div>
          </div>
          <div className="mt-2">
            <label className={labelClass}>Tagline</label>
            <input value={t.tagline} onChange={(e) => update(i, { tagline: e.target.value })} className={inputClass} />
          </div>
          <div className="mt-2">
            <label className={labelClass}>Features (one per line)</label>
            <textarea
              value={t.features.join("\n")}
              onChange={(e) => update(i, { features: e.target.value.split("\n") })}
              rows={4}
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

function ContentEditor() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SiteSettings>("/site-settings")
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load site content."));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Site Content</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Edit the welcome page and pricing — changes go live immediately, no deploy needed.
      </p>

      {error && <p className="mt-4 text-sm text-[var(--status-critical)]">{error}</p>}
      {!settings && !error && <p className="mt-6 text-sm text-[var(--text-muted)]">Loading...</p>}

      {settings && (
        <div className="mt-6 flex flex-col gap-6">
          <PricingSection initial={settings.pricing_tiers} />
          <HeroSection initial={settings.landing_hero} />
          <StatsSection initial={settings.landing_stats} />
          <StepsSection initial={settings.landing_steps} />
          <FeaturesSection initial={settings.landing_features} />
          <FaqsSection initial={settings.landing_faqs} />
        </div>
      )}
    </div>
  );
}

export default function AdminContentPage() {
  return (
    <RequireAuth>
      <ContentEditor />
    </RequireAuth>
  );
}
