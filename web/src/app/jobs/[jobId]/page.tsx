import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JobDescription } from '@/components/JobDescription';
import { BoardHomeLink } from '@/components/BoardHomeLink';
import { MarkAppliedButton } from '@/components/MarkAppliedButton';
import { ApplicationStageSelect } from '@/components/ApplicationStageSelect';
import { formatPostedDate } from '@/lib/filters';
import { getApplicationForJob } from '@/lib/applications';
import { getSubscriberByToken } from '@/lib/queries';
import { formatAnnualSalary } from '@/lib/salary';
import { getJobById } from '@/lib/resume-queries';
import { removeJobApplication } from '@/lib/application-actions';

type Params = Promise<{ jobId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { jobId: jobIdRaw } = await params;
  const query = await searchParams;
  const from = typeof query.from === 'string' ? query.from : undefined;
  const jobId = Number(jobIdRaw);
  if (!Number.isFinite(jobId)) notFound();

  const job = await getJobById(jobId);
  if (!job || job.status !== 'active') notFound();

  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  const subscriber = token ? await getSubscriberByToken(token) : null;
  const application =
    subscriber ? await getApplicationForJob(subscriber.id, jobId) : null;

  const salary =
    formatAnnualSalary(job.salary_min_annual, job.salary_max_annual) ?? job.salary ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BoardHomeLink from={from} className="text-sm text-zinc-500 hover:text-amber-300">
        ← Back to job board
      </BoardHomeLink>

      <header className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <p className="text-xs uppercase tracking-wide text-amber-400/80">{job.source}</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-zinc-50">
          {job.title}
        </h1>
        <p className="mt-2 text-lg text-zinc-300">{job.company ?? 'Unknown company'}</p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">
          <div>
            <dt className="inline text-zinc-600">Location </dt>
            <dd className="inline text-zinc-400">{job.location ?? 'Not listed'}</dd>
          </div>
          {salary && (
            <div>
              <dt className="inline text-zinc-600">Salary </dt>
              <dd className="inline font-mono text-emerald-400">{salary}</dd>
            </div>
          )}
          <div>
            <dt className="inline text-zinc-600">Posted </dt>
            <dd className="inline text-zinc-400">
              {formatPostedDate(job.posted_at, job.created_at)}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {subscriber && !application && (
            <>
              <Link
                href={`/tailor/${job.id}`}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              >
                Tailor resume
              </Link>
              <MarkAppliedButton
                jobId={job.id}
                label="I've applied"
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
              />
            </>
          )}
          {subscriber && application && (
            <div className="flex flex-wrap items-center gap-3">
              <ApplicationStageSelect jobId={job.id} stage={application.stage} />
              <Link
                href={`/tailor/${job.id}`}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
              >
                Tailor resume
              </Link>
              <Link
                href="/?view=applied"
                className="text-sm text-amber-400 hover:underline"
              >
                View in Applied tab
              </Link>
              <form action={removeJobApplication}>
                <input type="hidden" name="jobId" value={job.id} />
                <button type="submit" className="text-sm text-zinc-500 hover:text-zinc-300">
                  Move back to board
                </button>
              </form>
            </div>
          )}
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
          >
            Apply on original site ↗
          </a>
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Description
        </h2>
        {job.description ? (
          <JobDescription description={job.description} />
        ) : (
          <p className="text-sm text-zinc-500">No description stored for this listing.</p>
        )}
        <p className="mt-3 text-xs text-zinc-600">
          Older listings may look compressed until the next scrape refreshes full descriptions.
        </p>
      </section>
    </main>
  );
}
