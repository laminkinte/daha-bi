/* eslint-disable @next/next/no-img-element -- brand logos come from the API at runtime, any size */
import { brandCss, brandInitial } from "@/lib/brand";
import type { Branding } from "@/lib/api";

/**
 * Re-themes the page's accent colour to a workspace's brand colour. Safe to inline: the colour
 * is validated as #rrggbb by the API and brandCss() only ever emits hex/rgba values.
 */
export function BrandStyle({ color }: { color: string | null | undefined }) {
  const css = brandCss(color);
  return css ? <style data-brand="">{css}</style> : null;
}

/** The brand's logo, or its initial on the accent colour when no logo is set. */
export function BrandLogo({ branding, size = 32 }: { branding: Branding | null | undefined; size?: number }) {
  if (branding?.logo_url) {
    return (
      <img
        src={branding.logo_url}
        alt={branding.name}
        className="shrink-0 object-contain"
        style={{ height: size, maxWidth: size * 4 }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[10px] font-bold text-white"
      style={{ width: size, height: size, background: "var(--accent-glow)", fontSize: size * 0.45 }}
      aria-hidden
    >
      {brandInitial(branding)}
    </span>
  );
}

export function PoweredBy() {
  return (
    <a
      href="https://github.com/laminkinte/daha-bi"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
    >
      <span className="flex h-4 w-4 items-center justify-center rounded bg-[#0b7a5e] text-[9px] font-bold text-white">D</span>
      Powered by Daha BI
    </a>
  );
}
