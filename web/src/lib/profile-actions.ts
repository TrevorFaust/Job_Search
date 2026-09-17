'use server';

import { revalidatePath } from 'next/cache';
import { getSubscriberByToken } from './queries';
import {
  clearUserLlmKey,
  removeLearnedFact,
  saveUserLlmKey,
  saveUserProfileRow,
  type ProfileSaveInput,
} from './user-profile';
import type { LlmProvider } from './llm-runtime';

async function requireByToken(token: string) {
  const sub = await getSubscriberByToken(token);
  if (!sub) throw new Error('Invalid settings link');
  return sub;
}

export async function saveUserProfile(token: string, input: ProfileSaveInput) {
  const sub = await requireByToken(token);
  if (!input.display_name.trim()) throw new Error('Add your name');
  await saveUserProfileRow(sub.id, input);
  revalidatePath(`/settings/${token}`);
  revalidatePath('/');
}

export async function saveLlmApiKey(
  token: string,
  provider: LlmProvider,
  apiKey: string,
  model?: string
) {
  const sub = await requireByToken(token);
  await saveUserLlmKey(sub.id, provider, apiKey, model);
  revalidatePath(`/settings/${token}`);
}

export async function deleteLlmApiKey(token: string) {
  const sub = await requireByToken(token);
  await clearUserLlmKey(sub.id);
  revalidatePath(`/settings/${token}`);
}

export async function deleteLearnedFact(token: string, factId: string) {
  const sub = await requireByToken(token);
  await removeLearnedFact(sub.id, factId);
  revalidatePath(`/settings/${token}`);
}
