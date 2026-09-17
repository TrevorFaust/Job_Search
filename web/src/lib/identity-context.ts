import 'server-only';
import { AsyncLocalStorage } from 'async_hooks';
import type { CandidateIdentity } from './user-profile';
import type { LlmRuntime } from './llm-runtime';

const identityStore = new AsyncLocalStorage<CandidateIdentity>();
const llmStore = new AsyncLocalStorage<LlmRuntime>();

export function withIdentityOnly<T>(identity: CandidateIdentity, fn: () => Promise<T>): Promise<T> {
  return identityStore.run(identity, fn);
}

export function withCandidateContext<T>(
  identity: CandidateIdentity,
  llm: LlmRuntime,
  fn: () => Promise<T>
): Promise<T> {
  return identityStore.run(identity, () => llmStore.run(llm, fn));
}

export function currentIdentity(): CandidateIdentity | null {
  return identityStore.getStore() ?? null;
}

export function currentLlmRuntime(): LlmRuntime | null {
  return llmStore.getStore() ?? null;
}

export function requireLlmRuntime(): LlmRuntime {
  const runtime = currentLlmRuntime();
  if (!runtime) {
    throw new Error('Add your own Anthropic or OpenAI API key in Profile before tailoring.');
  }
  return runtime;
}
