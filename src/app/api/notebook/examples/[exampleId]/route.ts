import { getDb } from '@/lib/db';
import * as h from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, ctx: RouteContext<'/api/notebook/examples/[exampleId]'>) {
  const id = h.parseId((await ctx.params).exampleId);
  return id === null ? h.notFound() : h.handleDeleteExample(getDb(), id);
}
