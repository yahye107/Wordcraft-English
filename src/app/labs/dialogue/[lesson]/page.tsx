import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getLesson } from "@/lib/lessons/queries";
import { DIALOGUE_LAB } from "@/lib/labs";
import LessonView from "@/components/LessonView";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/labs/dialogue/[lesson]">) {
  const { lesson } = await props.params;
  const l = getLesson(getDb(), lesson);
  return { title: l?.title ?? "Lesson" };
}

export default async function LessonPage(props: PageProps<"/labs/dialogue/[lesson]">) {
  const { lesson } = await props.params;
  const l = getLesson(getDb(), lesson);
  if (!l || l.lab !== DIALOGUE_LAB.lab) notFound();
  return <LessonView info={DIALOGUE_LAB} lesson={l} />;
}
