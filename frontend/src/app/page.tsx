"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { LandingIcon } from "@/lib/landing-icons";
import { api, type SiteSettings } from "@/lib/api";

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out ${visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

function AnimatedStatValue({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState<string>(value.replace(/\d+/, "0"));
  const match = value.match(/^(\d+)(.*)$/);

  useEffect(() => {
    const el = ref.current;
    if (!el || !match) return;
    const target = parseInt(match[1], 10);
    const suffix = match[2];

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const duration = 900;
        const start = performance.now();
        function tick(now: number) {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(eased * target) + suffix);
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} className="text-2xl font-semibold text-[var(--series-1)]">
      {match ? display : value}
    </div>
  );
}

function ProductPreview() {
  const bars = [55, 80, 45, 95, 65, 40];
  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface-1)] shadow-sm transition-all duration-500 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-critical)]/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-warning)]/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--status-good)]/60" />
        <span className="ml-3 text-xs text-[var(--text-muted)]">Regional Sales Overview</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <div className="col-span-2 rounded-lg border border-[var(--border)] p-3 sm:col-span-1">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Total revenue</div>
          <div className="mt-1 text-xl font-semibold text-[var(--text-primary)]">₦673,968</div>
          <div className="mt-0.5 text-[10px] text-[var(--status-good)]">↑ 12% this month</div>
        </div>
        <div className="col-span-2 rounded-lg border border-[var(--border)] p-3 sm:col-span-1">
          <div
            className="mx-auto h-14 w-14 rounded-full"
            style={{
              background:
                "conic-gradient(var(--series-1) 0 35%, var(--series-2) 35% 60%, var(--series-3) 60% 80%, var(--series-4) 80% 100%)",
            }}
          />
        </div>
        <div className="col-span-2 flex items-end gap-1.5 rounded-lg border border-[var(--border)] p-3">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${h}%`, background: `var(--series-${(i % 8) + 1})`, minHeight: 6 }}
            />
          ))}
        </div>
        <div className="col-span-2 rounded-lg border border-[var(--border)] p-3">
          <svg viewBox="0 0 100 40" className="h-full w-full" preserveAspectRatio="none">
            <polyline
              points="0,30 20,18 40,24 60,10 80,15 100,4"
              fill="none"
              stroke="var(--series-1)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--border)] py-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="font-medium text-[var(--text-primary)]">{question}</span>
        <span className="text-[var(--text-muted)]">
          <ChevronIcon open={open} />
        </span>
      </button>
      {open && <p className="mt-2 text-sm text-[var(--text-secondary)]">{answer}</p>}
    </div>
  );
}

function LandingPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  useEffect(() => {
    api.get<SiteSettings>("/site-settings").then(setSettings).catch(() => {});
  }, []);

  if (!settings) {
    return (
      <div className="min-h-screen bg-[var(--page-plane)]">
        <PublicHeader />
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--text-muted)]">
          Loading...
        </div>
      </div>
    );
  }

  const hero = settings.landing_hero;

  return (
    <div className="min-h-screen bg-[var(--page-plane)]">
      <PublicHeader />

      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold leading-tight text-[var(--text-primary)] sm:text-5xl">
          {hero.headline_prefix}{" "}
          <span className="text-[var(--series-1)]">{hero.headline_highlight}</span> {hero.headline_suffix}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-[var(--text-secondary)]">{hero.subheadline}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="rounded-md bg-[var(--series-1)] px-6 py-3 text-sm font-medium text-white"
          >
            Get started free
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            See pricing
          </Link>
        </div>
        <p className="mt-4 text-xs text-[var(--text-muted)]">No credit card required.</p>

        <Reveal className="mt-16 px-4" delay={150}>
          <ProductPreview />
        </Reveal>
      </section>

      <section className="border-y border-[var(--border)] bg-[var(--surface-1)] py-10">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 text-center sm:grid-cols-4">
          {settings.landing_stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 80}>
              <AnimatedStatValue value={s.value} />
              <div className="mt-1 text-xs text-[var(--text-muted)]">{s.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold text-[var(--text-primary)]">How it works</h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-3">
            {settings.landing_steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 120} className="text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--series-1)] text-sm font-semibold text-white">
                  {i + 1}
                </div>
                <h3 className="mt-4 font-medium text-[var(--text-primary)]">{step.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{step.description}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface-1)] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <h2 className="text-center text-2xl font-semibold text-[var(--text-primary)]">
              Everything you need, nothing you don&apos;t
            </h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {settings.landing_features.map(({ icon, title, description }, i) => (
              <Reveal key={title} delay={(i % 3) * 90}>
                <div className="group rounded-xl p-3 -m-3 transition-all duration-300 hover:-translate-y-1 hover:bg-[var(--page-plane)] hover:shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--series-1)]/10 text-[var(--series-1)] transition-transform duration-300 group-hover:scale-110">
                    <LandingIcon name={icon} />
                  </div>
                  <h3 className="mt-4 font-medium text-[var(--text-primary)]">{title}</h3>
                  <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <Reveal className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
            Start with the free plan, upgrade when you need to
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            No setup fees, no long-term contract. See what&apos;s included at every tier.
          </p>
          <ul className="mx-auto mt-6 flex max-w-md flex-col gap-2 text-left text-sm text-[var(--text-secondary)]">
            {[
              "Unlimited dashboards and charts",
              "CSV and MySQL data sources",
              "SQL & Python notebook",
              "One free public share link",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="text-[var(--status-good)]">
                  <CheckIcon />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-md bg-[var(--series-1)] px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-105"
          >
            Create your free account
          </Link>
        </Reveal>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface-1)] py-20">
        <Reveal className="mx-auto max-w-2xl px-6">
          <h2 className="text-center text-2xl font-semibold text-[var(--text-primary)]">
            Frequently asked questions
          </h2>
          <div className="mt-10">
            {settings.landing_faqs.map((f) => (
              <FaqItem key={f.question} question={f.question} answer={f.answer} />
            ))}
          </div>
        </Reveal>
      </section>

      <section className="border-t border-[var(--border)] py-20">
        <Reveal className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
            Ready to see your numbers clearly?
          </h2>
          <p className="mt-3 text-[var(--text-secondary)]">
            Create a free account and have your first dashboard up in minutes.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-block rounded-md bg-[var(--series-1)] px-6 py-3 text-sm font-medium text-white transition-transform hover:scale-105"
          >
            Get started free
          </Link>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    router.replace("/dashboards");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Redirecting...
      </div>
    );
  }

  return <LandingPage />;
}
