import { describeSeries, formatNumber, niceMax, scalePoints } from "@/lib/progress/chart";

export type LineSeries = { name: string; values: number[]; tone: "a" | "b" };

const W = 640;
const H = 220;
const PAD = { left: 44, right: 56, top: 14, bottom: 30 };

/**
 * A small line chart drawn as SVG on a zero baseline. Two series differ by line style (solid and dashed) as well
 * as colour. A legend always names them, only the last value is labelled, and the numbers are in a table below.
 * Reading it needs no scripting: the point hints are native tooltips.
 */
export default function LineChart({
  title,
  series,
  labels,
  unit,
  emptyText,
}: {
  title: string;
  series: LineSeries[];
  labels: string[];
  unit: string;
  emptyText: string;
}) {
  const hasData = series.some((s) => s.values.length > 0);
  if (!hasData) return <p className="muted chart-empty">{emptyText}</p>;

  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const yMax = niceMax(Math.max(0, ...all));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const shaped = series.map((s) => ({
    ...s,
    pts: scalePoints(s.values, { width: plotW, height: plotH, pad: 6, min: 0, max: yMax }).map((p) => ({ x: p.x + PAD.left, y: p.y + PAD.top })),
  }));

  const ticks = [0, yMax / 2, yMax];
  const yOf = (v: number) => PAD.top + plotH - 6 - (v / yMax) * (plotH - 12);
  const summary = series.map((s) => describeSeries(s.name, s.values, unit)).join(" ");
  const count = Math.max(...series.map((s) => s.values.length));

  // Label each series' last value, but never stack two labels that would collide.
  const endLabels = shaped
    .map((s) => ({ s, p: s.pts[s.pts.length - 1], v: s.values[s.values.length - 1] }))
    .filter((e) => e.p)
    .sort((a, b) => a.p.y - b.p.y)
    .reduce<{ s: (typeof shaped)[number]; p: { x: number; y: number }; v: number }[]>(
      (kept, e) => (kept.length === 0 || e.p.y - kept[kept.length - 1].p.y >= 14 ? [...kept, e] : kept),
      [],
    );

  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      {series.length > 1 && (
        <ul className="chart-legend" aria-label="Key">
          {series.map((s) => (
            <li key={s.name}>
              <svg width="28" height="10" aria-hidden="true">
                <line x1="1" y1="5" x2="27" y2="5" className={`chart-line chart-line-${s.tone}`} />
              </svg>
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`} className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yOf(t)} y2={yOf(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={yOf(t) + 4} textAnchor="end" className="chart-axis">
              {formatNumber(t)}
            </text>
          </g>
        ))}
        {labels.length > 0 && (
          <>
            <text x={PAD.left} y={H - 8} textAnchor="start" className="chart-axis">{labels[0]}</text>
            {labels.length > 1 && (
              <text x={W - PAD.right} y={H - 8} textAnchor="end" className="chart-axis">{labels[labels.length - 1]}</text>
            )}
          </>
        )}
        {shaped.map((s) => (
          <g key={s.name}>
            {s.pts.length > 1 && (
              <polyline points={s.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} fill="none" className={`chart-line chart-line-${s.tone}`} />
            )}
            {s.pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i === s.pts.length - 1 ? 4 : 3} className={`chart-dot chart-dot-${s.tone}`}>
                <title>{`${labels[i] ?? `Piece ${i + 1}`}: ${s.name} ${formatNumber(s.values[i])} ${unit}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {endLabels.map((e) => (
          <text key={e.s.name} x={e.p.x + 10} y={e.p.y + 4} className="chart-value">
            {formatNumber(e.v)}
          </text>
        ))}
      </svg>
      <details className="chart-numbers">
        <summary>Show the numbers</summary>
        <table className="table">
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Piece</th>
              {series.map((s) => (
                <th key={s.name} scope="col">{s.name} ({unit})</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: count }, (_, i) => (
              <tr key={i}>
                <th scope="row">{labels[i] ?? i + 1}</th>
                {series.map((s) => (
                  <td key={s.name}>{s.values[i] === undefined ? "" : formatNumber(s.values[i])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
