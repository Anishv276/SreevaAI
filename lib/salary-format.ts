const KNOWN_CURRENCY_CODES = new Set([
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "SGD",
  "AED",
  "JPY",
  "CNY",
  "CHF",
  "HKD",
  "NZD",
]);
function normalizeAmount(amount: string): string {
  return amount.trim().replace(/[–—]/g, "-").replace(/\s+/g, " ");
}
export function splitSalaryValue(
  raw: string | null | undefined,
  fallbackCurrency = "INR",
): { amount: string; currency: string } {
  const cleaned = (raw || "").trim();
  if (!cleaned) {
    return { amount: "", currency: fallbackCurrency };
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  let currency = fallbackCurrency;
  if (parts.length > 0) {
    const last = parts[parts.length - 1]?.toUpperCase();
    if (last && KNOWN_CURRENCY_CODES.has(last)) {
      currency = last;
      parts.pop();
    }
  }
  if (parts[parts.length - 1]?.toUpperCase() === "LPA") {
    parts.pop();
  }
  return {
    amount: normalizeAmount(parts.join(" ")),
    currency,
  };
}
export function formatSalaryValue(
  amount: string,
  currency = "INR",
): string {
  const normalizedAmount = normalizeAmount(amount);
  if (!normalizedAmount) return "";
  return `${normalizedAmount} LPA ${currency}`;
}
