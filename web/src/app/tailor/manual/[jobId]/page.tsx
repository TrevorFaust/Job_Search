import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { TailorWizard } from '@/components/TailorWizard';
import { getApplicationForManualJob } from '@/lib/applications';
import { getSubscriberByToken } from '@/lib/queries';
import { manualJobToView } from '@/lib/manual-jobs';
import { prepareTailorSession } from '@/lib/tailor-page';

type Params = Promise<{ jobId: string }>;

export default async function ManualTailorPage({ params }: { params: Params }) {
  const { jobId } = await params;
  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  if (!token) redirect('/sign-in');

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) redirect('/sign-in');

  const prepared = await prepareTailorSession({
    subscriberId: subscriber.id,
    editToken: subscriber.edit_token,
    manualJobId: jobId,
  });

  if (prepared.kind === 'no_resume') return prepared.element;
  if (prepared.kind === 'not_found') notFound();
  if (prepared.kind === 'no_description') return prepared.element;

  const job = manualJobToView(prepared.manualJob!);
  const application = await getApplicationForManualJob(subscriber.id, jobId);
  const backHref = application ? `/jobs/manual/${jobId}` : '/applications';

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={backHref} className="text-sm text-zinc-500 hover:text-amber-300">
        {application ? '← Back to job' : '← Manual jobs'}
      </Link>
      <div className="mt-6">
        <TailorWizard
          job={job}
          session={prepared.session!}
          initialReusedCount={prepared.initialReusedCount}
          backHref={backHref}
          applicationStage={application?.stage}
        />
      </div>
    </main>
  );
}
