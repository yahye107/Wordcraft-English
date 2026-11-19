import { getDb } from '@/lib/db';
import * as h from '@/lib/writing/handlers';
import { parseId, notFound } from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, ctx: RouteContext<'/api/writing/sessions/[id]/revisions/[revisionId]/model-version'>) {
  const p = await ctx.params;
  const id = parseId(p.id);
  const revisionId = parseId(p.revisionId);
  return id === null || revisionId === null ? notFound() : h.handleModelVersion(getDb(), id, revisionId);
}
