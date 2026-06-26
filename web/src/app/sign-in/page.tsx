import Link from 'next/link';
import { signInWithEmail } from '@/lib/actions';

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-sm text-zinc-500 hover:text-amber-300">
        ← Back to job board
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-zinc-50">
        Sign in
      </h1>
      <p className="mt-3 text-zinc-400">
        Use the email that receives your digest. You&apos;ll see matched jobs, past emails, and
        can edit your hunt profiles.
      </p>
      <form action={signInWithEmail} className="mt-8 space-y-4">
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600"
        />
        <button
          type="submit"
          className="w-full rounded-xl bg-amber-400 py-3 font-semibold text-zinc-950 hover:bg-amber-300"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
