import { getDb } from '@/lib/db';
import * as h from '@/lib/notebook/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return h.handleAdd(getDb(), request);
}
