import Annotated from "./Annotated";

/** A key to the marks used in a lab's examples. The kind is shown by style as well as colour. */
export default function AnnotationLegend({ lab = "dialogue" }: { lab?: "dialogue" | "sentence" }) {
  return (
    <aside className="legend" aria-label="How examples are marked">
      <p className="legend-title">How the examples are marked</p>
      {lab === "sentence" ? (
        <ul>
          <li><Annotated text="{main|The door opened}" /> <span className="muted">main clause: can stand alone</span></li>
          <li><Annotated text="{sub|because the wind pushed it}" /> <span className="muted">subordinate clause: needs a main clause</span></li>
          <li><Annotated text="{part|shaking the rain from her coat}" /> <span className="muted">participial phrase: an -ing or -ed phrase</span></li>
          <li><Annotated text="{link|However,}" /> <span className="muted">linking word: joins ideas</span></li>
          <li><Annotated text="{detail|The kettle ticked as it cooled.}" /> <span className="muted">a telling detail</span></li>
        </ul>
      ) : (
        <ul>
          <li><Annotated text="{speech|“Speech”}" /> <span className="muted">what is said</span></li>
          <li><Annotated text="{tag|she said}" /> <span className="muted">dialogue tag: who spoke</span></li>
          <li><Annotated text="{beat|She shrugged.}" /> <span className="muted">action beat: what the body does</span></li>
          <li><Annotated text="{thought|Not again.}" /> <span className="muted">a character’s thought</span></li>
          <li><Annotated text="{emotion|trembling}" /> <span className="muted">a word that shows feeling</span></li>
        </ul>
      )}
    </aside>
  );
}
