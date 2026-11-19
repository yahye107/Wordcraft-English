/** A thin bar with its numbers in words. Safe when the maximum is 0. */
export default function MeterBar({ value, max, label, unit = "" }: { value: number; max: number; label: string; unit?: string }) {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const m = Number.isFinite(max) ? Math.max(0, max) : 0;
  const pct = m > 0 ? Math.min(100, Math.round((v / m) * 100)) : 0;
  const text = `${v} of ${m}${unit ? ` ${unit}` : ""}`;
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="meter-text">{text}</span>
      </div>
      <div className="meter-track" role="img" aria-label={`${label}: ${text}`}>
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
