import { cache } from 'react';
import { getDb } from './supabase';
import type { TailorAnswer } from './llm';

/** Keep corpus bounded so board fit stays fast on refresh. */
const CORPUS_MAX_CHARS = 60_000;
const MAX_SESSION_ROWS = 40;
const MAX_OUTPUT_CHARS = 8_000;

type SessionRow = {
  answers: unknown;
  extra_context: string | null;
  output_text: string | null;
};

type ApplicationRow = {
  interview_prep: unknown;
};

function pushUnique(chunks: string[], seen: Set<string>, text: string | null | undefined) {
  const cleaned = (text ?? '').replace(/\r/g, '').trim();
  if (cleaned.length < 20) return;

  const key = cleaned.toLowerCase().replace(/\s+/g, ' ').slice(0, 240);
  if (seen.has(key)) return;
  seen.add(key);
  chunks.push(cleaned);
}

function answersFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const parts: string[] = [];
  for (const item of value as TailorAnswer[]) {
    if (!item || typeof item !== 'object') continue;
    const answer = typeof item.answer === 'string' ? item.answer.trim() : '';
    if (!answer) continue;
    const question = typeof item.question === 'string' ? item.question.trim() : '';
    const req =
      typeof item.related_requirement === 'string' ? item.related_requirement.trim() : '';
    parts.push(
      [question && `Q: ${question}`, req && `Topic: ${req}`, `A: ${answer}`]
        .filter(Boolean)
        .join('\n')
    );
  }
  return parts;
}

function interviewAnswersFromPrep(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const custom = (value as { custom_answers?: unknown }).custom_answers;
  if (!Array.isArray(custom)) return [];
  const parts: string[] = [];
  for (const item of custom) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const question = typeof row.question === 'string' ? row.question.trim() : '';
    const talking = typeof row.talking_track === 'string' ? row.talking_track.trim() : '';
    const framing = typeof row.framing === 'string' ? row.framing.trim() : '';
    const evidence = Array.isArray(row.evidence)
      ? row.evidence.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
      : [];
    const body = [talking, framing, ...evidence].filter(Boolean).join('\n');
    if (!body) continue;
    parts.push([question && `Q: ${question}`, body].filter(Boolean).join('\n'));
  }
  return parts;
}

async function fetchRecentSessionCorpusRows(subscriberId: string): Promise<SessionRow[]> {
  const { data, error } = await getDb()
    .from('tailoring_sessions')
    .select('answers, extra_context, output_text')
    .eq('subscriber_id', subscriberId)
    .order('updated_at', { ascending: false })
    .limit(MAX_SESSION_ROWS);

  if (error) throw error;
  return (data ?? []) as SessionRow[];
}

async function buildCandidateExperienceCorpus(subscriberId: string): Promise<string | null> {
  const [resumesRes, bankRes, sessions, appsRes] = await Promise.all([
    getDb()
      .from('resumes')
      .select('content_text')
      .eq('subscriber_id', subscriberId)
      .order('updated_at', { ascending: false }),
    getDb()
      .from('tailor_answer_bank')
      .select('question, answer, related_requirement')
      .eq('subscriber_id', subscriberId)
      .order('updated_at', { ascending: false }),
    fetchRecentSessionCorpusRows(subscriberId),
    getDb()
      .from('job_applications')
      .select('interview_prep')
      .eq('subscriber_id', subscriberId),
  ]);

  if (resumesRes.error) throw resumesRes.error;
  if (bankRes.error) throw bankRes.error;
  if (appsRes.error) throw appsRes.error;

  const chunks: string[] = [];
  const seen = new Set<string>();

  for (const row of resumesRes.data ?? []) {
    pushUnique(chunks, seen, row.content_text as string);
  }

  for (const row of bankRes.data ?? []) {
    const question = (row.question as string | null)?.trim() ?? '';
    const answer = (row.answer as string | null)?.trim() ?? '';
    const req = (row.related_requirement as string | null)?.trim() ?? '';
    if (!answer) continue;
    pushUnique(
      chunks,
      seen,
      [question && `Q: ${question}`, req && `Topic: ${req}`, `A: ${answer}`]
        .filter(Boolean)
        .join('\n')
    );
  }

  for (const session of sessions) {
    for (const part of answersFromJson(session.answers)) {
      pushUnique(chunks, seen, part);
    }
    pushUnique(chunks, seen, session.extra_context);
    const output = session.output_text;
    pushUnique(
      chunks,
      seen,
      output && output.length > MAX_OUTPUT_CHARS ? output.slice(0, MAX_OUTPUT_CHARS) : output
    );
  }

  for (const app of (appsRes.data ?? []) as ApplicationRow[]) {
    for (const part of interviewAnswersFromPrep(app.interview_prep)) {
      pushUnique(chunks, seen, part);
    }
  }

  if (!chunks.length) return null;

  let corpus = '';
  for (const chunk of chunks) {
    const next = corpus ? `${corpus}\n\n---\n\n${chunk}` : chunk;
    if (next.length > CORPUS_MAX_CHARS) {
      const remaining = CORPUS_MAX_CHARS - corpus.length - 20;
      if (remaining > 100) corpus = `${corpus}\n\n---\n\n${chunk.slice(0, remaining)}`;
      break;
    }
    corpus = next;
  }

  return corpus.trim() || null;
}

/**
 * Broad experience corpus for board fit. Cached per request so fit sort / page
 * hydrate don't rebuild it repeatedly.
 */
export const getCandidateExperienceCorpus = cache(buildCandidateExperienceCorpus);
