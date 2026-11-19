import { getDb } from '@/lib/db';
import { handleCheck } from '@/lib/lessons/handleCheck';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, ctx: RouteContext<'/api/exercises/[slug]/check'>) {
  const { slug } = await ctx.params;
  return handleCheck(getDb(), slug, request);
}
