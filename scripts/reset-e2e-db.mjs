// Removes the end-to-end test database so every run starts from a clean slate.
import fs from 'node:fs';

for (const f of ['data/e2e.sqlite', 'data/e2e.sqlite-wal', 'data/e2e.sqlite-shm']) {
  fs.rmSync(f, { force: true });
}
