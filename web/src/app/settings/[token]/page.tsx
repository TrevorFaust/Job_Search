import Link from 'next/link';
import { BoardHomeLink } from '@/components/BoardHomeLink';
import { ProfileEditor } from '@/components/ProfileEditor';
import { ResumeEditor } from '@/components/ResumeEditor';
import { getProfiles, getSubscriberByToken } from '@/lib/queries';
import { getActiveResume } from '@/lib/resume-queries';

type Params = Promise<{ token: string }>;

export default async function SettingsPage({ params }: { params: Params }) {
  const { token } = await params;
  const subscriber = await getSubscriberByToken(token);

  if (!subscriber) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center text-zinc-400">
        Invalid settings link.{' '}
        <BoardHomeLink className="text-amber-400 hover:underline">
          Start over
        </BoardHomeLink>
      </main>
    );
  }

  const [profiles, resume] = await Promise.all([
    getProfiles(subscriber.id),
    getActiveResume(subscriber.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <BoardHomeLink className="text-sm text-zinc-500 hover:text-amber-300">
          ← Back to job board
        </BoardHomeLink>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold text-zinc-50">
          Settings
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {subscriber.email} · Resume tailoring + digest preferences
        </p>
      </header>

      <section id="resume" className="mb-12 scroll-mt-8">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold text-zinc-100">
          Master resume
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Used as the source of truth for tailoring. Experience is reframed, never invented.
        </p>
        <ResumeEditor token={token} resume={resume} />
      </section>

      <section>
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold text-zinc-100">
          Digest profiles
        </h2>
        <ProfileEditor token={token} profiles={profiles} />
      </section>
    </main>
  );
}
