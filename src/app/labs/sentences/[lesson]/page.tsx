import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getLesson } from "@/lib/lessons/queries";
import { SENTENCE_LAB } from "@/lib/labs";
import LessonView from "@/components/LessonView";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/labs/sentences/[lesson]">) {
  const { lesson } = await props.params;
  const l = getLesson(getDb(), lesson);
  return { title: l?.title ?? "Lesson" };
}

export default async function LessonPage(props: PageProps<"/labs/sentences/[lesson]">) {
  const { lesson } = await props.params;
  const l = getLesson(getDb(), lesson);
  if (!l || l.lab !== SENTENCE_LAB.lab) notFound();
  return <LessonView info={SENTENCE_LAB} lesson={l} />;
}
