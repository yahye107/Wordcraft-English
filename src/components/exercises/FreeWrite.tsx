"use client";

import { useId, useState } from "react";
import Annotated from "../Annotated";
import Feedback from "./Feedback";
import { useCheck } from "./useCheck";

export default function FreeWrite({ slug, prompt, checklist }: { slug: string; prompt: string; checklist: string[] }) {
  const id = useId();
  const [text, setText] = useState("");
  const [ticked, setTicked] = useState<boolean[]>(() => checklist.map(() => false));
  const { result, loading, check } = useCheck(slug);
  const saved = result?.ok === true;

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
      <label htmlFor={id} className="field-label">Your writing</label>
      <textarea id={id} className="writebox" rows={6} value={text} onChange={(e) => setText(e.target.value)} readOnly={saved} />

      <fieldset className="checklist">
        <legend>Check your own writing</legend>
        {checklist.map((c, i) => (
          <label key={i} className="check">
            <input
              type="checkbox"
              checked={ticked[i]}
              onChange={() => setTicked((t) => t.map((v, j) => (j === i ? !v : v)))}
            />
            <span>{c}</span>
          </label>
        ))}
      </fieldset>

      {!saved && (
        <button className="btn" type="submit" disabled={!text.trim() || loading}>
          {loading ? "Saving…" : "Save my writing"}
        </button>
      )}
      <Feedback result={result} />
      {result?.ok && result.sample && (
        <div className="sample">
          <p className="sample-title">One possible version, after you have written yours</p>
          <p className="sentence">
            <Annotated text={result.sample} />
          </p>
        </div>
      )}
    </form>
  );
}
