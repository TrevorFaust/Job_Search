import { getDb } from './supabase';
import type { TailorAnswer, TailorQuestion } from './llm';

export type StoredTailorAnswer = {
  id: string;
  subscriber_id: string;
  answer_key: string;
  question: string;
  answer: string;
  related_requirement: string;
  created_at: string;
  updated_at: string;
};

export function normalizeAnswerKey(relatedRequirement: string, question?: string): string {
  const raw = (relatedRequirement || question || 'general').toLowerCase();
  return raw
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export async function getAnswerBank(subscriberId: string): Promise<StoredTailorAnswer[]> {
  const { data, error } = await getDb()
    .from('tailor_answer_bank')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StoredTailorAnswer[];
}

export function findBankMatch(
  question: TailorQuestion,
  bank: StoredTailorAnswer[]
): StoredTailorAnswer | undefined {
  const keys = [
    normalizeAnswerKey(question.related_requirement, question.question),
    normalizeAnswerKey(question.related_requirement),
    normalizeAnswerKey(question.question),
  ].filter(Boolean);

  for (const key of keys) {
    const hit = bank.find((b) => b.answer_key === key);
    if (hit) return hit;
  }

  const req = normalizeAnswerKey(question.related_requirement);
  if (req) {
    return bank.find((b) => normalizeAnswerKey(b.related_requirement) === req);
  }
  return undefined;
}

export type MergedQuestions = {
  questions: TailorQuestion[];
  answers: TailorAnswer[];
  reusedCount: number;
};

/** Drop questions already answered in the bank; carry forward saved answers. */
export function mergeQuestionsWithBank(
  questions: TailorQuestion[],
  bank: StoredTailorAnswer[]
): MergedQuestions {
  const visible: TailorQuestion[] = [];
  const answers: TailorAnswer[] = [];
  let reusedCount = 0;

  for (const q of questions) {
    const saved = findBankMatch(q, bank);
    if (saved) {
      reusedCount += 1;
      answers.push({
        question_id: q.id,
        answer: saved.answer,
        question: saved.question,
        related_requirement: saved.related_requirement || q.related_requirement,
      });
    } else {
      visible.push(q);
    }
  }

  return { questions: visible, answers, reusedCount };
}

export async function upsertAnswerBank(
  subscriberId: string,
  entries: Array<{
    question: string;
    answer: string;
    related_requirement: string;
  }>
) {
  if (!entries.length) return;

  const rows = entries
    .filter((e) => e.answer.trim())
    .map((e) => ({
      subscriber_id: subscriberId,
      answer_key: normalizeAnswerKey(e.related_requirement, e.question),
      question: e.question.trim(),
      answer: e.answer.trim(),
      related_requirement: e.related_requirement.trim(),
      updated_at: new Date().toISOString(),
    }));

  if (!rows.length) return;

  const { error } = await getDb()
    .from('tailor_answer_bank')
    .upsert(rows, { onConflict: 'subscriber_id,answer_key' });
  if (error) throw error;
}

/** Combine session answers with bank entries for resume generation. */
export function buildFullAnswerSet(
  sessionQuestions: TailorQuestion[],
  sessionAnswers: TailorAnswer[],
  bank: StoredTailorAnswer[]
): TailorAnswer[] {
  const byKey = new Map<string, TailorAnswer>();

  for (const saved of bank) {
    byKey.set(saved.answer_key, {
      question_id: `bank-${saved.answer_key}`,
      answer: saved.answer,
      question: saved.question,
      related_requirement: saved.related_requirement,
    });
  }

  for (const q of sessionQuestions) {
    const sessionAnswer = sessionAnswers.find((a) => a.question_id === q.id);
    if (!sessionAnswer?.answer.trim()) continue;
    byKey.set(normalizeAnswerKey(q.related_requirement, q.question), {
      question_id: q.id,
      answer: sessionAnswer.answer.trim(),
      question: q.question,
      related_requirement: q.related_requirement,
    });
  }

  return [...byKey.values()];
}
