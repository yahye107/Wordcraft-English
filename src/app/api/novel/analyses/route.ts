import { getDb } from '@/lib/db';
import * as h from '@/lib/novel/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return h.handleAnalyse(getDb(), request);
}
