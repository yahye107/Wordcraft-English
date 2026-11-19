import { getDb } from '@/lib/db';
import * as h from '@/lib/writing/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return h.handleCreateSession(getDb(), request);
}
