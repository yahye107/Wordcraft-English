import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

describe('environment', () => {
  it('runs on node 22+ with sqlite fts5', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE VIRTUAL TABLE t USING fts5(x)');
    db.exec("INSERT INTO t(x) VALUES ('crestfallen')");
    const rows = db.prepare("SELECT x FROM t WHERE t MATCH 'crestfallen'").all();
    expect(rows).toHaveLength(1);
  });
});
