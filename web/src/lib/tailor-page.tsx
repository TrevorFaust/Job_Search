import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  getActiveResume,
  getJobById,
  getManualJobById,
  getOrCreateManualTailoringSession,
  getOrCreateTailoringSession,
  updateSession,
} from './resume-queries';
import { getAnswerBank, mergeQuestionsWithBank } from './tailor-answer-bank';
import type { ManualJob } from './manual-jobs';
import type { TailoringSession } from './resume-queries';

type PrepareResult =
  | { kind: 'no_resume'; element: ReactNode }
  | { kind: 'not_found' }
  | { kind: 'no_description'; element: ReactNode }
  | {
      kind: 'ready';
      session: TailoringSession;
      initialReusedCount: number;
      manualJob?: ManualJob;
    };

export async function prepareTailorSession(opts: {
  subscriberId: string;
  editToken: string;
  jobId?: number;
  manualJobId?: string;
}): Promise<PrepareResult> {
  const resume = await getActiveResume(opts.subscriberId);
  if (!resume) {
    return {
      kind: 'no_resume',
      element: (
        <main className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-zinc-50">
            Upload your resume first
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            We need your master resume before tailoring it for a job.
          </p>
          <Link
            href={`/settings/${opts.editToken}#resume`}
            className="mt-6 inline-block rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
          >
            Add resume
          </Link>
        </main>
      ),
    };
  }

  let description: string | null = null;
  let manualJob: ManualJob | undefined;

  if (opts.manualJobId) {
    manualJob = (await getManualJobById(opts.manualJobId, opts.subscriberId)) ?? undefined;
    if (!manualJob) return { kind: 'not_found' };
    description = manualJob.description;
  } else if (opts.jobId) {
    const job = await getJobById(opts.jobId);
    if (!job) return { kind: 'not_found' };
    description = job.description;
  } else {
    return { kind: 'not_found' };
  }

  if (!description) {
    return {
      kind: 'no_description',
      element: (
        <main className="mx-auto max-w-lg px-6 py-20 text-center text-zinc-400">
          This job has no description to tailor against.
          <Link href="/" className="mt-4 block text-amber-400 hover:underline">
            Back to board
          </Link>
        </main>
      ),
    };
  }

  let session =
    opts.manualJobId && manualJob
      ? await getOrCreateManualTailoringSession(
          opts.subscriberId,
          manualJob.id,
          resume,
          manualJob.description
        )
      : await getOrCreateTailoringSession(opts.subscriberId, opts.jobId!, resume, description);

  let initialReusedCount = 0;

  if (session.gap_analysis && 'summary' in session.gap_analysis) {
    const bank = await getAnswerBank(opts.subscriberId);
    const merged = mergeQuestionsWithBank(session.questions, bank);
    if (
      merged.reusedCount > 0 &&
      (merged.questions.length !== session.questions.length ||
        merged.answers.length !== session.answers.length)
    ) {
      await updateSession(session.id, opts.subscriberId, {
        questions: merged.questions,
        answers: merged.answers,
      });
      session = { ...session, questions: merged.questions, answers: merged.answers };
    }
    initialReusedCount = session.answers.filter(
      (a) => !session.questions.some((q) => q.id === a.question_id)
    ).length;
  }

  return { kind: 'ready', session, initialReusedCount, manualJob };
}
