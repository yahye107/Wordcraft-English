import { getDb } from '@/lib/db';
import { contentDir } from '@/lib/content/dir';
import { handleStatus } from '@/lib/content/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleStatus(getDb(), contentDir(), request);
}
