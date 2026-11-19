"use client";

import type { PublicExercise } from "@/lib/lessons/queries";
import Choose from "./exercises/Choose";
import FillBlank from "./exercises/FillBlank";
import Identify from "./exercises/Identify";
import FixPunctuation from "./exercises/FixPunctuation";
import FreeWrite from "./exercises/FreeWrite";
import Reorder from "./exercises/Reorder";

const TYPE_LABEL: Record<string, string> = {
  choose: "Choose",
  fill_blank: "Fill the blank",
  identify: "Label each one",
  fix_punctuation: "Fix the punctuation",
  reorder: "Put in order",
  free_write: "Write",
};

type P = Record<string, unknown>;

export default function ExercisePlayer({ exercise, index }: { exercise: PublicExercise; index: number }) {
  const p = exercise.payload as P;
  return (
    <article className="exercise" aria-labelledby={`ex-${exercise.slug}`}>
      <header className="exercise-head">
        <h3 id={`ex-${exercise.slug}`}>
          {index}. {TYPE_LABEL[exercise.type] ?? exercise.type}
        </h3>
        {exercise.done && <span className="badge done">Done</span>}
      </header>

      {exercise.type === "choose" && <Choose slug={exercise.slug} prompt={exercise.prompt} options={p.options as string[]} />}
      {exercise.type === "fill_blank" && <FillBlank slug={exercise.slug} prompt={exercise.prompt} />}
      {exercise.type === "identify" && (
        <Identify slug={exercise.slug} prompt={exercise.prompt} items={p.items as string[]} choices={p.choices as string[]} />
      )}
      {exercise.type === "fix_punctuation" && (
        <FixPunctuation slug={exercise.slug} prompt={exercise.prompt} broken={p.broken as string} />
      )}
      {exercise.type === "reorder" && (
        <Reorder slug={exercise.slug} prompt={exercise.prompt} fragments={p.fragments as string[]} />
      )}
      {exercise.type === "free_write" && (
        <FreeWrite slug={exercise.slug} prompt={exercise.prompt} checklist={p.checklist as string[]} />
      )}
    </article>
  );
}
