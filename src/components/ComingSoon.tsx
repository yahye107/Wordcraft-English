export default function ComingSoon({
  title,
  summary,
  phase,
}: {
  title: string;
  summary: string;
  phase: string;
}) {
  return (
    <div className="reading">
      <h1>{title}</h1>
      <p className="lede">{summary}</p>
      <p className="muted">Not built yet. It arrives in {phase}.</p>
    </div>
  );
}
