import Link from "next/link";
import Annotated from "@/components/Annotated";
import AnnotationLegend from "@/components/AnnotationLegend";
import StartButton from "@/components/studio/StartButton";
import { parseAnnotated } from "@/lib/annotate";
import type { AnalysisRecord } from "@/lib/novel/store";
import AddAiButton from "./AddAiButton";
import DeleteAnalysisButton from "./DeleteAnalysisButton";
import WordActions from "./WordActions";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Everything about one stored analysis: the colour-coded passage, the local findings, and the tutor layer. */
export default function AnalysisView({ record, aiAvailable }: { record: AnalysisRecord; aiAvailable: boolean }) {
  const { local, ai } = record.result;
  const marks = parseAnnotated(local.markup);
  const found = (kind: "tag" | "beat") => marks.filter((m) => m.kind === kind).map((m) => m.text);
  const tags = found("tag");
  const beats = found("beat");
  const longest = Math.max(1, local.stats.longest);

  return (
    <div className="novel-view">
      <section aria-labelledby="n-passage" className="stack">
        <h2 id="n-passage">Your passage</h2>
        <p className="sentence marked-text" data-testid="passage">
          <Annotated text={local.markup} />
        </p>
        <p className="muted guess">
          <span className="badge">Automatic guess</span> The colours come from simple rules, not from a person or the tutor. Check them against what you read.
        </p>
        <AnnotationLegend lab="novel" />
        {record.aiNote && <p className="muted" data-testid="ai-note">{record.aiNote}</p>}
      </section>

      <section aria-labelledby="n-sentences" className="stack">
        <h2 id="n-sentences">Sentences</h2>
        {local.stats.sentences === 0 ? (
          <p className="muted">No sentences found.</p>
        ) : (
          <>
            <p data-testid="sentence-stats">
              {plural(local.stats.sentences, "sentence", "sentences")}. Average {local.stats.averageWords} words. Longest {local.stats.longest}, shortest {local.stats.shortest}.
            </p>
            <ol className="rhythm" aria-label="Sentence lengths in order">
              {local.sentences.map((s, i) => (
                <li key={i} className={`rhythm-bar rhythm-${s.kind}`} style={{ height: `${Math.max(8, Math.round((s.words / longest) * 64))}px` }}>
                  <span className="visually-hidden">
                    Sentence {i + 1}: {plural(s.words, "word", "words")}, {s.kind}
                  </span>
                </li>
              ))}
            </ol>
            <p className="muted">Yellow bars are speech. Grey bars are narration. A mix of long and short sentences gives writing its rhythm.</p>
          </>
        )}
      </section>

      {(tags.length > 0 || beats.length > 0) && (
        <section aria-labelledby="n-dialogue" className="stack" data-testid="dialogue-section">
          <h2 id="n-dialogue">Dialogue</h2>
          {tags.length > 0 && (
            <div>
              <h3>Tags: who is speaking</h3>
              <ul className="found-list">
                {tags.map((t, i) => (
                  <li key={i} className="sentence"><Annotated text={`{tag|${t}}`} /></li>
                ))}
              </ul>
            </div>
          )}
          {beats.length > 0 && (
            <div>
              <h3>Action beats: what the body does</h3>
              <ul className="found-list">
                {beats.map((t, i) => (
                  <li key={i} className="sentence"><Annotated text={`{beat|${t}}`} /></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {local.techniques.length > 0 && (
        <section aria-labelledby="n-tech" className="stack" data-testid="techniques">
          <h2 id="n-tech">Techniques</h2>
          <ul className="entry-list">
            {local.techniques.map((t) => (
              <li key={t.name} className="technique">
                <h3>{t.name}</h3>
                <p className="issue-quote"><mark className="hl">{t.quote}</mark></p>
                <p>{t.note}</p>
                {t.lessonHref && <p><Link href={t.lessonHref}>Learn more: {t.name.toLowerCase()} lesson</Link></p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="n-words" className="stack" data-testid="library-words">
        <h2 id="n-words">Words from the library</h2>
        {local.vocabulary.length === 0 ? (
          <p className="muted">No words from your library were found in this passage.</p>
        ) : (
          <ul className="entry-list">
            {local.vocabulary.map((v) => (
              <li key={v.slug} className="panel word-item">
                <div>
                  <Link href={`/e/${v.slug}`} className="xcard-text">{v.text}</Link>
                  <span className="badge">{v.level}</span>
                </div>
                <p className="xcard-meaning">{v.simpleMeaning}</p>
                <p>In your passage: <mark className="hl">{v.quote}</mark></p>
                <WordActions slug={v.slug} label="Save to notebook" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="n-lookup" className="stack" data-testid="lookup-words">
        <h2 id="n-lookup">Words to look up</h2>
        {local.unfamiliar.length === 0 ? (
          <p className="muted">No long or unusual words stood out. This list is a guess from word length.</p>
        ) : (
          <>
            <p className="muted">Long words that are not in your library. This is a guess from word length, so skip any you already know.</p>
            <ul className="entry-list">
              {local.unfamiliar.map((w) => (
                <li key={w} className="panel word-item">
                  <span className="xcard-text">{w}</span>
                  <div className="row">
                    <Link className="btn secondary small" href={`/search?q=${encodeURIComponent(w)}`}>Search the library</Link>
                    <WordActions text={w} label="Add to my notebook" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="n-tutor" className="stack" data-testid="tutor-section">
        <h2 id="n-tutor">Tutor</h2>
        {ai ? (
          <>
            {ai.vocabulary.length > 0 && (
              <div>
                <h3>Vocabulary</h3>
                <ul className="entry-list">
                  {ai.vocabulary.map((v, i) => (
                    <li key={i} className="panel word-item">
                      <p className="issue-quote"><mark className="hl">{v.quote}</mark></p>
                      <p>{v.meaning}</p>
                      <WordActions text={v.quote} meaning={v.meaning} label="Add to my notebook" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ai.structure && <div><h3>Structure</h3><p>{ai.structure}</p></div>}
            {ai.grammar.length > 0 && (
              <div>
                <h3>Grammar</h3>
                <ul className="entry-list">
                  {ai.grammar.map((g, i) => (
                    <li key={i} className="technique">
                      <p className="issue-quote"><mark className="hl">{g.quote}</mark></p>
                      <p>{g.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ai.dialogue && <div><h3>Dialogue</h3><p>{ai.dialogue}</p></div>}
            {ai.descriptive && <div><h3>Description</h3><p>{ai.descriptive}</p></div>}
            {ai.emotion && <div><h3>Feeling</h3><p>{ai.emotion}</p></div>}
            {ai.whyNatural && <div><h3>Why it sounds natural</h3><p>{ai.whyNatural}</p></div>}
            <div>
              <h3>A technique to copy: {ai.technique.name}</h3>
              <p>{ai.technique.how}</p>
              <div className="sample" data-testid="ai-example">
                <p className="sample-title">An original example in a different situation</p>
                {ai.example.situation && <p className="muted">{ai.example.situation}</p>}
                <p className="sentence">{ai.example.text}</p>
                <p className="muted">Written by the tutor. Use it to see the technique, then write your own.</p>
              </div>
            </div>
            {ai.tryIt && (
              <div>
                <h3>Try it</h3>
                <p>{ai.tryIt}</p>
                <div className="row"><StartButton mode="paragraph" label="Write it in the studio" /></div>
              </div>
            )}
          </>
        ) : aiAvailable ? (
          <>
            <p className="muted">No tutor analysis yet. The tutor explains the grammar, why the passage sounds natural, and gives you a technique to copy.</p>
            <AddAiButton id={record.id} />
          </>
        ) : (
          <p className="muted">Tutor analysis is off because no API key is set. The local analysis above works without one.</p>
        )}
      </section>

      <div className="row">
        <Link className="btn secondary small" href="/novel">Analyse another passage</Link>
        <DeleteAnalysisButton id={record.id} label="this analysis" redirect />
      </div>
      <p className="muted">Deleting removes the analysis and the passage stored with it.</p>
    </div>
  );
}
