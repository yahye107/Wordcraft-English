import path from 'node:path';

/**
 * The folder the library lives in. `WORDCRAFT_CONTENT_DIR` points the app, the scripts and the tests at another
 * copy (the end-to-end tests change a copy, never the real files); otherwise it is `content` in the project.
 */
export function contentDir(): string {
  const set = process.env.WORDCRAFT_CONTENT_DIR?.trim();
  return set ? path.resolve(process.cwd(), set) : path.join(process.cwd(), 'content');
}
