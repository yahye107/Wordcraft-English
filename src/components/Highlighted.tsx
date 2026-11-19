import { highlightParts } from "@/lib/highlight";

/** A sentence with the taught expression marked like a highlighter pen. */
export default function Highlighted({ text, needle }: { text: string; needle: string }) {
  return (
    <>
      {highlightParts(text, needle).map((p, i) =>
        p.hit ? (
          <mark key={i} className="hl">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
