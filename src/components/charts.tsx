// Server-rendered SVG charts (no client JS, so they also work through the tunnel).
// Single series each: the title names the series, so no legend box. Hover tooltips use native <title>.
// Colors come from theme tokens (--series, --grid, --card-solid) so charts follow the light/dark theme.

const SERIES = "var(--series)";
const GRID = "var(--grid)";

type Point = { label: string; value: number };

const fmt = (n: number) =>
  Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : Number.isInteger(n) ? String(n) : n.toFixed(1);

function niceMax(max: number) {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

function DataTable({ points, valueLabel }: { points: Point[]; valueLabel: string }) {
  return (
    <details className="chart-table">
      <summary>Show data</summary>
      <table>
        <thead><tr><th>Label</th><th>{valueLabel}</th></tr></thead>
        <tbody>{points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{p.value.toLocaleString()}</td></tr>)}</tbody>
      </table>
    </details>
  );
}

function Empty({ title, note }: { title: string; note: string }) {
  return (
    <div className="card chart-card">
      <h3>{title}</h3>
      <div className="chart-empty muted">{note}</div>
    </div>
  );
}

const W = 640, H = 220, PAD_L = 40, PAD_R = 12, PAD_T = 12, PAD_B = 28;
const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

function Axes({ max, labels }: { max: number; labels: { x: number; text: string }[] }) {
  const ticks = [0, max / 2, max];
  return (
    <g>
      {ticks.map((t) => {
        const y = PAD_T + plotH - (t / max) * plotH;
        return (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} style={{ stroke: GRID }} strokeWidth={1} />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" className="chart-axis">{fmt(t)}</text>
          </g>
        );
      })}
      {labels.map((l, i) => (
        <text key={i} x={l.x} y={H - 8} textAnchor="middle" className="chart-axis">{l.text}</text>
      ))}
    </g>
  );
}

/** Change over time. */
export function LineChart({ title, points, valueLabel = "Value", empty = "No data yet." }: {
  title: string; points: Point[]; valueLabel?: string; empty?: string;
}) {
  if (points.length < 2) return <Empty title={title} note={empty} />;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const x = (i: number) => PAD_L + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD_T + plotH - ((v - min) / span) * plotH;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const step = plotW / (points.length - 1);
  const labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const last = points[points.length - 1];

  return (
    <div className="card chart-card">
      <div className="row"><h3 style={{ margin: 0 }}>{title}</h3><div className="spacer" /><span className="chart-hero">{last.value.toLocaleString()}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={title}>
        <Axes max={max} labels={labelIdx.map((i) => ({ x: x(i), text: points[i].label }))} />
        <path d={d} fill="none" style={{ stroke: SERIES }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r={4} style={{ fill: SERIES, stroke: "var(--card-solid)" }} strokeWidth={2} />
        {points.map((p, i) => (
          <g key={i} className="chart-hit">
            <rect x={x(i) - step / 2} y={PAD_T} width={step} height={plotH} fill="transparent" />
            <line x1={x(i)} x2={x(i)} y1={PAD_T} y2={PAD_T + plotH} className="chart-cross" />
            <circle cx={x(i)} cy={y(p.value)} r={4} className="chart-dot" />
            <title>{`${p.label}: ${p.value.toLocaleString()} ${valueLabel.toLowerCase()}`}</title>
          </g>
        ))}
      </svg>
      <DataTable points={points} valueLabel={valueLabel} />
    </div>
  );
}

/** Magnitude per category / period. */
export function BarChart({ title, points, valueLabel = "Value", empty = "No data yet." }: {
  title: string; points: Point[]; valueLabel?: string; empty?: string;
}) {
  if (!points.length) return <Empty title={title} note={empty} />;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const slot = plotW / points.length;
  const bw = Math.max(2, Math.min(36, slot - 2)); // 2px gap between bars
  const every = Math.ceil(points.length / 8);

  return (
    <div className="card chart-card">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={title}>
        <Axes
          max={max}
          labels={points.map((p, i) => ({ x: PAD_L + slot * i + slot / 2, text: i % every === 0 ? p.label : "" }))}
        />
        {points.map((p, i) => {
          const h = (p.value / max) * plotH;
          const bx = PAD_L + slot * i + (slot - bw) / 2;
          const by = PAD_T + plotH - h;
          const r = Math.min(4, bw / 2, h);
          // Rounded top, square at the baseline
          const path = h <= 0 ? "" :
            `M${bx},${PAD_T + plotH} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + bw - r} Q${bx + bw},${by} ${bx + bw},${by + r} V${PAD_T + plotH} Z`;
          return (
            <g key={i} className="chart-hit">
              <rect x={PAD_L + slot * i} y={PAD_T} width={slot} height={plotH} fill="transparent" />
              {path && <path d={path} style={{ fill: SERIES }} className="chart-bar" />}
              <title>{`${p.label}: ${p.value.toLocaleString()} ${valueLabel.toLowerCase()}`}</title>
            </g>
          );
        })}
      </svg>
      <DataTable points={points} valueLabel={valueLabel} />
    </div>
  );
}

/** Ranked share list (audience by city/country/age). Values are direct-labeled. */
export function BarList({ title, points, empty = "No data yet.", limit = 8 }: {
  title: string; points: Point[]; empty?: string; limit?: number;
}) {
  if (!points.length) return <Empty title={title} note={empty} />;
  const total = points.reduce((s, p) => s + p.value, 0) || 1;
  const top = points.slice(0, limit);
  const max = top[0].value || 1;
  return (
    <div className="card chart-card">
      <h3>{title}</h3>
      <div className="barlist">
        {top.map((p) => (
          <div key={p.label} className="barlist-row" title={`${p.label}: ${p.value.toLocaleString()} (${((p.value / total) * 100).toFixed(1)}%)`}>
            <span className="barlist-label">{p.label}</span>
            <span className="barlist-track"><span className="barlist-fill" style={{ width: `${(p.value / max) * 100}%`, background: SERIES }} /></span>
            <span className="barlist-value">{((p.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value?: number | string | null; hint?: string }) {
  return (
    <div className="card stat" style={{ margin: 0 }} title={hint}>
      <div className="label">{label}</div>
      <div className="value">{typeof value === "number" ? value.toLocaleString() : value ?? "–"}</div>
    </div>
  );
}
