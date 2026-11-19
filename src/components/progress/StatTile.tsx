/** One number with its label. The value uses proportional figures; it is a figure, not a column. */
export default function StatTile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}
