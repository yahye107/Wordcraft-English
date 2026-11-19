import Annotated from "./Annotated";

/** A key to the marks used in the lab's examples. The kind is shown by style as well as colour. */
export default function AnnotationLegend() {
  return (
    <aside className="legend" aria-label="How examples are marked">
      <p className="legend-title">How the examples are marked</p>
      <ul>
        <li><Annotated text="{speech|“Speech”}" /> <span className="muted">what is said</span></li>
        <li><Annotated text="{tag|she said}" /> <span className="muted">dialogue tag: who spoke</span></li>
        <li><Annotated text="{beat|She shrugged.}" /> <span className="muted">action beat: what the body does</span></li>
        <li><Annotated text="{thought|Not again.}" /> <span className="muted">a character’s thought</span></li>
        <li><Annotated text="{emotion|trembling}" /> <span className="muted">a word that shows feeling</span></li>
      </ul>
    </aside>
  );
}
