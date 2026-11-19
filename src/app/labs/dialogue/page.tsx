import { getDb } from "@/lib/db";
import { listLessons } from "@/lib/lessons/queries";
import { DIALOGUE_LAB } from "@/lib/labs";
import LabLessonList from "@/components/LabLessonList";

export const dynamic = "force-dynamic";
export const metadata = { title: DIALOGUE_LAB.title };

export default function DialogueLabPage() {
  return <LabLessonList info={DIALOGUE_LAB} lessons={listLessons(getDb(), DIALOGUE_LAB.lab)} />;
}
