import { getDb } from '@/lib/db';
import * as h from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, ctx: RouteContext<'/api/notebook/[id]/collections'>) {
  const id = h.parseId((await ctx.params).id);
  return id === null ? h.notFound() : h.handleSetCollections(getDb(), id, request);
}
