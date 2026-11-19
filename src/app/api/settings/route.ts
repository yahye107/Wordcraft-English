import { z } from 'zod';
import { getDb } from '@/lib/db';
import { setSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const Body = z.object({
  model_main: z.string().trim().max(100).optional(),
  model_cheap: z.string().trim().max(100).optional(),
  monthly_cap_usd: z.number().positive().max(1000).optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ ok: false, message: 'Check the values: the spend cap must be a positive number.' }, { status: 400 });
  }
  const db = getDb();
  const { model_main, model_cheap, monthly_cap_usd } = parsed.data;
  if (model_main !== undefined) setSetting(db, 'model_main', model_main);
  if (model_cheap !== undefined) setSetting(db, 'model_cheap', model_cheap);
  if (monthly_cap_usd !== undefined) setSetting(db, 'monthly_cap_usd', String(monthly_cap_usd));
  return Response.json({ ok: true });
}
