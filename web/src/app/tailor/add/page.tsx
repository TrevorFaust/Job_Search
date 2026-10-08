import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createManualJobAndTailor } from '@/lib/resume-actions';
import { getSubscriberByToken } from '@/lib/queries';
import { getActiveResume } from '@/lib/resume-queries';

export default async function AddManualJobPage() {
  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  if (!token) redirect('/sign-in');

  const subscriber = await getSubscriberByToken(token);
  if (!subscriber) redirect('/sign-in');

  const resume = await getActiveResume(subscriber.id);

  if (!resume) {
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink">
          Upload your resume first
        </h1>
        <p className="mt-3 text-sm text-ink-faint">
          Add your master resume before tailoring for a job.
        </p>
        <Link
          href={`/settings/${subscriber.edit_token}#resume`}
          className="mt-6 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-paper hover:bg-brand-soft"
        >
          Add resume
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/applications" className="text-sm text-ink-faint hover:text-brand">
        ← My applications
      </Link>
      <header className="mt-6 mb-8">
        <p className="text-xs uppercase tracking-wide text-brand">Add a job</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-ink">
          Tailor for an external listing
        </h1>
        <p className="mt-2 text-sm text-ink-faint">
          Found a role on LinkedIn, a company site, or somewhere we don&apos;t scrape? Paste it here.
          It&apos;s saved to your applications — not the public job board.
        </p>
      </header>

      <form action={createManualJobAndTailor} className="space-y-5">
        <label className="block text-sm">
          <span className="text-ink-soft">Job title *</span>
          <input
            name="title"
            required
            placeholder="Senior Data Analyst"
            className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2.5 text-ink"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-ink-soft">Company</span>
            <input
              name="company"
              placeholder="Acme Corp"
              className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2.5 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-soft">Location</span>
            <input
              name="location"
              placeholder="Remote · Denver, CO"
              className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2.5 text-ink"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-ink-soft">Listing URL</span>
            <input
              name="url"
              type="url"
              placeholder="https://…"
              className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2.5 text-ink"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-soft">Salary (if listed)</span>
            <input
              name="salary"
              placeholder="$120k–$140k"
              className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2.5 text-ink"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-ink-soft">Full job description *</span>
          <textarea
            name="description"
            required
            rows={16}
            placeholder="Paste the entire posting — responsibilities, qualifications, etc."
            className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-2 font-mono text-sm text-ink"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-paper hover:bg-brand-soft"
        >
          Save job & start tailoring
        </button>
      </form>
    </main>
  );
}
