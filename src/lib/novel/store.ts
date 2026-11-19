import { createHash } from 'node:crypto';
import type { Db } from '@/lib/db';
import { cleanText, fail, isFail, type Fail } from '@/lib/notebook/limits';
import { NOVEL_LIMITS } from './limits';
import type { AnalysisResult } from './types';

export type AnalysisRecord = {
  id: number;
  excerpt: string;
  sourceTitle: string | null;
  result: AnalysisResult;
  aiUsed: boolean;
  aiNote: string | null;
  createdAt: string;
};

export type AnalysisSummary = { id: number; excerptPreview: string; sourceTitle: string | null; createdAt: string; aiUsed: boolean };

type Row = { id: number; excerpt: string; source_title: string | null; result_json: string; ai_used: number; ai_note: string | null; created_at: string };

const hashOf = (text: string) => createHash('sha1').update(text).digest('hex');

function toRecord(r: Row): AnalysisRecord {
  return {
    id: r.id,
    excerpt: r.excerpt,
    sourceTitle: r.source_title,
    result: JSON.parse(r.result_json) as AnalysisResult,
    aiUsed: r.ai_used === 1,
    aiNote: r.ai_note,
    createdAt: r.created_at,
  };
}

const COLS = 'id, excerpt, source_title, result_json, ai_used, ai_note, created_at';

export function findByExcerpt(db: Db, text: string): AnalysisRecord | undefined {
  const r = db.get<Row>(`SELECT ${COLS} FROM novel_analyses WHERE excerpt_hash = ?`, [hashOf(text)]);
  return r ? toRecord(r) : undefined;
}

export function getAnalysis(db: Db, id: number): AnalysisRecord | undefined {
  const r = db.get<Row>(`SELECT ${COLS} FROM novel_analyses WHERE id = ?`, [id]);
  return r ? toRecord(r) : undefined;
}

export function saveAnalysis(
  db: Db,
  input: { excerpt: string; sourceTitle?: unknown; result: AnalysisResult; aiUsed: boolean; aiNote: string | null },
): { ok: true; id: number; existing: boolean } | Fail {
  const title = cleanText(input.sourceTitle, 'The book title', NOVEL_LIMITS.title);
  if (isFail(title)) return title;

  const existing = db.get<{ id: number }>('SELECT id FROM novel_analyses WHERE excerpt_hash = ?', [hashOf(input.excerpt)]);
  if (existing) return { ok: true, id: existing.id, existing: true };

  if (analysisCount(db) >= NOVEL_LIMITS.stored) {
    return fail(`You have ${NOVEL_LIMITS.stored} saved analyses, which is the limit. Delete some you no longer need.`);
  }
  const r = db.run(
    'INSERT INTO novel_analyses (excerpt, excerpt_hash, source_title, result_json, ai_used, ai_note) VALUES (?, ?, ?, ?, ?, ?)',
    [input.excerpt, hashOf(input.excerpt), title || null, JSON.stringify(input.result), input.aiUsed ? 1 : 0, input.aiNote],
  );
  return { ok: true, id: r.lastInsertRowid, existing: false };
}

export const analysisCount = (db: Db): number => db.get<{ n: number }>('SELECT COUNT(*) n FROM novel_analyses')!.n;

export function listAnalyses(db: Db, limit = NOVEL_LIMITS.stored): AnalysisSummary[] {
  return db
    .all<{ id: number; excerpt: string; source_title: string | null; created_at: string; ai_used: number }>(
      'SELECT id, excerpt, source_title, created_at, ai_used FROM novel_analyses ORDER BY created_at DESC, id DESC LIMIT ?',
      [limit],
    )
    .map((r) => ({
      id: r.id,
      excerptPreview: r.excerpt.length > 80 ? `${r.excerpt.slice(0, 80)}…` : r.excerpt,
      sourceTitle: r.source_title,
      createdAt: r.created_at,
      aiUsed: r.ai_used === 1,
    }));
}

export function updateAiLayer(db: Db, id: number, result: AnalysisResult, aiUsed: boolean, aiNote: string | null): { ok: true } | Fail {
  const r = db.run('UPDATE novel_analyses SET result_json = ?, ai_used = ?, ai_note = ? WHERE id = ?', [
    JSON.stringify(result),
    aiUsed ? 1 : 0,
    aiNote,
    id,
  ]);
  return r.changes > 0 ? { ok: true } : fail('That analysis does not exist.');
}

export function deleteAnalysis(db: Db, id: number): { ok: true } | Fail {
  const r = db.run('DELETE FROM novel_analyses WHERE id = ?', [id]);
  return r.changes > 0 ? { ok: true } : fail('That analysis does not exist.');
}
