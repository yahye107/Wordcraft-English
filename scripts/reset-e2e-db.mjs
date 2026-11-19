// Removes the end-to-end test database and makes a fresh copy of the content, so every run starts from a clean
// slate and the tests that change content (the review page) change the copy, never the real files.
import fs from 'node:fs';

for (const f of ['data/e2e.sqlite', 'data/e2e.sqlite-wal', 'data/e2e.sqlite-shm']) {
  fs.rmSync(f, { force: true });
}

fs.rmSync('data/e2e-content', { recursive: true, force: true });
fs.cpSync('content', 'data/e2e-content', { recursive: true });
