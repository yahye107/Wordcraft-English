export type MarkedPart = { text: string; marked: boolean };

/** Split text so the first occurrence of each quote can be highlighted. Overlaps are not marked twice. */
export function markQuotes(text: string, quotes: string[]): MarkedPart[] {
  if (!text) return [];
  const spans: { start: number; end: number }[] = [];
  for (const q of quotes) {
    if (!q) continue;
    const start = text.indexOf(q);
    if (start === -1) continue;
    const end = start + q.length;
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    spans.push({ start, end });
  }
  spans.sort((a, b) => a.start - b.start);

  const parts: MarkedPart[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) parts.push({ text: text.slice(at, s.start), marked: false });
    parts.push({ text: text.slice(s.start, s.end), marked: true });
    at = s.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), marked: false });
  return parts;
}
