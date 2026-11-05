import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] sm:text-[11px]">
          {label}
        </div>
        {icon && (
          <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] sm:flex">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-[22px] font-semibold leading-none tracking-tight tabular-nums text-[var(--text-primary)] sm:text-[26px]">
        {value}
      </div>
      {hint && <div className="mt-1.5 hidden text-xs text-[var(--text-muted)] sm:block">{hint}</div>}
    </div>
  );
}
