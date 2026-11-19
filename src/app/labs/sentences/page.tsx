import { getDb } from "@/lib/db";
import { listLessons } from "@/lib/lessons/queries";
import { SENTENCE_LAB } from "@/lib/labs";
import LabLessonList from "@/components/LabLessonList";

export const dynamic = "force-dynamic";
export const metadata = { title: SENTENCE_LAB.title };

export default function SentenceLabPage() {
  return <LabLessonList info={SENTENCE_LAB} lessons={listLessons(getDb(), SENTENCE_LAB.lab)} />;
}
