import type { Branding } from "./api";

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: RGB): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Nudge a colour toward `target` until it reaches `ratio` contrast against `against`. */
function ensureContrast(c: RGB, against: RGB, target: RGB, ratio: number): RGB {
  let out = c;
  for (let t = 0; t <= 1 && contrast(out, against) < ratio; t += 0.05) out = mix(c, target, t);
  return out;
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const DARK_PLANE: RGB = [10, 16, 18];

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

/**
 * CSS overriding the --accent tokens with a workspace's brand colour — for both themes, and
 * adjusted so white text on accent buttons stays readable (≥4.5:1) and accent text stays
 * visible on the dark plane. Any brand colour works; a pale yellow just gets deepened.
 */
export function brandCss(color: string | null | undefined): string {
  const base = color ? hexToRgb(color) : null;
  if (!base) return "";

  const light = ensureContrast(base, WHITE, BLACK, 4.5);
  const lightHover = mix(light, BLACK, 0.12);
  const dark = ensureContrast(base, DARK_PLANE, WHITE, 4.5);
  const darkButton = ensureContrast(dark, WHITE, BLACK, 3); // white text on dark-mode buttons
  const vars = (accent: RGB, hover: RGB, softAlpha: number) =>
    `--accent:${toHex(accent)};--accent-hover:${toHex(hover)};--accent-soft:${rgba(accent, softAlpha)};--accent-contrast:#ffffff;` +
    `--accent-glow:linear-gradient(135deg, ${toHex(mix(accent, BLACK, 0.1))} 0%, ${toHex(accent)} 55%, ${toHex(mix(accent, WHITE, 0.35))} 140%);`;

  const darkVars = vars(darkButton, mix(darkButton, WHITE, 0.12), 0.16);
  return (
    `:root{${vars(light, lightHover, 0.1)}}` +
    `@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])){${darkVars}}}` +
    `:root[data-theme="dark"]{${darkVars}}`
  );
}

/** Mark shown in headers: the brand logo when set, else the workspace initial on the accent. */
export function brandInitial(branding: Branding | null | undefined): string {
  return (branding?.name?.trim()?.[0] ?? "D").toUpperCase();
}
