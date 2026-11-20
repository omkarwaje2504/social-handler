"use client";

// SVG charts with a hover layer. Rules (from the data-viz guide): colours come from the validated
// categorical order (--chart-1 … --chart-5) in a fixed order, one y-axis, thin marks (2px lines,
// ≤24px bars with a 4px rounded top), hairline grid, a legend only for 2+ series, a crosshair
// tooltip on lines and a per-bar tooltip on columns, and every chart has a "Show data" table.

import { useEffect, useId, useRef, useState } from "react";
import { fmtCompact, fmtFull } from "@/lib/format";

export type Point = { label: string; value: number };
export type Series = { name: string; values: number[] };

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/** Top of the y-axis: 4 equal steps of a "nice" size (1, 2, 2.5 or 5 × 10ⁿ); whole steps for counts. */
function niceMax(max: number, integer = false) {
  if (max <= 0) return integer ? 4 : 1;
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const step = m * pow;
    if (integer && (step < 1 || !Number.isInteger(step))) continue;
    if (step * 4 >= max) return step * 4;
  }
  return 40 * pow;
}

// Charts draw at their container's real width (measured), with a fixed height, so text and marks
// keep the same size from a phone to a 4K screen instead of scaling with the page.
const H = 196, PAD_L = 42, PAD_R = 12, PAD_T = 10, PAD_B = 26;
const plotH = H - PAD_T - PAD_B;

function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Legend({ series, kind }: { series: Series[]; kind: "line" | "rect" }) {
  if (series.length < 2) return null;
  return (
    <div className="chart-legend">
      {series.map((s, i) => (
        <span key={s.name}><i className={kind === "line" ? "line" : ""} style={{ background: COLORS[i % COLORS.length] }} />{s.name}</span>
      ))}
    </div>
  );
}

function DataTable({ labels, series, label = "Date" }: { labels: string[]; series: Series[]; label?: string }) {
  return (
    <details className="chart-table">
      <summary>Show data</summary>
      <div className="table-scroll">
        <table>
          <thead><tr><th>{label}</th>{series.map((s) => <th key={s.name} style={{ textAlign: "right" }}>{s.name}</th>)}</tr></thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={i}><td>{l}</td>{series.map((s) => <td key={s.name} style={{ textAlign: "right" }} className="num">{fmtFull(s.values[i] ?? 0)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Frame({ title, subtitle, hero, children, className = "" }: { title?: string; subtitle?: string; hero?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`chart ${className}`}>
      {(title || hero) && (
        <div className="chart-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {hero != null && <span className="chart-hero">{hero}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Empty({ title, subtitle, note }: { title?: string; subtitle?: string; note: string }) {
  return (
    <Frame title={title} subtitle={subtitle}>
      <div className="chart-empty">{note}</div>
    </Frame>
  );
}

function YAxis({ max, min = 0, W }: { max: number; min?: number; W: number }) {
  const steps = 4;
  const span = max - min || 1;
  return (
    <g>
      {Array.from({ length: steps + 1 }, (_, k) => min + (span * k) / steps).map((t, k) => {
        const y = PAD_T + plotH - ((t - min) / span) * plotH;
        return (
          <g key={k}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} className={t === 0 ? "chart-baseline" : "chart-gridline"} />
            <text x={PAD_L - 8} y={y + 4} textAnchor="end" className="chart-axis">{fmtCompact(t)}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Tooltip box placed over the plot at a fraction (0–1) of the width. */
function Tip({ at, title, rows }: { at: number; title: string; rows: { name: string; value: number; color: string }[] }) {
  const shift = at > 0.7 ? "-100%" : at < 0.3 ? "0%" : "-50%";
  return (
    <div className="chart-tip" style={{ left: `${at * 100}%`, top: 4, transform: `translateX(${shift})` }} role="status">
      <div className="t">{title}</div>
      {rows.map((r) => (
        <div className="r" key={r.name}><i style={{ background: r.color }} /><b>{fmtFull(r.value)}</b><span>{r.name}</span></div>
      ))}
    </div>
  );
}

/**
 * Change over time: one or more series on one y-axis. Hover (or arrow keys) moves a crosshair that
 * snaps to the nearest date and lists every series there.
 */
export function TrendChart({
  title, subtitle, labels, series, empty = "No data yet.", area = true, hero, height = H,
}: {
  title?: string; subtitle?: string; labels: string[]; series: Series[]; empty?: string; area?: boolean; hero?: React.ReactNode; height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const n = labels.length;
  const plotW = W - PAD_L - PAD_R;
  if (n < 2 || !series.length) return <Empty title={title} subtitle={subtitle} note={empty} />;
  const all = series.flatMap((s) => s.values);
  const rawMin = Math.min(...all), rawMax = Math.max(...all);
  const min = rawMin < 0 ? -niceMax(-rawMin) : 0;
  const max = niceMax(Math.max(rawMax, 0) || 1, all.every((v) => Number.isInteger(v)));
  const span = max - min || 1;
  const x = (i: number) => PAD_L + (i / (n - 1)) * plotW;
  const y = (v: number) => PAD_T + plotH - ((v - min) / span) * plotH;
  const k = Math.max(2, Math.min(n, Math.floor(plotW / 110)));
  const labelIdx = [...new Set(Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / (k - 1))))];

  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PAD_L) / plotW) * (n - 1)))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (e.key === "Escape") setHover(null);
  };

  return (
    <Frame title={title} subtitle={subtitle} hero={hero}>
      <Legend series={series} kind="line" />
      <div ref={box} style={{ position: "relative" }}>
        <svg
          ref={ref} viewBox={`0 0 ${W} ${height}`} className="chart-svg" role="img" tabIndex={0}
          aria-label={`${title ?? "Chart"}: ${series.map((s) => `${s.name} from ${fmtFull(s.values[0])} to ${fmtFull(s.values[n - 1])}`).join("; ")}`}
          onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}
          onKeyDown={onKey} onBlur={() => setHover(null)}
        >
          <defs>
            {series.map((_, si) => (
              <linearGradient key={si} id={`${gid}-a${si}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: COLORS[si % COLORS.length], stopOpacity: 0.16 }} />
                <stop offset="1" style={{ stopColor: COLORS[si % COLORS.length], stopOpacity: 0.01 }} />
              </linearGradient>
            ))}
          </defs>
          <YAxis max={max} min={min} W={W} />
          {labelIdx.map((i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="chart-axis">{labels[i]}</text>
          ))}
          {series.map((s, si) => {
            const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
            return (
              <g key={s.name}>
                {area && series.length === 1 && (
                  <path d={`${d} L${x(n - 1).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(min, 0)).toFixed(1)} Z`} fill={`url(#${gid}-a${si})`} />
                )}
                <path d={d} fill="none" style={{ stroke: COLORS[si % COLORS.length] }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r={4} style={{ fill: COLORS[si % COLORS.length], stroke: "var(--surface)" }} strokeWidth={2} />
              </g>
            );
          })}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={PAD_T + plotH} className="chart-cross" />
              {series.map((s, si) => (
                <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} style={{ fill: COLORS[si % COLORS.length], stroke: "var(--surface)" }} strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
        {hover != null && (
          <Tip at={x(hover) / W} title={labels[hover]} rows={series.map((s, si) => ({ name: s.name, value: s.values[hover], color: COLORS[si % COLORS.length] }))} />
        )}
      </div>
      <DataTable labels={labels} series={series} />
    </Frame>
  );
}

/** Older single-series API. */
export function LineChart({ title, points, valueLabel = "Value", empty }: { title: string; points: Point[]; valueLabel?: string; empty?: string }) {
  const last = points[points.length - 1];
  return (
    <div className="card chart-card">
      <TrendChart title={title} labels={points.map((p) => p.label)} series={[{ name: valueLabel, values: points.map((p) => p.value) }]}
        empty={empty} hero={points.length > 1 && last ? fmtFull(last.value) : undefined} />
    </div>
  );
}

/**
 * Amounts per period or category as columns; two or more series stack with a 2px gap.
 * Each column is its own hover target.
 */
export function ColumnChart({
  title, subtitle, labels, series, empty = "No data yet.", every, hero,
}: {
  title?: string; subtitle?: string; labels: string[]; series: Series[]; empty?: string; every?: number; hero?: React.ReactNode;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const plotW = W - PAD_L - PAD_R;
  const totals = labels.map((_, i) => series.reduce((t, s) => t + Math.max(0, s.values[i] ?? 0), 0));
  if (!n || !series.length || totals.every((t) => t === 0)) return <Empty title={title} subtitle={subtitle} note={empty} />;
  const max = niceMax(Math.max(...totals), totals.every((t) => Number.isInteger(t)));
  const slot = plotW / n;
  const bw = Math.max(3, Math.min(24, slot * 0.62));
  const step = every ?? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 64))));
  const base = PAD_T + plotH;

  return (
    <Frame title={title} subtitle={subtitle} hero={hero}>
      <Legend series={series} kind="rect" />
      <div ref={box} style={{ position: "relative" }}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={`${title ?? "Chart"}: total ${fmtFull(totals.reduce((a, b) => a + b, 0))}`}
          onPointerLeave={() => setHover(null)}>
          <YAxis max={max} W={W} />
          {labels.map((l, i) => (i % step === 0 ? (
            <text key={i} x={PAD_L + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="chart-axis">{l}</text>
          ) : null))}
          {labels.map((l, i) => {
            const bx = PAD_L + slot * i + (slot - bw) / 2;
            let top = base;
            const segs = series.map((s, si) => {
              const v = Math.max(0, s.values[i] ?? 0);
              const h = (v / max) * plotH;
              const y0 = top;
              top -= h;
              return { si, h, y0 };
            }).filter((g) => g.h > 0);
            return (
              <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <rect x={PAD_L + slot * i} y={PAD_T} width={slot} height={plotH} fill="transparent" />
                {segs.map((g, k) => {
                  const last = k === segs.length - 1;
                  const gap = k > 0 ? 2 : 0; // surface gap between stacked parts
                  const yTop = g.y0 - g.h;
                  const h = Math.max(0, g.h - gap);
                  const r = last ? Math.min(4, bw / 2, h) : 0;
                  const yb = g.y0 - gap;
                  const d = `M${bx},${yb} V${yTop + r} ${r ? `Q${bx},${yTop} ${bx + r},${yTop}` : ""} H${bx + bw - r} ${r ? `Q${bx + bw},${yTop} ${bx + bw},${yTop + r}` : ""} V${yb} Z`;
                  return <path key={g.si} d={d} style={{ fill: COLORS[g.si % COLORS.length] }} className={`chart-bar${hover != null && hover !== i ? " dim" : ""}`} />;
                })}
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <Tip
            at={(PAD_L + slot * hover + slot / 2) / W}
            title={labels[hover]}
            rows={[
              ...series.map((s, si) => ({ name: s.name, value: s.values[hover] ?? 0, color: COLORS[si % COLORS.length] })),
              ...(series.length > 1 ? [{ name: "Total", value: totals[hover], color: "transparent" }] : []),
            ]}
          />
        )}
      </div>
      <DataTable labels={labels} series={series} />
    </Frame>
  );
}

/** Older single-series API. */
export function BarChart({ title, points, valueLabel = "Value", empty }: { title: string; points: Point[]; valueLabel?: string; empty?: string }) {
  return (
    <div className="card chart-card">
      <ColumnChart title={title} labels={points.map((p) => p.label)} series={[{ name: valueLabel, values: points.map((p) => p.value) }]} empty={empty} />
    </div>
  );
}

/** Ranked list with bars and direct values (audience by city, followers by account…). */
export function BarList({ title, subtitle, points, empty = "No data yet.", limit = 8, share = true, bare = false }: {
  title?: string; subtitle?: string; points: Point[]; empty?: string; limit?: number; share?: boolean; bare?: boolean;
}) {
  const body = !points.length ? <div className="chart-empty">{empty}</div> : (() => {
    const total = points.reduce((s, p) => s + p.value, 0) || 1;
    const top = [...points].sort((a, b) => b.value - a.value).slice(0, limit);
    const max = top[0].value || 1;
    return (
      <div className="barlist">
        {top.map((p) => (
          <div key={p.label} className="barlist-row" title={`${p.label}: ${fmtFull(p.value)} (${((p.value / total) * 100).toFixed(1)}%)`}>
            <span className="barlist-label">{p.label}</span>
            <span className="barlist-track"><span className="barlist-fill" style={{ width: `${Math.max(2, (p.value / max) * 100)}%` }} /></span>
            <span className="barlist-value">{share ? `${((p.value / total) * 100).toFixed(1)}%` : fmtCompact(p.value)}</span>
          </div>
        ))}
      </div>
    );
  })();
  const inner = <Frame title={title} subtitle={subtitle}>{body}</Frame>;
  return bare ? inner : <div className="card chart-card">{inner}</div>;
}

/** One whole split into parts (content mix…): a 28px segmented bar plus a legend with amounts. */
export function SegmentedBar({ parts, empty = "No data yet." }: { parts: Point[]; empty?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className="chart-empty">{empty}</div>;
  const shown = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div role="img" aria-label={shown.map((p) => `${p.label} ${fmtFull(p.value)} (${Math.round((p.value / total) * 100)}%)`).join(", ")}
        style={{ display: "flex", gap: 2, height: 28, borderRadius: 6, overflow: "hidden" }}>
        {shown.map((p) => {
          const pct = (p.value / total) * 100;
          const i = parts.indexOf(p);
          return (
            <div key={p.label} title={`${p.label}: ${fmtFull(p.value)} (${pct.toFixed(1)}%)`}
              style={{ width: `${pct}%`, background: COLORS[i % COLORS.length], borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 8, color: i === 3 ? "#0b0b0b" : "#fff", fontSize: 12, fontWeight: 600, minWidth: 0 }}>
              {pct >= 14 ? `${Math.round(pct)}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="donut-legend" style={{ marginTop: 12 }}>
        {parts.map((p, i) => (
          <div key={p.label}><i style={{ background: COLORS[i % COLORS.length] }} /><span>{p.label}</span><b>{fmtFull(p.value)}</b><em>{Math.round((p.value / total) * 100)}%</em></div>
        ))}
      </div>
    </div>
  );
}

/** Tiny trend line for KPI tiles (no axes; the tile states the number). */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((v) => v === values[0])) return null;
  const w = 84, h = 28, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" style={{ stroke: "var(--faint)" }} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} style={{ fill: "var(--accent)" }} />
    </svg>
  );
}

/** Signed change badge: up/down colour depends on whether up is good. */
export function Delta({ value, suffix = "", goodWhenUp = true }: { value: number | null | undefined; suffix?: string; goodWhenUp?: boolean }) {
  if (value == null || !isFinite(value)) return null;
  const dir = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const good = dir === "flat" ? "flat" : (dir === "up") === goodWhenUp ? "up" : "down";
  return (
    <span className={`delta ${good}`}>
      {dir === "up" ? "▲" : dir === "down" ? "▼" : "•"} {value > 0 ? "+" : ""}{fmtCompact(value)}{suffix}
    </span>
  );
}

/** KPI tile: label, value, optional change and sparkline. */
export function Kpi({ label, value, sub, delta, deltaSuffix, spark, href, hint }: {
  label: string; value: number | string | null | undefined; sub?: React.ReactNode; delta?: number | null; deltaSuffix?: string;
  spark?: number[]; href?: string; hint?: string;
}) {
  const body = (
    <>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value == null ? "–" : typeof value === "number" ? fmtFull(value) : value}</div>
      {(delta != null || sub) && <div className="kpi-sub"><Delta value={delta} suffix={deltaSuffix} />{sub}</div>}
      {spark && <Sparkline values={spark} />}
    </>
  );
  return href ? <a href={href} className="kpi" title={hint}>{body}</a> : <div className="kpi" title={hint}>{body}</div>;
}

/** Older stat tile API (account pages). */
export function Stat({ label, value, hint }: { label: string; value?: number | string | null; hint?: string }) {
  return (
    <div className="card stat" title={hint}>
      <div className="label">{label}</div>
      <div className="value">{typeof value === "number" ? value.toLocaleString() : value ?? "–"}</div>
    </div>
  );
}
