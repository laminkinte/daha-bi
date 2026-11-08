/** Daha BI logo mark: rising bars on the brand gradient. Used by the sidebar and auth screens. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[10px] text-white shadow-sm"
      style={{ width: size, height: size, background: "var(--accent-glow)" }}
      aria-hidden
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M5 19V11M12 19V5M19 19v-5" />
      </svg>
    </div>
  );
}
