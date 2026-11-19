import { getDb } from '@/lib/db';
import * as h from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, ctx: RouteContext<'/api/collections/[id]'>) {
  const id = h.parseId((await ctx.params).id);
  return id === null ? h.notFound() : h.handleRenameCollection(getDb(), id, request);
}

export async function DELETE(_request: Request, ctx: RouteContext<'/api/collections/[id]'>) {
  const id = h.parseId((await ctx.params).id);
  return id === null ? h.notFound() : h.handleDeleteCollection(getDb(), id);
}
