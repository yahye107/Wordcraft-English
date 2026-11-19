"use client";

import { useState } from "react";
import Annotated from "../Annotated";
import Feedback from "./Feedback";
import { useCheck } from "./useCheck";

/** Build a sentence by pressing fragments in order. Buttons only, so it works by keyboard and touch. */
export default function Reorder({ slug, prompt, fragments }: { slug: string; prompt: string; fragments: string[] }) {
  const [order, setOrder] = useState<number[]>([]);
  const { result, loading, check, reset } = useCheck(slug);
  const complete = order.length === fragments.length;
  const built = order.map((i) => fragments[i]).join(" ");

  const change = (next: number[]) => {
    setOrder(next);
    if (result) reset();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) check({ order });
      }}
    >
      <p className="ex-prompt">
        <Annotated text={prompt} />
      </p>

      <p className="field-label" id={`${slug}-pieces`}>Pieces (press them in order)</p>
      <div className="pieces" role="group" aria-labelledby={`${slug}-pieces`}>
        {fragments.map((f, i) => (
          <button
            key={i}
            type="button"
            className="piece"
            disabled={order.includes(i)}
            onClick={() => change([...order, i])}
          >
            {f}
          </button>
        ))}
      </div>

      <p className="field-label">Your sentence</p>
      <p className="built sentence" aria-live="polite">
        {built || <span className="muted">Nothing yet. Press a piece to start.</span>}
      </p>

      <div className="row">
        <button className="btn" type="submit" disabled={!complete || loading}>
          {loading ? "Checking…" : "Check"}
        </button>
        <button className="btn secondary" type="button" disabled={order.length === 0} onClick={() => change(order.slice(0, -1))}>
          Remove last
        </button>
        <button className="btn secondary" type="button" disabled={order.length === 0} onClick={() => change([])}>
          Start again
        </button>
      </div>
      <Feedback result={result} />
    </form>
  );
}
