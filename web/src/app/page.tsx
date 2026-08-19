import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSubscriberByToken } from '@/lib/queries';
import { normalizeBoardView } from '@/lib/board-data';
import { BoardPageClient } from '@/components/BoardPageClient';
import { BoardSkeleton } from '@/components/BoardSkeleton';
import { signOut } from '@/lib/actions';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const jar = await cookies();
  const token = jar.get('jh_token')?.value;
  const subscriber = token ? await getSubscriberByToken(token) : null;
  const signedIn = !!subscriber;

  const view = normalizeBoardView(typeof params.view === 'string' ? params.view : undefined);
  if (view === 'applied' && !signedIn) redirect('/sign-in');

  return (
    <main className="mx-auto w-full max-w-[1400px] px-8 py-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-400/80">Job Hunter</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-zinc-50">
            Job board
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Listings stay up to 6 weeks · 50 per page
          </p>
        </div>
        <div className="flex gap-2">
          {signedIn ? (
            <>
              <Link
                href="/applications"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
              >
                Manual jobs
              </Link>
              <Link
                href={`/settings/${subscriber!.edit_token}#resume`}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
              >
                Resume
              </Link>
              <Link
                href={`/settings/${subscriber!.edit_token}`}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-amber-500/50 hover:text-amber-300"
              >
                Preferences
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
      <Suspense fallback={<BoardSkeleton />}>
        <BoardPageClient />
      </Suspense>
    </main>
  );
}
