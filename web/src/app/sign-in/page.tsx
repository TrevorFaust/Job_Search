import Link from 'next/link';
import { SiteLogo } from '@/components/SiteLogo';
import { signInWithEmail } from '@/lib/actions';

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16">
      <div className="rounded-3xl border border-line border-t-2 border-t-brand bg-sheet p-8 shadow-[0_1px_0_rgb(26_28_24/0.04),0_24px_48px_-28px_rgb(26_28_24/0.45)]">
        <SiteLogo size={88} className="mb-6" priority />
        <Link href="/" className="text-sm font-medium text-ink-faint hover:text-brand">
          ← Back to job board
        </Link>
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-medium tracking-[-0.03em] text-ink">
          Sign in
        </h1>
        <p className="mt-3 text-ink-soft">
          Use the email that receives your digest. You&apos;ll see matched jobs, past emails, and
          can edit your hunt profiles.
        </p>
        <form action={signInWithEmail} className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-ink-soft">
            Email
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="mt-1.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink placeholder:text-ink-faint"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-brand py-3 font-semibold text-paper shadow-sm transition hover:bg-brand-soft"
          >
            Continue
          </button>
        </form>
      </div>
    </main>
  );
}
