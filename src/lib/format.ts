/** Display formatting helpers used across analytical surfaces. */

export function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000)
    return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + "K";
  return String(n);
}

export function fullNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function percent(n: number, dp = 1): string {
  return `${n.toFixed(dp)}%`;
}

export function signedPercent(n: number, dp = 1): string {
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(dp)}%`;
}

export function currency(n: number, code = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: n < 10 ? 2 : 0,
  }).format(n);
}

export function position(n: number | null): string {
  return n == null ? "—" : String(n);
}
