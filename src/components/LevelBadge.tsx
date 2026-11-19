const LEVEL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  literary: "Literary",
};

export default function LevelBadge({ level }: { level: string }) {
  return <span className="badge">{LEVEL_LABEL[level] ?? level}</span>;
}

export function RegisterBadge({ register }: { register: string }) {
  return <span className="badge">{register.charAt(0).toUpperCase() + register.slice(1)}</span>;
}
