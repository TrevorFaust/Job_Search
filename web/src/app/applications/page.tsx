import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BoardHomeLink } from '@/components/BoardHomeLink';
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

  const jobs = await listManualJobs(subscriber.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <BoardHomeLink className="text-sm text-zinc-500 hover:text-amber-300">
            ← Job board
          </BoardHomeLink>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold text-zinc-50">
            Manual jobs
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Jobs you pasted in yourself — not from our scrapers. Tailor a resume for each one.
          </p>
        </div>
        <Link
          href="/tailor/add"
          className="rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + Add job
        </Link>
      </header>

      {jobs.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
          <p className="text-zinc-400">No manual jobs yet.</p>
          <p className="mt-2 text-sm text-zinc-500">
            Paste a listing from anywhere and we&apos;ll walk you through tailoring your resume.
          </p>
          <Link
            href="/tailor/add"
            className="mt-6 inline-block text-sm font-medium text-amber-400 hover:text-amber-300"
          >
            Add your first job →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
          {jobs.map((job) => (
            <li key={job.id} className="p-5 transition hover:bg-zinc-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/tailor/manual/${job.id}`}
                    className="text-lg font-semibold text-zinc-50 hover:text-amber-300"
                  >
                    {job.title}
                  </Link>
                  <p className="mt-1 text-sm text-zinc-400">
                    {job.company ?? 'Company not set'}
                    {job.location ? ` · ${job.location}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Added {new Date(job.created_at).toLocaleDateString()}
                    {job.salary ? ` · ${job.salary}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
                    {statusLabel(job.session_status, job.has_output)}
                  </span>
                  <Link
                    href={`/tailor/manual/${job.id}`}
                    className="mt-2 block text-xs font-medium text-amber-400 hover:text-amber-300"
                  >
                    {job.has_output ? 'View draft →' : 'Continue tailoring →'}
                  </Link>
                </div>
              </div>
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-zinc-500 hover:text-zinc-400"
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
