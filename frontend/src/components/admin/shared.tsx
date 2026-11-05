import { formatValue } from "@/lib/format-value";

/**
 * Formats an amount in minor units (kobo, cents, ...) using its own real currency — Paystack
 * payments settle in NGN kobo and Stripe payments in USD cents, so mixing them under one
 * currency label would misrepresent real amounts.
 */
export function money(minorUnits: number, currency: string) {
  return formatValue(minorUnits / 100, "currency", currency || "NGN");
}

export function PlanBadge({ plan, status }: { plan?: string; status?: string }) {
  const color =
    status === "past_due"
      ? "bg-[var(--status-critical)]/15 text-[var(--status-critical)]"
      : status === "trialing"
        ? "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"
        : plan === "free"
          ? "bg-[var(--page-plane)] text-[var(--text-muted)]"
          : "bg-[var(--status-good)]/15 text-[var(--status-good)]";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${color}`}>
      {plan} {status && status !== "active" ? `· ${status}` : ""}
    </span>
  );
}
