import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { BoardHomeLink } from '@/components/BoardHomeLink';
import { JobDetailTabs, type JobDetailTab } from '@/components/JobDetailTabs';
import { MarkAppliedButton } from '@/components/MarkAppliedButton';
import { ApplicationStageSelect } from '@/components/ApplicationStageSelect';
import { formatPostedDate } from '@/lib/filters';
import { getApplicationForJob } from '@/lib/applications';
import { getInterviewPrepState } from '@/lib/interview-actions';
import { resolveFollowUpContactsForApplication } from '@/lib/follow-up-actions';
import { getSubscriberByToken } from '@/lib/queries';
import { formatAnnualSalary } from '@/lib/salary';
import { getJobById, getLatestTailoringSessionForJob, getTailoringSession } from '@/lib/resume-queries';
import { prioritySourceMeta } from '@/lib/priority-jobs';
import { RemoveApplicationButton } from '@/components/RemoveApplicationButton';
import { DismissJobButton } from '@/components/DismissJobButton';

type Params = Promise<{ jobId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ jobId: jobIdRaw }, query, jar] = await Promise.all([params, searchParams, cookies()]);
  const from = typeof query.from === 'string' ? query.from : undefined;
  const jobId = Number(jobIdRaw);
  if (!Number.isFinite(jobId)) notFound();

  const token = jar.get('jh_token')?.value;
  const [job, subscriber] = await Promise.all([
    getJobById(jobId),
    token ? getSubscriberByToken(token) : Promise.resolve(null),
  ]);
  if (!job) notFound();

  const application = subscriber ? await getApplicationForJob(subscriber.id, jobId) : null;
  // Board listings expire after ~6 weeks; applied jobs stay reachable from Applied.
  if (job.status !== 'active' && !application) notFound();
  const session =
    application?.tailoring_session_id && subscriber
      ? await getTailoringSession(application.tailoring_session_id, subscriber.id)
      : subscriber
        ? await getLatestTailoringSessionForJob(subscriber.id, jobId)
        : null;
  const interviewState =
    subscriber && application?.stage === 'interviewing'
      ? await getInterviewPrepState(jobId)
      : { prep: null, answers: [] };
  const followUpContacts =
    subscriber && application
      ? await resolveFollowUpContactsForApplication(
          subscriber.id,
          { title: job.title, company: job.company, description: job.description ?? '' },
          jobId
        )
      : null;

  const salary =
    formatAnnualSalary(job.salary_min_annual, job.salary_max_annual) ?? job.salary ?? null;
  const priorityMeta = job.is_special ? prioritySourceMeta(job.source, job.company) : null;
  const hasDrafts = !!(session?.output_text || session?.cover_letter_text);
  const defaultTab: JobDetailTab =
    typeof query.tab === 'string'
      ? (query.tab as JobDetailTab)
      : application
        ? hasDrafts
          ? 'materials'
          : 'follow-up'
        : 'description';

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <BoardHomeLink from={from} className="text-sm text-ink-faint hover:text-brand">
        ← Back to job board
      </BoardHomeLink>

      <header className="mt-6 rounded-2xl border border-line bg-sheet p-6 shadow-[0_1px_0_rgb(26_28_24/0.04),0_16px_36px_-24px_rgb(26_28_24/0.4)]">
        {job.is_special && priorityMeta && !application && (
          <div className="mb-4 rounded-lg border border-brand/40 bg-brand/10 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-brand">
              Priority opportunity
            </p>
            <p className="mt-1 text-sm text-brand">
              This {priorityMeta.label} role is watched daily. Find it under the Priority tab on the job board.
            </p>
          </div>
        )}
        <p className="text-xs uppercase tracking-wide text-brand">{job.source}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-ink">
          {job.title}
        </h1>
        <p className="mt-2 text-lg text-ink-soft">{job.company ?? 'Unknown company'}</p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-faint">
          <div>
            <dt className="inline text-ink-faint">Location </dt>
            <dd className="inline text-ink-soft">{job.location ?? 'Not listed'}</dd>
          </div>
          {salary && (
            <div>
              <dt className="inline text-ink-faint">Salary </dt>
              <dd className="inline font-semibold tabular-nums text-brand">{salary}</dd>
            </div>
          )}
          <div>
            <dt className="inline text-ink-faint">Posted </dt>
            <dd className="inline text-ink-soft">
              {formatPostedDate(job.posted_at, job.created_at)}
            </dd>
          </div>
          {application?.applied_at && (
            <div>
              <dt className="inline text-ink-faint">Applied </dt>
              <dd className="inline text-ink-soft">
                {formatPostedDate(application.applied_at, application.applied_at)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {subscriber && !application && (
            <>
              <Link
                href={`/tailor/${job.id}`}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-paper hover:bg-brand-soft"
              >
                Tailor resume
              </Link>
              <MarkAppliedButton
                jobId={job.id}
                label="I've applied"
                className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:border-brand hover:text-brand"
              />
              <DismissJobButton
                jobId={job.id}
                redirectTo="/"
                className="text-sm text-ink-faint hover:text-ink"
              />
            </>
          )}
          {subscriber && application && (
            <div className="flex flex-wrap items-center gap-3">
              <ApplicationStageSelect jobId={job.id} stage={application.stage} />
              <Link
                href="/?view=applied"
                className="text-sm text-brand hover:underline"
              >
                View in Applied tab
              </Link>
              <RemoveApplicationButton jobId={job.id} className="text-sm text-ink-faint hover:text-ink" />
            </div>
          )}
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:border-brand hover:text-brand"
          >
            Apply on original site ↗
          </a>
        </div>
      </header>

      <Suspense fallback={<p className="mt-8 text-sm text-ink-faint">Loading…</p>}>
        <JobDetailTabs
          description={job.description ?? ''}
          tailorHref={`/tailor/${job.id}`}
          outputText={session?.output_text ?? null}
          coverLetterText={session?.cover_letter_text ?? null}
          jobId={job.id}
          companyName={job.company}
          followUpContacts={followUpContacts}
          canFollowUp={!!application}
          canInterview={!!application}
          interviewEnabled={application?.stage === 'interviewing'}
          interviewPrep={interviewState.prep}
          interviewAnswers={interviewState.answers}
          followUpSummary="Find hiring managers and recruiters, copy outreach messages, and track who you've contacted."
          defaultTab={defaultTab}
        />
      </Suspense>
    </main>
  );
}
