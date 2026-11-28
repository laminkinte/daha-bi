import { translate, uiLocaleTag } from "@/i18n/ui";
export type ValueFormat = "number" | "currency" | "percent";

export type CurrencyOption = { code: string; label: string };

// African currencies surfaced first, matching the product's core market.
const PRIORITY_CURRENCIES = [
  "NGN",
  "KES",
  "GHS",
  "ZAR",
  "EGP",
  "MAD",
  "TZS",
  "UGX",
  "XOF",
  "XAF",
  "ETB",
  "RWF",
  "USD",
  "EUR",
  "GBP",
];

function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function buildCurrencyList(): CurrencyOption[] {
  let codes: string[];
  try {
    codes = Intl.supportedValuesOf("currency");
  } catch {
    codes = PRIORITY_CURRENCIES;
  }

  const priority = PRIORITY_CURRENCIES.filter((c) => codes.includes(c));
  const rest = codes.filter((c) => !PRIORITY_CURRENCIES.includes(c)).sort();

  return [...priority, ...rest].map((code) => ({
    code,
    label: `${currencySymbol(code)} ${currencyName(code)}`,
  }));
}

export const CURRENCIES: CurrencyOption[] = buildCurrencyList();

export function formatValue(
  value: number,
  format: ValueFormat = "number",
  currency = "NGN"
): string {
  if (format === "currency") {
    try {
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${currency} ${value.toLocaleString(uiLocaleTag())}`;
    }
  }

  if (format === "percent") {
    return `${value.toLocaleString(uiLocaleTag(), { maximumFractionDigits: 1 })}%`;
  }

  return value.toLocaleString(uiLocaleTag());
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Makes ISO period labels readable: "2025-03" → "Mar 2025", "2025-03-14" → "14 Mar 2025". Others pass through. */
export function formatPeriod(label: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(label));
  if (!m) return String(label);
  const month = translate(MONTH_SHORT[Number(m[2]) - 1]);
  if (!month) return String(label);
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

/**
 * Short form for axis ticks and tight spaces: 15,725 → "15.7K", 2,400,000 → "2.4M". Keeps the
 * currency symbol / percent sign so an axis still says what it measures.
 */
export function formatCompact(value: number, format: ValueFormat = "number", currency = "NGN"): string {
  if (!Number.isFinite(value)) return "";
  if (format === "percent") return `${value.toLocaleString(uiLocaleTag(), { maximumFractionDigits: 1 })}%`;
  const compact = (opts: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1, ...opts }).format(value);
  if (format === "currency") {
    try {
      return compact({ style: "currency", currency });
    } catch {
      return `${currency} ${compact({})}`;
    }
  }
  return compact({});
}
