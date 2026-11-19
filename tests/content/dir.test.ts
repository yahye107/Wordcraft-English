import { describe, it, expect, afterEach, vi } from 'vitest';
import path from 'node:path';
import { contentDir } from '@/lib/content/dir';

afterEach(() => vi.unstubAllEnvs());

describe('contentDir', () => {
  it('uses WORDCRAFT_CONTENT_DIR, resolved against the working directory', () => {
    vi.stubEnv('WORDCRAFT_CONTENT_DIR', 'data/copy');
    expect(contentDir()).toBe(path.resolve(process.cwd(), 'data/copy'));
  });

  it('falls back to the content folder in the project', () => {
    vi.stubEnv('WORDCRAFT_CONTENT_DIR', '');
    expect(contentDir()).toBe(path.join(process.cwd(), 'content'));
    vi.stubEnv('WORDCRAFT_CONTENT_DIR', '   ');
    expect(contentDir()).toBe(path.join(process.cwd(), 'content'));
  });
});
