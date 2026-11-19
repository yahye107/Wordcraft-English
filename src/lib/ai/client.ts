import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';
import type { Db } from '@/lib/db';
import { getModels } from '@/lib/settings';
import { estimateCostUsd, isOverBudget } from './budget';

/** Thrown when an AI feature cannot run: no key, over budget, call failed or bad output. Callers fall back. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export type AiRequest = {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  effort: Effort;
};
export type AiResponse = { text: string; inputTokens: number; outputTokens: number };
export type Effort = 'low' | 'medium' | 'high';

let mockResponder: ((req: AiRequest) => Promise<AiResponse>) | null = null;

/** Test only: active when WORDCRAFT_AI_MOCK=1. */
export function setMockResponder(fn: ((req: AiRequest) => Promise<AiResponse>) | null): void {
  mockResponder = fn;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** True when AI calls can be attempted (a key is set, or the test mock is on). */
export function aiConfigured(): boolean {
  return hasApiKey() || (process.env.WORDCRAFT_AI_MOCK === '1' && mockResponder !== null);
}

async function callModel(req: AiRequest): Promise<AiResponse> {
  if (process.env.WORDCRAFT_AI_MOCK === '1' && mockResponder) return mockResponder(req);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
    output_config: { effort: req.effort },
  });
  const text = res.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}

/** Find the first complete JSON object in model text (it may be wrapped in prose or a code fence). */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(text.slice(start, end + 1));
}

export async function askClaude<T>(opts: {
  db: Db;
  feature: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  tier?: 'main' | 'cheap';
  model?: string;
  maxTokens?: number;
  effort?: Effort;
}): Promise<T> {
  if (isOverBudget(opts.db)) throw new AiUnavailableError('The monthly AI spend cap has been reached.');
  if (!aiConfigured()) throw new AiUnavailableError('No ANTHROPIC_API_KEY is set.');

  const model = opts.model ?? getModels(opts.db)[opts.tier ?? 'main'];
  const req: AiRequest = {
    model,
    system: opts.system,
    user: opts.user,
    maxTokens: opts.maxTokens ?? 4000,
    effort: opts.effort ?? (opts.tier === 'cheap' ? 'low' : 'medium'),
  };

  let res: AiResponse;
  try {
    res = await callModel(req);
  } catch (e) {
    throw new AiUnavailableError(`The AI request failed: ${(e as Error).message}`);
  }

  opts.db.run(
    'INSERT INTO ai_usage (feature, model, input_tokens, output_tokens, est_cost_usd) VALUES (?, ?, ?, ?, ?)',
    [opts.feature, model, res.inputTokens, res.outputTokens, estimateCostUsd(model, res.inputTokens, res.outputTokens)],
  );

  let parsed: unknown;
  try {
    parsed = extractJson(res.text);
  } catch {
    throw new AiUnavailableError('The AI reply was not valid JSON.');
  }
  const checked = opts.schema.safeParse(parsed);
  if (!checked.success) throw new AiUnavailableError('The AI reply did not have the expected shape.');
  return checked.data;
}
