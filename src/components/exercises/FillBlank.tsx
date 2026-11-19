"use client";

import { useId, useState } from "react";
import Annotated from "../Annotated";
import Feedback from "./Feedback";
import { useCheck } from "./useCheck";

export default function FillBlank({ slug, prompt }: { slug: string; prompt: string }) {
  const id = useId();
  const [text, setText] = useState("");
  const { result, loading, check, reset } = useCheck(slug);
  const [before, ...rest] = prompt.split("___");
  const after = rest.join("___");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) check({ text });
      }}
    >
      <p className="ex-prompt">
        <Annotated text={before} />
        <label htmlFor={id} className="visually-hidden">Your answer for the blank</label>
        <input
          id={id}
          className="blank"
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            if (result) reset();
          }}
        />
        <Annotated text={after} />
      </p>
      <button className="btn" type="submit" disabled={!text.trim() || loading}>
        {loading ? "Checking…" : "Check"}
      </button>
      <Feedback result={result} />
    </form>
  );
}
