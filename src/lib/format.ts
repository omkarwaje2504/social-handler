// Number formatting shared by server pages and client charts.
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

/** 1,284 below 10,000; 12.9K / 4.2M above. */
export const fmtCompact = (n: number) => (Math.abs(n) >= 10000 ? compact.format(n) : full.format(Math.round(n * 10) / 10));
/** 1,284,190 (one decimal at most). */
export const fmtFull = (n: number) => full.format(Math.round(n * 10) / 10);
