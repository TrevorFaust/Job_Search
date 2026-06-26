'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSubscriberByToken } from './queries';
import { parseResumeFile } from './resume-parse';
import { extractResumeStructure } from './resume-structure';
import {
  createManualJob,
  getActiveResume,
  getJobById,
  getOrCreateManualTailoringSession,
  getOrCreateTailoringSession,
  getTailoringSession,
  resolveJobForSession,
  updateSession,
  upsertResume,
  type TailoringSession,
} from './resume-queries';
import {
  buildFullAnswerSet,
  getAnswerBank,
  mergeQuestionsWithBank,
  upsertAnswerBank,
} from './tailor-answer-bank';
import { analyzeResumeForJob, generateTailoredResume, type GapAnalysis, type TailorAnswer } from './llm';

const COOKIE_NAME = 'jh_token';

async function requireSubscriber(token?: string) {
  const jar = await cookies();
  const editToken = token ?? jar.get(COOKIE_NAME)?.value;
  if (!editToken) throw new Error('Sign in required');
  const sub = await getSubscriberByToken(editToken);
  if (!sub) throw new Error('Invalid session');
  return sub;
}

export async function saveResumeText(token: string, formData: FormData) {
  const sub = await requireSubscriber(token);
  const contentText = String(formData.get('content_text') ?? '').trim();
  if (contentText.length < 100) throw new Error('Paste at least a few lines of resume text');

  await upsertResume(sub.id, contentText, null, 'Master resume', extractResumeStructure(contentText));
  revalidatePath(`/settings/${token}`);
  revalidatePath('/resume');
}

export async function saveResumeFile(token: string, formData: FormData) {
  const sub = await requireSubscriber(token);
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose a file to upload');

  const { text, filename, formatMeta } = await parseResumeFile(file);
  if (text.length < 100) throw new Error('Could not extract enough text from that file');

  await upsertResume(sub.id, text, filename, 'Master resume', formatMeta);
  revalidatePath(`/settings/${token}`);
  revalidatePath('/resume');
}

export async function startTailorSession(jobId: number): Promise<TailoringSession> {
  const sub = await requireSubscriber();
  const resume = await getActiveResume(sub.id);
  if (!resume) throw new Error('Upload your resume in settings first');

  const job = await getJobById(jobId);
  if (!job?.description) throw new Error('Job not found or missing description');

  return getOrCreateTailoringSession(sub.id, jobId, resume, job.description);
}

export async function createManualJobAndTailor(formData: FormData) {
  const sub = await requireSubscriber();
  const resume = await getActiveResume(sub.id);
  if (!resume) throw new Error('Upload your resume in settings first');

  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  if (!title) throw new Error('Job title is required');
  if (description.length < 80) throw new Error('Paste the full job description (at least a few sentences)');

  const job = await createManualJob(sub.id, {
    title,
    company: String(formData.get('company') ?? '').trim(),
    location: String(formData.get('location') ?? '').trim(),
    url: String(formData.get('url') ?? '').trim(),
    salary: String(formData.get('salary') ?? '').trim(),
    description,
  });

  await getOrCreateManualTailoringSession(sub.id, job.id, resume, job.description);
  revalidatePath('/applications');
  redirect(`/tailor/manual/${job.id}`);
}

export async function runGapAnalysis(sessionId: string) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const [resume, job] = await Promise.all([
    getActiveResume(sub.id),
    resolveJobForSession(session, sub.id),
  ]);
  if (!resume || resume.id !== session.resume_id) throw new Error('Resume mismatch');
  if (!job?.description) throw new Error('Job not found');

  await updateSession(sessionId, sub.id, { status: 'analyzing', error_message: null });

  try {
    const bank = await getAnswerBank(sub.id);
    const priorAnswers = bank.map((b) => ({
      question_id: b.answer_key,
      answer: b.answer,
      question: b.question,
      related_requirement: b.related_requirement,
    }));

    const { gap_analysis, questions: rawQuestions } = await analyzeResumeForJob(
      resume.content_text,
      {
        title: job.title,
        company: job.company,
        description: job.description,
      },
      priorAnswers
    );

    const merged = mergeQuestionsWithBank(rawQuestions, bank);

    await updateSession(sessionId, sub.id, {
      status: 'questioning',
      gap_analysis,
      questions: merged.questions,
      answers: merged.answers,
    });

    return {
      gap_analysis,
      questions: merged.questions,
      answers: merged.answers,
      reusedCount: merged.reusedCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    await updateSession(sessionId, sub.id, { status: 'failed', error_message: message });
    throw err;
  }
}

export async function saveTailorAnswers(
  sessionId: string,
  answers: TailorAnswer[],
  extraContext = ''
) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const visibleAnswers = answers
    .filter((a) => a.answer.trim())
    .map((a) => {
      const q = session.questions.find((item) => item.id === a.question_id);
      return {
        ...a,
        question: q?.question,
        related_requirement: q?.related_requirement,
      };
    });

  const mergedAnswers = [
    ...session.answers.filter(
      (existing) => !visibleAnswers.some((a) => a.question_id === existing.question_id)
    ),
    ...visibleAnswers,
  ];

  await upsertAnswerBank(
    sub.id,
    visibleAnswers.map((a) => ({
      question: a.question ?? a.question_id,
      answer: a.answer,
      related_requirement: a.related_requirement ?? '',
    }))
  );

  await updateSession(sessionId, sub.id, {
    answers: mergedAnswers,
    extra_context: extraContext.trim(),
    status: 'questioning',
  });
}

export async function generateTailoredDraft(
  sessionId: string,
  extraContext = '',
  pagePreference: 'one' | 'two' = 'one'
) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const bank = await getAnswerBank(sub.id);
  if (!session.answers.some((a) => a.answer.trim()) && !bank.length) {
    throw new Error('Answer the clarifying questions first');
  }

  const [resume, job] = await Promise.all([
    getActiveResume(sub.id),
    resolveJobForSession(session, sub.id),
  ]);
  if (!resume || !job?.description) throw new Error('Missing resume or job');

  const context = extraContext.trim() || session.extra_context || '';

  await updateSession(sessionId, sub.id, {
    status: 'generating',
    error_message: null,
    extra_context: context,
    page_preference: pagePreference,
  });

  try {
    const gapAnalysis: GapAnalysis =
      session.gap_analysis && 'summary' in session.gap_analysis
        ? (session.gap_analysis as GapAnalysis)
        : { strong_matches: [], partial_matches: [], gaps: [], summary: '' };

    const fullAnswers = buildFullAnswerSet(session.questions, session.answers, bank);
    const formatMeta =
      (resume.format_meta?.sectionOrder?.length ?? 0) > 0
        ? resume.format_meta
        : extractResumeStructure(resume.content_text);

    const output_text = await generateTailoredResume(
      resume.content_text,
      { title: job.title, company: job.company, description: job.description },
      gapAnalysis,
      fullAnswers,
      {
        extraContext: context,
        pageLength: pagePreference,
        formatMeta,
      }
    );

    await updateSession(sessionId, sub.id, { status: 'done', output_text });
    return { output_text };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    await updateSession(sessionId, sub.id, { status: 'failed', error_message: message });
    throw err;
  }
}

export async function resetTailorSession(sessionId: string) {
  const sub = await requireSubscriber();
  const session = await getTailoringSession(sessionId, sub.id);
  if (!session) throw new Error('Session not found');

  const job = await resolveJobForSession(session, sub.id);
  const resume = await getActiveResume(sub.id);
  if (!job?.description || !resume) throw new Error('Missing job or resume');

  if (session.manual_job_id) {
    const fresh = await getOrCreateManualTailoringSession(
      sub.id,
      session.manual_job_id,
      resume,
      job.description
    );
    return fresh;
  }

  if (!session.job_id) throw new Error('Missing job reference');

  const fresh = await getOrCreateTailoringSession(sub.id, session.job_id, resume, job.description);
  return fresh;
}
