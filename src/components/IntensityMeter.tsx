/** Five dots showing how strong a feeling-word is. Renders nothing when there is no intensity. */
export default function IntensityMeter({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="meter" role="img" aria-label={`Intensity ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? "dot on" : "dot"} />
      ))}
    </span>
  );
}
