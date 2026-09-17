import Link from 'next/link';
import { BoardHomeLink } from '@/components/BoardHomeLink';
import { ProfileEditor } from '@/components/ProfileEditor';
import { ResumeEditor } from '@/components/ResumeEditor';
import { UserProfileEditor } from '@/components/UserProfileEditor';
import { getProfiles, getSubscriberByToken } from '@/lib/queries';
import { getActiveResume } from '@/lib/resume-queries';
import { getPublicUserProfile, isOwnerEmail } from '@/lib/user-profile';

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

  const [profiles, resume, userProfile] = await Promise.all([
    getProfiles(subscriber.id),
    getActiveResume(subscriber.id),
    getPublicUserProfile(subscriber.id, subscriber.email),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <BoardHomeLink className="text-sm text-zinc-500 hover:text-amber-300">
          ← Back to job board
        </BoardHomeLink>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold text-zinc-50">
          Profile & settings
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          {subscriber.email} · identity, preferred jobs, resume, digest, and your own API key
        </p>
        <nav className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-500">
          <a href="#profile" className="hover:text-amber-300">Profile</a>
          <a href="#preferred" className="hover:text-amber-300">Preferred jobs</a>
          <a href="#billing" className="hover:text-amber-300">AI billing</a>
          <a href="#resume" className="hover:text-amber-300">Master resume</a>
          <a href="#digest" className="hover:text-amber-300">Digest emails</a>
        </nav>
      </header>

      <UserProfileEditor
        token={token}
        profile={userProfile}
        isOwner={isOwnerEmail(subscriber.email)}
      />

      <section id="resume" className="mb-12 mt-12 scroll-mt-8">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold text-zinc-100">
          Master resume
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Source library for tailoring. If your profile is still empty, uploading a resume will fill
          header, school, jobs, and projects for you to edit.
        </p>
        <ResumeEditor token={token} resume={resume} />
      </section>

      <section id="digest">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold text-zinc-100">
          Digest emails
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Keyword matching for emailed job alerts. The Preferred tab uses interest areas above.
        </p>
        <ProfileEditor token={token} profiles={profiles} />
      </section>
    </main>
  );
}
