import { getDb } from '@/lib/db';
import * as h from '@/lib/writing/handlers';
import { parseId, notFound } from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: RouteContext<'/api/writing/feedback/[id]'>) {
  const id = parseId((await ctx.params).id);
  return id === null ? notFound() : h.handleFeedbackPatch(getDb(), id, request);
}
