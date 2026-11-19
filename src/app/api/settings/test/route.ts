import { z } from 'zod';
import { getDb } from '@/lib/db';
import { AiUnavailableError, askClaude, hasApiKey } from '@/lib/ai/client';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!hasApiKey()) {
    return Response.json({ ok: false, message: 'No key found. Add ANTHROPIC_API_KEY to .env.local and restart the app.' });
  }
  try {
    await askClaude({
      db: getDb(),
      feature: 'connection-test',
      tier: 'cheap',
      system: 'Reply with JSON only.',
      user: 'Reply with {"ok": true}',
      schema: z.object({ ok: z.boolean() }),
      maxTokens: 200,
    });
    return Response.json({ ok: true, message: 'Connected. The key works.' });
  } catch (e) {
    const message = e instanceof AiUnavailableError ? e.message : 'The test failed.';
    return Response.json({ ok: false, message });
  }
}
