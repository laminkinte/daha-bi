import type { BillingInterval } from "@/lib/api";

export function yearlySavingsPercent(monthlyCents: number, yearlyCents: number): number {
  if (monthlyCents <= 0 || yearlyCents <= 0) return 0;
  return Math.max(0, Math.round((1 - yearlyCents / (monthlyCents * 12)) * 100));
}

export default function BillingIntervalToggle({
  value,
  onChange,
  savingsPercent,
}: {
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  savingsPercent?: number;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-1)] p-1 text-sm">
      {(["monthly", "yearly"] as BillingInterval[]).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors ${
            value === opt
              ? "bg-[var(--series-1)] text-white"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
        >
          {opt === "monthly" ? "Monthly" : "Yearly"}
          {opt === "yearly" && savingsPercent ? (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                value === "yearly" ? "bg-white/20 text-white" : "bg-[var(--status-good)]/15 text-[var(--status-good)]"
              }`}
            >
              Save {savingsPercent}%
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
