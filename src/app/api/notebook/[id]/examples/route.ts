import { getDb } from '@/lib/db';
import * as h from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: RouteContext<'/api/notebook/[id]/examples'>) {
  const id = h.parseId((await ctx.params).id);
  return id === null ? h.notFound() : h.handleAddExample(getDb(), id, request);
}
