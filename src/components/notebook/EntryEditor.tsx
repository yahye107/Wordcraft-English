"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "./api";

type Props = {
  entry: {
    id: number;
    myMeaning: string;
    myNotes: string;
    examples: { id: number; text: string }[];
    collections: { id: number; name: string }[];
  };
  allCollections: { id: number; name: string }[];
};

export default function EntryEditor({ entry, allCollections }: Props) {
  const router = useRouter();
  const uid = useId();
  const [meaning, setMeaning] = useState(entry.myMeaning);
  const [notes, setNotes] = useState(entry.myNotes);
  const [sentence, setSentence] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [chosen, setChosen] = useState<number[]>(entry.collections.map((c) => c.id));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const done = (r: { ok: boolean }, okText: string, errText?: string) =>
    setMessage(r.ok ? { ok: true, text: okText } : { ok: false, text: errText ?? "Something went wrong." });

  async function saveText(e: React.FormEvent) {
    e.preventDefault();
    const r = await call("PATCH", `/api/notebook/${entry.id}`, { myMeaning: meaning, myNotes: notes });
    setMessage(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  }

  async function addSentence(e: React.FormEvent) {
    e.preventDefault();
    const r = await call("POST", `/api/notebook/${entry.id}/examples`, { text: sentence });
    setMessage(r.ok ? { ok: true, text: "Sentence added." } : { ok: false, text: r.error });
    if (r.ok) {
      setSentence("");
      router.refresh();
    }
  }

  async function removeSentence(id: number) {
    const r = await call("DELETE", `/api/notebook/examples/${id}`);
    done(r, "Sentence removed.", r.ok ? undefined : r.error);
    if (r.ok) router.refresh();
  }

  async function saveCollections(ids: number[]) {
    setChosen(ids);
    const r = await call("PUT", `/api/notebook/${entry.id}/collections`, { collectionIds: ids });
    done(r, "Collections saved.", r.ok ? undefined : r.error);
    if (r.ok) router.refresh();
  }

  async function createCollection(e: React.FormEvent) {
    e.preventDefault();
    const c = await call<{ id: number }>("POST", "/api/collections", { name: newCollection });
    if (!c.ok) return setMessage({ ok: false, text: c.error });
    setNewCollection("");
    await saveCollections([...chosen, c.data.id]);
  }

  async function remove() {
    const r = await call("DELETE", `/api/notebook/${entry.id}`);
    if (r.ok) router.push("/notebook");
    else setMessage({ ok: false, text: r.error });
  }

  return (
    <div className="stack">
      <form className="panel stack" onSubmit={saveText}>
        <h2>Your words</h2>
        <div className="field">
          <label htmlFor={`${uid}-m`}>My meaning</label>
          <textarea id={`${uid}-m`} className="fixbox" rows={2} maxLength={500} value={meaning} onChange={(e) => setMeaning(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-n`}>Notes: when to use it</label>
          <textarea id={`${uid}-n`} className="fixbox" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn" type="submit">Save</button>
        </div>
      </form>

      <section className="panel stack" aria-labelledby={`${uid}-ex`}>
        <h2 id={`${uid}-ex`}>My example sentences</h2>
        {entry.examples.length === 0 ? (
          <p className="muted">None yet. Writing your own sentence is the best way to make a word yours.</p>
        ) : (
          <ul className="examples">
            {entry.examples.map((x) => (
              <li key={x.id} className="row">
                <p className="sentence">{x.text}</p>
                <button className="btn secondary small" type="button" onClick={() => removeSentence(x.id)} aria-label={`Remove: ${x.text}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addSentence} className="stack">
          <div className="field">
            <label htmlFor={`${uid}-s`}>Add a sentence</label>
            <input id={`${uid}-s`} value={sentence} maxLength={500} onChange={(e) => setSentence(e.target.value)} autoComplete="off" />
          </div>
          <div className="row">
            <button className="btn" type="submit" disabled={!sentence.trim()}>Add sentence</button>
          </div>
        </form>
      </section>

      <section className="panel stack" aria-labelledby={`${uid}-col`}>
        <h2 id={`${uid}-col`}>Collections</h2>
        {allCollections.length > 0 && (
          <fieldset>
            <legend className="visually-hidden">Choose collections</legend>
            {allCollections.map((c) => (
              <label key={c.id} className="check">
                <input
                  type="checkbox"
                  checked={chosen.includes(c.id)}
                  onChange={(e) => saveCollections(e.target.checked ? [...chosen, c.id] : chosen.filter((x) => x !== c.id))}
                />
                <span>{c.name}</span>
              </label>
            ))}
          </fieldset>
        )}
        <form onSubmit={createCollection} className="stack">
          <div className="field">
            <label htmlFor={`${uid}-c`}>New collection</label>
            <input id={`${uid}-c`} value={newCollection} maxLength={40} onChange={(e) => setNewCollection(e.target.value)} autoComplete="off" />
          </div>
          <div className="row">
            <button className="btn secondary" type="submit" disabled={!newCollection.trim()}>Create and add</button>
          </div>
        </form>
      </section>

      <p role="status" aria-live="polite" className={message ? (message.ok ? "right" : "wrong-text") : "muted"}>
        {message?.text ?? ""}
      </p>

      <section className="panel">
        <h2>Delete this word</h2>
        {confirming ? (
          <div className="row">
            <button className="btn" type="button" onClick={remove}>Yes, delete it</button>
            <button className="btn secondary" type="button" onClick={() => setConfirming(false)}>Keep it</button>
          </div>
        ) : (
          <button className="btn secondary" type="button" onClick={() => setConfirming(true)}>Delete…</button>
        )}
        <p className="muted">This removes the word, your sentences and its review history from your notebook.</p>
      </section>
    </div>
  );
}
