/** A short row of columns with a label under each, for things like "cards due over the next 7 days". */
export default function MiniBars({ values, labels, unit, title }: { values: number[]; labels: string[]; unit: string; title: string }) {
  const clean = values.map((v) => (Number.isFinite(v) ? Math.max(0, v) : 0));
  const max = Math.max(1, ...clean);
  const summary = clean.map((v, i) => `${labels[i] ?? i + 1}: ${v}`).join(", ");
  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <div className="minibars" role="img" aria-label={`${title}. ${summary} ${unit}.`}>
        {clean.map((v, i) => (
          <div key={i} className="minibar" aria-hidden="true">
            <span className="minibar-value">{v > 0 ? v : ""}</span>
            <span className="minibar-col" style={{ height: `${Math.max(v > 0 ? 6 : 2, Math.round((v / max) * 56))}px` }} />
            <span className="minibar-label">{labels[i] ?? ""}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
