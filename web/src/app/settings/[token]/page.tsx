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
      <main className="mx-auto max-w-lg px-6 py-20 text-center text-ink-soft">
        Invalid settings link.{' '}
        <BoardHomeLink className="text-brand hover:underline">
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
        <BoardHomeLink className="text-sm text-ink-faint hover:text-brand">
          ← Back to job board
        </BoardHomeLink>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold text-ink">
          Profile & settings
        </h1>
        <p className="mt-2 text-sm text-ink-faint">
          {subscriber.email} · identity, preferred jobs, resume, digest, and your own API key
        </p>
        <nav className="mt-4 flex flex-wrap gap-3 text-xs text-ink-faint">
          <a href="#profile" className="hover:text-brand">Profile</a>
          <a href="#preferred" className="hover:text-brand">Preferred jobs</a>
          <a href="#billing" className="hover:text-brand">AI billing</a>
          <a href="#resume" className="hover:text-brand">Master resume</a>
          <a href="#digest" className="hover:text-brand">Digest emails</a>
        </nav>
      </header>

      <UserProfileEditor
        token={token}
        profile={userProfile}
        isOwner={isOwnerEmail(subscriber.email)}
      />

      <section id="resume" className="mb-12 mt-12 scroll-mt-8">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
          Master resume
        </h2>
        <p className="mb-4 text-sm text-ink-faint">
          Source library for tailoring. If your profile is still empty, uploading a resume will fill
          header, school, jobs, and projects for you to edit.
        </p>
        <ResumeEditor token={token} resume={resume} />
      </section>

      <section id="digest">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
          Digest emails
        </h2>
        <p className="mb-4 text-sm text-ink-faint">
          Keyword matching for emailed job alerts. The Preferred tab uses interest areas above.
        </p>
        <ProfileEditor token={token} profiles={profiles} />
      </section>
    </main>
  );
}
