'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getDb } from './supabase';
import { getSubscriberByToken } from './queries';
import {
  answerInterviewQuestion,
  generateInterviewQuestions,
  type GapAnalysis,
  type InterviewPrepResult,
  type InterviewQuestionAnswerResult,
} from './llm';
import {
  getActiveResume,
  getJobById,
  getManualJobById,
  getTailoringSession,
} from './resume-queries';
import { getAnswerBank, buildFullAnswerSet } from './tailor-answer-bank';
import {
  getApplicationForJob,
  getApplicationForManualJob,
} from './applications';

const COOKIE_NAME = 'jh_token';
const MAX_CUSTOM_ANSWERS = 20;
const MIN_QUESTION_LENGTH = 8;
const MAX_QUESTION_LENGTH = 2000;

export type StoredInterviewAnswer = InterviewQuestionAnswerResult & {
  id: string;
  question: string;
  generated_at: string;
};

export type StoredInterviewPrep = InterviewPrepResult & {
  generated_at: string;
  custom_answers?: StoredInterviewAnswer[];
};

type InterviewPrepJson = Record<string, unknown> & {
  custom_answers?: unknown;
};

async function requireSubscriber() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) throw new Error('Sign in required');
  const sub = await getSubscriberByToken(token);
  if (!sub) throw new Error('Invalid session');
  return sub;
}

function isStoredInterviewPrep(value: unknown): value is StoredInterviewPrep {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.overview === 'string' && Array.isArray(v.questions) && typeof v.generated_at === 'string';
}

function parseCustomAnswers(value: unknown): StoredInterviewAnswer[] {
  if (!Array.isArray(value)) return [];
  const answers: StoredInterviewAnswer[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>;
    if (typeof v.id !== 'string' || typeof v.question !== 'string') continue;
    if (typeof v.talking_track !== 'string' || typeof v.framing !== 'string') continue;
    if (typeof v.generated_at !== 'string') continue;
    const evidence = Array.isArray(v.evidence)
      ? v.evidence.filter((e): e is string => typeof e === 'string')
      : [];
    answers.push({
      id: v.id,
      question: v.question,
      talking_track: v.talking_track,
      framing: v.framing,
      evidence,
      watch_outs: typeof v.watch_outs === 'string' ? v.watch_outs : undefined,
      generated_at: v.generated_at,
    });
  }
  return answers;
}

async function loadInterviewPrepJson(
  subscriberId: string,
  jobId?: number,
  manualJobId?: string
): Promise<InterviewPrepJson> {
  const application = manualJobId
    ? await getApplicationForManualJob(subscriberId, manualJobId)
    : jobId
      ? await getApplicationForJob(subscriberId, jobId)
      : null;

  return ((application?.interview_prep as InterviewPrepJson) ?? {});
}

async function saveInterviewPrepJson(
  subscriberId: string,
  json: InterviewPrepJson,
  jobId?: number,
  manualJobId?: string
) {
  let query = getDb()
    .from('job_applications')
    .update({
      interview_prep: json,
      updated_at: new Date().toISOString(),
    })
    .eq('subscriber_id', subscriberId);

  query = manualJobId ? query.eq('manual_job_id', manualJobId) : query.eq('job_id', jobId!);
  const { error } = await query;
  if (error) throw error;
}

function revalidateInterviewPaths(jobId?: number, manualJobId?: string) {
  revalidatePath('/');
  if (jobId) revalidatePath(`/jobs/${jobId}`);
  if (manualJobId) revalidatePath(`/jobs/manual/${manualJobId}`);
}

export async function getInterviewPrepState(
  jobId?: number,
  manualJobId?: string
): Promise<{ prep: StoredInterviewPrep | null; answers: StoredInterviewAnswer[] }> {
  const sub = await requireSubscriber();
  const json = await loadInterviewPrepJson(sub.id, jobId, manualJobId);
  return {
    prep: isStoredInterviewPrep(json) ? json : null,
    answers: parseCustomAnswers(json.custom_answers),
  };
}

export async function getStoredInterviewPrep(
  jobId?: number,
  manualJobId?: string
): Promise<StoredInterviewPrep | null> {
  const { prep } = await getInterviewPrepState(jobId, manualJobId);
  return prep;
}

async function resolveInterviewContext(
  subscriberId: string,
  jobId: number | null,
  manualJobId: string | null
) {
  let job: { title: string; company: string | null; description: string } | null = null;
  let application = null;
  let resume = null;

  if (manualJobId) {
    const [resumeRow, manual, applicationRow] = await Promise.all([
      getActiveResume(subscriberId),
      getManualJobById(manualJobId, subscriberId),
      getApplicationForManualJob(subscriberId, manualJobId),
    ]);
    resume = resumeRow;
    if (!manual?.description) throw new Error('Job not found');
    job = {
      title: manual.title,
      company: manual.company,
      description: manual.description,
    };
    application = applicationRow;
  } else if (jobId) {
    const [resumeRow, scraped, applicationRow] = await Promise.all([
      getActiveResume(subscriberId),
      getJobById(jobId),
      getApplicationForJob(subscriberId, jobId),
    ]);
    resume = resumeRow;
    if (!scraped?.description) throw new Error('Job not found or missing description');
    job = {
      title: scraped.title,
      company: scraped.company,
      description: scraped.description,
    };
    application = applicationRow;
  } else {
    throw new Error('Invalid job');
  }

  if (!resume) throw new Error('Upload your resume in settings first');

  if (!application || application.stage !== 'interviewing') {
    throw new Error('Interview prep is available for jobs in the Interviewing stage');
  }

  let gapAnalysis: GapAnalysis | null = null;
  let extraContext = '';
  let sessionAnswers: ReturnType<typeof buildFullAnswerSet> = [];

  if (application.tailoring_session_id) {
    const session = await getTailoringSession(application.tailoring_session_id, subscriberId);
    if (session) {
      if (session.gap_analysis && 'summary' in session.gap_analysis) {
        gapAnalysis = session.gap_analysis as GapAnalysis;
      }
      extraContext = session.extra_context ?? '';
      const bank = await getAnswerBank(subscriberId);
      sessionAnswers = buildFullAnswerSet(session.questions, session.answers, bank);
    }
  }

  const bank = sessionAnswers.length ? [] : await getAnswerBank(subscriberId);
  const priorAnswers =
    sessionAnswers.length > 0
      ? sessionAnswers
      : bank.map((b) => ({
          question_id: b.answer_key,
          answer: b.answer,
          question: b.question,
          related_requirement: b.related_requirement,
        }));

  return { resume, job, gapAnalysis, priorAnswers, extraContext, application };
}

export async function generateInterviewPrepForJob(
  jobId?: number,
  manualJobId?: string,
  regenerate = false
): Promise<StoredInterviewPrep> {
  const sub = await requireSubscriber();
  const existingJson = await loadInterviewPrepJson(sub.id, jobId, manualJobId);
  const existingAnswers = parseCustomAnswers(existingJson.custom_answers);

  if (!regenerate && isStoredInterviewPrep(existingJson)) {
    return { ...existingJson, custom_answers: existingAnswers };
  }

  const { resume, job, gapAnalysis, priorAnswers, extraContext } =
    await resolveInterviewContext(
      sub.id,
      jobId ?? null,
      manualJobId ?? null
    );

  const result = await generateInterviewQuestions({
    resumeText: resume.content_text,
    job,
    gapAnalysis,
    priorAnswers,
    extraContext,
  });

  const stored: StoredInterviewPrep = {
    ...result,
    generated_at: new Date().toISOString(),
    custom_answers: existingAnswers,
  };

  await saveInterviewPrepJson(sub.id, stored, jobId, manualJobId);
  revalidateInterviewPaths(jobId, manualJobId);
  return stored;
}

function normalizeQuestion(question: string) {
  const trimmed = question.trim().replace(/\s+/g, ' ');
  if (trimmed.length < MIN_QUESTION_LENGTH) {
    throw new Error('Paste a full interview question first');
  }
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    throw new Error(`Keep the question under ${MAX_QUESTION_LENGTH} characters`);
  }
  return trimmed;
}

const MAX_REVISION_LENGTH = 1500;

export async function answerInterviewQuestionForJob(
  question: string,
  jobId?: number,
  manualJobId?: string,
  replaceId?: string,
  revisionNotes?: string
): Promise<StoredInterviewAnswer> {
  const sub = await requireSubscriber();
  const normalized = normalizeQuestion(question);
  const notes = revisionNotes?.trim() ?? '';
  if (notes && notes.length > MAX_REVISION_LENGTH) {
    throw new Error(`Keep tweak notes under ${MAX_REVISION_LENGTH} characters`);
  }
  if (replaceId && !notes) {
    throw new Error('Add what you want changed before applying tweaks');
  }

  const { resume, job, gapAnalysis, priorAnswers, extraContext } =
    await resolveInterviewContext(
      sub.id,
      jobId ?? null,
      manualJobId ?? null
    );

  const json = await loadInterviewPrepJson(sub.id, jobId, manualJobId);
  const current = parseCustomAnswers(json.custom_answers);
  const previous = replaceId ? current.find((a) => a.id === replaceId) : undefined;
  if (replaceId && !previous) {
    throw new Error('Could not find that draft to tweak');
  }

  const result = await answerInterviewQuestion(
    {
      resumeText: resume.content_text,
      job,
      gapAnalysis,
      priorAnswers,
      extraContext,
    },
    normalized,
    previous && notes
      ? {
          previous: {
            talking_track: previous.talking_track,
            framing: previous.framing,
            evidence: previous.evidence,
            watch_outs: previous.watch_outs,
          },
          notes,
        }
      : undefined
  );

  if (!result.talking_track) {
    throw new Error('Could not draft an answer. Try rephrasing the question.');
  }

  const stored: StoredInterviewAnswer = {
    id: replaceId || crypto.randomUUID(),
    question: normalized,
    talking_track: result.talking_track,
    framing: result.framing,
    evidence: result.evidence,
    watch_outs: result.watch_outs,
    generated_at: new Date().toISOString(),
  };

  let custom_answers: StoredInterviewAnswer[];
  if (replaceId && current.some((a) => a.id === replaceId)) {
    custom_answers = current.map((a) => (a.id === replaceId ? stored : a));
  } else {
    custom_answers = [
      stored,
      ...current.filter((a) => a.question.toLowerCase() !== normalized.toLowerCase()),
    ].slice(0, MAX_CUSTOM_ANSWERS);
  }

  await saveInterviewPrepJson(sub.id, { ...json, custom_answers }, jobId, manualJobId);
  revalidateInterviewPaths(jobId, manualJobId);
  return stored;
}

export async function deleteInterviewAnswerForJob(
  answerId: string,
  jobId?: number,
  manualJobId?: string
): Promise<void> {
  const sub = await requireSubscriber();
  if (!answerId) throw new Error('Missing answer');

  const json = await loadInterviewPrepJson(sub.id, jobId, manualJobId);
  const custom_answers = parseCustomAnswers(json.custom_answers).filter((a) => a.id !== answerId);
  await saveInterviewPrepJson(sub.id, { ...json, custom_answers }, jobId, manualJobId);
  revalidateInterviewPaths(jobId, manualJobId);
}
