import { getDb } from '@/lib/db';
import { contentDir } from '@/lib/content/dir';
import { handleVerdict } from '@/lib/content/handlers';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleVerdict(getDb(), contentDir(), request);
}
