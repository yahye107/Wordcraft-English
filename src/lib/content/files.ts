import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { walk } from './load';

export type ContentKind = 'expression' | 'contrast' | 'lesson' | 'prompt';
export const CONTENT_KINDS: readonly ContentKind[] = ['expression', 'contrast', 'lesson', 'prompt'];
export const isContentKind = (v: unknown): v is ContentKind => typeof v === 'string' && (CONTENT_KINDS as readonly string[]).includes(v);

export type ContentFile = {
  kind: ContentKind;
  slug: string;
  /** Path relative to the content folder, with forward slashes. */
  file: string;
  /** Only expressions have a status; the others are always live. */
  status: 'draft' | 'published' | null;
  fingerprint: string;
};

const FOLDERS: Record<ContentKind, string> = { expression: 'expressions', contrast: 'contrasts', lesson: 'lessons', prompt: 'prompts' };

const SLUG_LINE = /^slug:[ \t]*['"]?([^'"\s#]+)['"]?[ \t]*(?:#.*)?$/m;
const SLUG_OK = /^[a-z0-9][a-z0-9-]*$/;
const STATUS_LINE = /^status:[ \t]*['"]?(draft|published)['"]?[ \t]*(?:#.*)?$/m;

/** SHA-1 of the file text with line endings normalised, so a CRLF copy of a file has the same fingerprint. */
export const fingerprintOf = (text: string): string => createHash('sha1').update(text.replace(/\r\n/g, '\n')).digest('hex');

/**
 * Every content file's kind, slug, status and fingerprint, found without parsing each file as full YAML: the
 * slug and status are top-level lines. A file written as one line of JSON falls back to a real parse.
 */
export function indexContentFiles(dir: string): { items: ContentFile[]; problems: { file: string; message: string }[] } {
  const items: ContentFile[] = [];
  const problems: { file: string; message: string }[] = [];
  const seen = new Set<string>();

  for (const kind of CONTENT_KINDS) {
    for (const full of walk(path.join(dir, FOLDERS[kind]))) {
      const rel = path.relative(dir, full).split(path.sep).join('/');
      let text: string;
      try {
        text = fs.readFileSync(full, 'utf8');
      } catch (e) {
        problems.push({ file: rel, message: `could not be read: ${(e as Error).message}` });
        continue;
      }

      let slug = SLUG_LINE.exec(text)?.[1];
      let status: string | undefined = STATUS_LINE.exec(text)?.[1];
      if (!slug) {
        try {
          const parsed = YAML.parse(text) as { slug?: unknown; status?: unknown } | null;
          if (parsed && typeof parsed.slug === 'string') {
            slug = parsed.slug;
            if (typeof parsed.status === 'string') status = parsed.status;
          }
        } catch (e) {
          problems.push({ file: rel, message: `invalid YAML: ${(e as Error).message.split('\n')[0]}` });
          continue;
        }
      }
      if (!slug) {
        problems.push({ file: rel, message: 'has no slug' });
        continue;
      }
      if (!SLUG_OK.test(slug)) {
        problems.push({ file: rel, message: `has an invalid slug "${slug}" (use lowercase letters, digits and hyphens)` });
        continue;
      }
      const key = `${kind}:${slug}`;
      if (seen.has(key)) {
        problems.push({ file: rel, message: `duplicate ${kind} slug "${slug}"` });
        continue;
      }
      seen.add(key);

      items.push({
        kind,
        slug,
        file: rel,
        status: kind === 'expression' ? (status === 'draft' ? 'draft' : 'published') : null,
        fingerprint: fingerprintOf(text),
      });
    }
  }

  items.sort((a, b) => CONTENT_KINDS.indexOf(a.kind) - CONTENT_KINDS.indexOf(b.kind) || a.slug.localeCompare(b.slug));
  return { items, problems };
}
