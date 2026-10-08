import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getSubscriberByToken } from '@/lib/queries';
import { normalizeBoardView } from '@/lib/board-data';
import { BoardPageClient } from '@/components/BoardPageClient';
import { BoardSkeleton } from '@/components/BoardSkeleton';
import { SiteLogo } from '@/components/SiteLogo';
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

  const navLink =
    'rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition hover:bg-sheet hover:text-ink';

  return (
    <main>
      <header className="sticky top-0 z-30 border-b border-line/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3.5 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <SiteLogo size={64} priority />
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-brand">Hustle Hunter</p>
              <h1 className="font-[family-name:var(--font-display)] text-xl font-medium italic leading-tight tracking-[-0.02em] text-ink sm:text-[1.65rem]">
                Hunt smarter, hustle harder
              </h1>
            </div>
          </div>
          <nav className="ml-auto flex shrink-0 flex-wrap items-center gap-1" aria-label="Account">
            {signedIn ? (
              <>
                <Link href="/applications" className={navLink}>
                  Manual jobs
                </Link>
                <Link href={`/settings/${subscriber!.edit_token}`} className={navLink}>
                  Profile
                </Link>
                <Link href={`/settings/${subscriber!.edit_token}#resume`} className={navLink}>
                  Resume
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-faint transition hover:bg-sheet hover:text-ink"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/sign-in"
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:bg-brand-soft"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8">
        <Suspense fallback={<BoardSkeleton />}>
          <BoardPageClient />
        </Suspense>
      </div>
    </main>
  );
}
