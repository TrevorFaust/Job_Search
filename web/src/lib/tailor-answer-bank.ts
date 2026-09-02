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

const MATCH_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'with', 'from',
  'your', 'you', 'have', 'has', 'had', 'any', 'ever', 'this', 'that', 'these', 'those',
  'what', 'how', 'when', 'where', 'which', 'who', 'why', 'would', 'could', 'should',
  'can', 'do', 'did', 'does', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'also', 'just', 'like', 'even', 'into', 'than', 'then', 'them', 'they', 'their',
  'there', 'some', 'such', 'only', 'more', 'most', 'over', 'under', 'after', 'before',
  'while', 'during', 'using', 'used', 'use', 'including', 'specifically', 'actually',
  'currently', 'something', 'anything', 'everything', 'whether', 'because', 'since',
  'still', 'really', 'very', 'much', 'many', 'make', 'made', 'take', 'took', 'give',
  'know', 'think', 'look', 'walk', 'through', 'example', 'things', 'kind', 'type',
  'part', 'role', 'job', 'work', 'working', 'worked', 'professional', 'experience',
  'experiences', 'skills', 'skill', 'knowledge', 'ability', 'able', 'resume',
  'application', 'company', 'team', 'people', 'about', 'into', 'other', 'than',
  'strong', 'years', 'year', 'please', 'need', 'needed', 'must', 'within', 'across',
]);

export function normalizeAnswerKey(relatedRequirement: string, question?: string): string {
  const raw = (relatedRequirement || question || 'general').toLowerCase();
  return raw
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function contentTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)) {
    if (raw.length < 3 || MATCH_STOPWORDS.has(raw)) continue;
    tokens.add(raw);
  }
  return tokens;
}

function tokenCoverage(needle: Set<string>, haystack: Set<string>): { overlap: number; coverage: number } {
  if (!needle.size || !haystack.size) return { overlap: 0, coverage: 0 };
  let overlap = 0;
  for (const token of needle) {
    if (haystack.has(token)) overlap += 1;
  }
  return { overlap, coverage: overlap / needle.size };
}

function isFuzzyBankMatch(question: TailorQuestion, saved: StoredTailorAnswer): boolean {
  const qReq = contentTokens(question.related_requirement);
  const qAll = contentTokens(`${question.related_requirement} ${question.question}`);
  const sReq = contentTokens(saved.related_requirement);
  const sAll = contentTokens(`${saved.related_requirement} ${saved.question}`);

  const reqVsReq = tokenCoverage(qReq, sReq);
  if (reqVsReq.overlap >= 2 && reqVsReq.coverage >= 0.5) return true;
  if (reqVsReq.overlap >= 1 && reqVsReq.coverage >= 0.8) return true;

  const qVsSaved = tokenCoverage(qAll, sAll);
  if (qVsSaved.overlap >= 2 && qVsSaved.coverage >= 0.55) return true;
  if (qVsSaved.overlap >= 1 && qVsSaved.coverage >= 0.85 && [...qAll].some((t) => t.length >= 5)) {
    return true;
  }
  return false;
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
    const reqHit = bank.find((b) => normalizeAnswerKey(b.related_requirement) === req);
    if (reqHit) return reqHit;
  }

  return bank.find((b) => isFuzzyBankMatch(question, b));
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
