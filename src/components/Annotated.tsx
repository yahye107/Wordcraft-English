import { parseAnnotated } from "@/lib/annotate";

/** Text with {kind|...} marks drawn as the dialogue parts they name. Plain text passes through. */
export default function Annotated({ text }: { text: string }) {
  return (
    <>
      {parseAnnotated(text).map((s, i) =>
        s.kind === "plain" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i} className={`ann ann-${s.kind}`} data-kind={s.kind}>
            {s.text}
          </span>
        ),
      )}
    </>
  );
}
