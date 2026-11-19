import type { Db } from '@/lib/db';

export function getSetting(db: Db, key: string): string | undefined {
  return db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export const DEFAULT_MODELS = { main: 'claude-sonnet-5-5', cheap: 'claude-haiku-5-5' } as const;
export const DEFAULT_MONTHLY_CAP_USD = 5;

/** Models used for AI features. A value saved in Settings wins over the defaults. */
export function getModels(db: Db): { main: string; cheap: string } {
  return {
    main: getSetting(db, 'model_main')?.trim() || DEFAULT_MODELS.main,
    cheap: getSetting(db, 'model_cheap')?.trim() || DEFAULT_MODELS.cheap,
  };
}
