"use client";

import { useId, useState } from "react";
import Annotated from "../Annotated";
import Feedback from "./Feedback";
import { useCheck } from "./useCheck";

export default function FixPunctuation({ slug, prompt, broken }: { slug: string; prompt: string; broken: string }) {
  const id = useId();
  const [text, setText] = useState(broken);
  const { result, loading, check, reset } = useCheck(slug);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) check({ text });
      }}
    >
      <p className="ex-prompt">
        <Annotated text={prompt} />
      </p>
      <label htmlFor={id} className="field-label">Edit the line so the punctuation and capitals are right</label>
      <textarea
        id={id}
        className="fixbox"
        rows={2}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          if (result) reset();
        }}
      />
      <div className="row">
        <button className="btn" type="submit" disabled={!text.trim() || loading}>
          {loading ? "Checking…" : "Check"}
        </button>
        <button className="btn secondary" type="button" onClick={() => { setText(broken); reset(); }}>
          Start again
        </button>
      </div>
      <Feedback result={result} />
    </form>
  );
}
