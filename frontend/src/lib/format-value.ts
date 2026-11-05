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
      return `${currency} ${value.toLocaleString()}`;
    }
  }

  if (format === "percent") {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }

  return value.toLocaleString();
}
