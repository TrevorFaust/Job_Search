import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BoardHomeLink } from '@/components/BoardHomeLink';
import { DismissJobButton } from '@/components/DismissJobButton';
import { FitLevelBadge } from '@/components/FitLevelBadge';
import { getAppliedJobExclusions, getDismissedJobExclusions } from '@/lib/applications';
import { getSubscriberByToken } from '@/lib/queries';
import { listManualJobs } from '@/lib/resume-queries';

function statusLabel(status: string | null, hasOutput: boolean) {
  if (hasOutput) return 'Draft ready';
  if (status === 'questioning') return 'Answer questions';
  if (status === 'analyzing') return 'Analyzing…';
  if (status === 'draft') return 'Not started';
  if (status === 'failed') return 'Failed — retry';
  return 'In progress';
}

export default async function ApplicationsPage() {
  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  if (!token) redirect('/sign-in');

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) redirect('/sign-in');

  const [allJobs, appliedExclusions, dismissedExclusions] = await Promise.all([
    listManualJobs(subscriber.id),
    getAppliedJobExclusions(subscriber.id),
    getDismissedJobExclusions(subscriber.id),
  ]);
  const jobs = allJobs.filter(
    (job) =>
      !appliedExclusions.manualIds.has(job.id) && !dismissedExclusions.manualIds.has(job.id)
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <BoardHomeLink className="text-sm text-ink-faint hover:text-brand">
            ← Job board
          </BoardHomeLink>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold text-ink">
            Manual jobs
          </h1>
          <p className="mt-2 text-sm text-ink-faint">
            Jobs you pasted in yourself — not from our scrapers. Tailor a resume for each one.
            Once you apply, they move to the{' '}
            <Link href="/?view=applied" className="text-brand hover:text-brand">
              Applied tab
            </Link>
            .
          </p>
        </div>
        <Link
          href="/tailor/add"
          className="rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-paper shadow-sm transition hover:bg-brand-soft"
        >
          + Add job
        </Link>
      </header>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-line bg-paper p-10 text-center">
          <p className="text-ink-soft">
            {allJobs.length > 0 ? 'No jobs waiting to apply.' : 'No manual jobs yet.'}
          </p>
          <p className="mt-2 text-sm text-ink-faint">
            {allJobs.length > 0 ? (
              <>
                Jobs you&apos;ve marked as applied are on the{' '}
                <Link href="/?view=applied" className="text-brand hover:text-brand">
                  Applied tab
                </Link>
                .
              </>
            ) : (
              <>Paste a listing from anywhere and we&apos;ll walk you through tailoring your resume.</>
            )}
          </p>
          <Link
            href="/tailor/add"
            className="mt-6 inline-block text-sm font-medium text-brand hover:text-brand"
          >
            {allJobs.length > 0 ? 'Add another job →' : 'Add your first job →'}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-paper">
          {jobs.map((job) => (
            <li key={job.id} className="p-5 transition hover:bg-deep/50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/tailor/manual/${job.id}`}
                      className="text-lg font-semibold text-ink hover:text-brand"
                    >
                      {job.title}
                    </Link>
                    {job.fit_level && (
                      <FitLevelBadge fitLevel={job.fit_level} fitScore={job.fit_score} />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {job.company ?? 'Company not set'}
                    {job.location ? ` · ${job.location}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink-faint">
                    Added {new Date(job.created_at).toLocaleDateString()}
                    {job.salary ? ` · ${job.salary}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-deep px-3 py-1 text-xs text-ink-soft">
                    {statusLabel(job.session_status, job.has_output)}
                  </span>
                  <Link
                    href={`/tailor/manual/${job.id}`}
                    className="mt-2 block text-xs font-medium text-brand hover:text-brand"
                  >
                    {job.has_output ? 'View draft →' : 'Continue tailoring →'}
                  </Link>
                  <DismissJobButton
                    manualJobId={job.id}
                    redirectTo="/applications"
                    label="Listing unavailable — remove"
                    className="mt-2 text-xs text-ink-faint hover:text-ink"
                  />
                </div>
              </div>
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-ink-faint hover:text-ink-soft"
                >
                  Original listing ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
