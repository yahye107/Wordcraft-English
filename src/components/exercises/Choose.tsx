"use client";

import { useId, useState } from "react";
import Annotated from "../Annotated";
import Feedback from "./Feedback";
import { useCheck } from "./useCheck";

export default function Choose({ slug, prompt, options }: { slug: string; prompt: string; options: string[] }) {
  const name = useId();
  const [choice, setChoice] = useState<number | null>(null);
  const { result, loading, check, reset } = useCheck(slug);
  const wrong = result?.ok && result.correct === false;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (choice !== null) check({ choice });
      }}
    >
      <fieldset className="choices">
        <legend className="ex-prompt">
          <Annotated text={prompt} />
        </legend>
        {options.map((o, i) => (
          <label key={i} className="choice">
            <input
              type="radio"
              name={name}
              checked={choice === i}
              onChange={() => {
                setChoice(i);
                if (result) reset();
              }}
            />
            <span>
              <Annotated text={o} />
            </span>
          </label>
        ))}
      </fieldset>
      <div className="row">
        <button className="btn" type="submit" disabled={choice === null || loading}>
          {loading ? "Checking…" : "Check"}
        </button>
        {wrong && (
          <button className="btn secondary" type="button" onClick={() => { reset(); setChoice(null); }}>
            Try again
          </button>
        )}
      </div>
      <Feedback result={result} />
    </form>
  );
}
