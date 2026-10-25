const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 30000 → "30,000" */
export const fmtInt = (n: number) => int.format(n);

/** 1.04 → "$1.04"; 106 → "$106.00" with `fixed`. */
export const fmtUsd = (n: number, digits = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

/** 24800 → "24.8K", 1000000 → "$1M" style compact numbers. */
export function fmtK(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return fmtInt(n);
}

/** Percent with one decimal: 1.886 → "1.9%". */
export const fmtPct = (n: number) => `${n.toFixed(1)}%`;

/** ms → "15:21" local time. */
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** ms → "16:00 UTC". */
export const fmtUtc = (ms: number) => new Date(ms).toISOString().slice(11, 16) + " UTC";

/** Remaining ms → "02:14:37". */
export function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
