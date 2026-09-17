export type LlmProvider = 'anthropic' | 'openai';

export type LlmRuntime = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  interviewModel: string;
  source: 'user' | 'owner';
};

export function defaultModelFor(provider: LlmProvider, kind: 'main' | 'interview'): string {
  if (provider === 'openai') {
    return kind === 'interview' ? 'gpt-4o-mini' : 'gpt-4o';
  }
  return kind === 'interview'
    ? process.env.ANTHROPIC_INTERVIEW_MODEL ?? 'claude-haiku-4-5-20251001'
    : process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
}

function extractOpenAiText(data: {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
}): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part.text ?? ''))
      .join('')
      .trim();
  }
  return '';
}

async function openaiText(runtime: LlmRuntime, system: string, user: string, maxTokens: number, model: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 280) || response.statusText}`);
  }
  const data = (await response.json()) as Parameters<typeof extractOpenAiText>[0];
  const text = extractOpenAiText(data);
  if (!text) throw new Error('Empty response from OpenAI');
  return text;
}

async function anthropicText(runtime: LlmRuntime, system: string, user: string, maxTokens: number, model: string) {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: runtime.apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0.4,
  });
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('Empty response from Claude');
  return block.text.trim();
}

export async function completeLlmText(
  runtime: LlmRuntime,
  system: string,
  user: string,
  maxTokens = 8192,
  model?: string
): Promise<string> {
  const chosen = model ?? runtime.model;
  if (runtime.provider === 'openai') {
    return openaiText(runtime, system, user, maxTokens, chosen);
  }
  return anthropicText(runtime, system, user, maxTokens, chosen);
}
