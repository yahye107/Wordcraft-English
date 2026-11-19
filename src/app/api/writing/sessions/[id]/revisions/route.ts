import { getDb } from '@/lib/db';
import * as h from '@/lib/writing/handlers';
import { parseId, notFound } from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: RouteContext<'/api/writing/sessions/[id]/revisions'>) {
  const id = parseId((await ctx.params).id);
  return id === null ? notFound() : h.handleSubmit(getDb(), id, request);
}
