import Link from "next/link";
import LevelBadge, { RegisterBadge } from "./LevelBadge";
import IntensityMeter from "./IntensityMeter";

export type CardData = {
  slug: string;
  text: string;
  simpleMeaning: string;
  level: string;
  register: string;
  intensity: number | null;
};

export default function ExpressionCard({ e }: { e: CardData }) {
  return (
    <Link href={`/e/${e.slug}`} className="xcard">
      <span className="xcard-text">{e.text}</span>
      <span className="xcard-meaning">{e.simpleMeaning}</span>
      <span className="badges">
        <LevelBadge level={e.level} />
        <RegisterBadge register={e.register} />
        <IntensityMeter value={e.intensity} />
      </span>
    </Link>
  );
}
