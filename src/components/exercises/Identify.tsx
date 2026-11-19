"use client";

import { useId, useState } from "react";
import Annotated from "../Annotated";
import Feedback from "./Feedback";
import { useCheck } from "./useCheck";

export default function Identify({
  slug,
  prompt,
  items,
  choices,
}: {
  slug: string;
  prompt: string;
  items: string[];
  choices: string[];
}) {
  const group = useId();
  const [labels, setLabels] = useState<(string | null)[]>(() => items.map(() => null));
  const { result, loading, check, reset } = useCheck(slug);
  const complete = labels.every((l) => l !== null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) check({ labels });
      }}
    >
      <p className="ex-prompt">
        <Annotated text={prompt} />
      </p>
      <ol className="identify">
        {items.map((item, i) => (
          <li key={i}>
            <p className="identify-text">
              <Annotated text={item} />
            </p>
            <fieldset className="identify-choices">
              <legend className="visually-hidden">Label for item {i + 1}</legend>
              {choices.map((c) => (
                <label key={c} className="chip-radio">
                  <input
                    type="radio"
                    name={`${group}-${i}`}
                    checked={labels[i] === c}
                    onChange={() => {
                      setLabels((prev) => prev.map((l, j) => (j === i ? c : l)));
                      if (result) reset();
                    }}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </fieldset>
          </li>
        ))}
      </ol>
      <button className="btn" type="submit" disabled={!complete || loading}>
        {loading ? "Checking…" : "Check"}
      </button>
      <Feedback result={result} />
    </form>
  );
}
