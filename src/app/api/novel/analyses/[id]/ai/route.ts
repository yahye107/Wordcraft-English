import { getDb } from '@/lib/db';
import * as h from '@/lib/novel/handlers';
import { parseId, notFound } from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, ctx: RouteContext<'/api/novel/analyses/[id]/ai'>) {
  const id = parseId((await ctx.params).id);
  return id === null ? notFound() : h.handleAddAi(getDb(), id);
}
