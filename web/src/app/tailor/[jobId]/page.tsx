import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { BoardHomeLink } from '@/components/BoardHomeLink';
import { TailorWizard } from '@/components/TailorWizard';
import { getApplicationForJob } from '@/lib/applications';
import { getSubscriberByToken } from '@/lib/queries';
import { getJobById } from '@/lib/resume-queries';
import { prepareTailorSession } from '@/lib/tailor-page';

type Params = Promise<{ jobId: string }>;

function scrapedJobToView(job: NonNullable<Awaited<ReturnType<typeof getJobById>>>) {
  return {
    id: String(job.id),
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    salary: job.salary,
    description: job.description ?? '',
    source: job.source,
    isManual: false as const,
    created_at: job.created_at,
  };
}

export default async function TailorPage({ params }: { params: Params }) {
  const { jobId: jobIdRaw } = await params;
  const jobId = Number(jobIdRaw);
  if (!Number.isFinite(jobId)) notFound();

  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  if (!token) redirect('/sign-in');

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) redirect('/sign-in');

  const prepared = await prepareTailorSession({
    subscriberId: subscriber.id,
    editToken: subscriber.edit_token,
    jobId,
  });

  if (prepared.kind === 'no_resume') return prepared.element;
  if (prepared.kind === 'not_found') notFound();
  if (prepared.kind === 'no_description') return prepared.element;

  const scraped = await getJobById(jobId);
  if (!scraped) notFound();

  const application = await getApplicationForJob(subscriber.id, jobId);
  const backHref = application ? `/jobs/${jobId}` : '/';

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BoardHomeLink from={backHref} className="text-sm text-zinc-500 hover:text-amber-300">
        {application ? '← Back to job' : '← Back to job board'}
      </BoardHomeLink>
      <div className="mt-6">
        <TailorWizard
          job={scrapedJobToView(scraped)}
          session={prepared.session!}
          initialReusedCount={prepared.initialReusedCount}
          backHref={backHref}
        />
      </div>
    </main>
  );
}
