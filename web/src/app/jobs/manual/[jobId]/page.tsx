import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { JobDescription } from '@/components/JobDescription';
import { BoardHomeLink } from '@/components/BoardHomeLink';
import { InterviewPrepPanel } from '@/components/InterviewPrepPanel';
import { MarkAppliedButton } from '@/components/MarkAppliedButton';
import { ApplicationStageSelect } from '@/components/ApplicationStageSelect';
import { formatPostedDate } from '@/lib/filters';
import { getApplicationForManualJob } from '@/lib/applications';
import { getInterviewPrepState } from '@/lib/interview-actions';
import { getSubscriberByToken } from '@/lib/queries';
import { getManualJobById, getLatestTailoringSessionForManualJob, getTailoringSession } from '@/lib/resume-queries';
import { RemoveApplicationButton } from '@/components/RemoveApplicationButton';
import { DismissJobButton } from '@/components/DismissJobButton';

type Params = Promise<{ jobId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ManualJobDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { jobId } = await params;
  const query = await searchParams;
  const from = typeof query.from === 'string' ? query.from : undefined;

  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  if (!token) redirect('/sign-in');

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) redirect('/sign-in');

  const job = await getManualJobById(jobId, subscriber.id);
  if (!job) notFound();

  const application = await getApplicationForManualJob(subscriber.id, jobId);
  const session = application?.tailoring_session_id
    ? await getTailoringSession(application.tailoring_session_id, subscriber.id)
    : await getLatestTailoringSessionForManualJob(subscriber.id, jobId);
  const hasDrafts = !!(session?.output_text || session?.cover_letter_text);
  const interviewState =
    application?.stage === 'interviewing'
      ? await getInterviewPrepState(undefined, jobId)
      : { prep: null, answers: [] };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BoardHomeLink from={from} className="text-sm text-zinc-500 hover:text-amber-300">
        ← Back to job board
      </BoardHomeLink>

      <header className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <p className="text-xs uppercase tracking-wide text-amber-400/80">Manual application</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-zinc-50">
          {job.title}
        </h1>
        <p className="mt-2 text-lg text-zinc-300">{job.company ?? 'Unknown company'}</p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
          <div>
            <dt className="inline text-zinc-600">Location </dt>
            <dd className="inline text-zinc-400">{job.location ?? 'Not listed'}</dd>
          </div>
          {job.salary && (
            <div>
              <dt className="inline text-zinc-600">Salary </dt>
              <dd className="inline font-mono text-emerald-400">{job.salary}</dd>
            </div>
          )}
          <div>
            <dt className="inline text-zinc-600">Added </dt>
            <dd className="inline text-zinc-400">
              {formatPostedDate(null, job.created_at)}
            </dd>
          </div>
          {application?.applied_at && (
            <div>
              <dt className="inline text-zinc-600">Applied </dt>
              <dd className="inline text-zinc-400">
                {formatPostedDate(application.applied_at, application.applied_at)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!application && (
            <>
              <Link
                href={`/tailor/manual/${job.id}`}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              >
                Tailor resume
              </Link>
              <MarkAppliedButton
                manualJobId={job.id}
                sessionId={session?.id}
                label="I've applied"
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
              />
              <DismissJobButton
                manualJobId={job.id}
                redirectTo="/"
                className="text-sm text-zinc-500 hover:text-zinc-300"
              />
            </>
          )}
          {application && (
            <div className="flex flex-wrap items-center gap-3">
              <ApplicationStageSelect manualJobId={job.id} stage={application.stage} />
              <Link
                href={`/tailor/manual/${job.id}`}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
              >
                {hasDrafts ? 'View resume & cover letter' : 'Tailor resume'}
              </Link>
              <Link
                href="/?view=applied"
                className="text-sm text-amber-400 hover:underline"
              >
                View in Applied tab
              </Link>
              <RemoveApplicationButton manualJobId={job.id} className="text-sm text-zinc-500 hover:text-zinc-300" />
            </div>
          )}
          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
            >
              Open original listing ↗
            </a>
          )}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Description
        </h2>
        {job.description ? (
          <JobDescription description={job.description} />
        ) : (
          <p className="text-sm text-zinc-500">No description stored for this job.</p>
        )}
      </section>

      {application?.stage === 'interviewing' && (
        <InterviewPrepPanel
          manualJobId={job.id}
          initialPrep={interviewState.prep}
          initialAnswers={interviewState.answers}
        />
      )}
    </main>
  );
}
