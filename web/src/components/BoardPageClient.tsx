'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { BoardPayload } from '@/lib/board-data';
import { JobBoard } from './JobBoard';
import { BoardSkeleton } from './BoardSkeleton';

async function fetchBoard(search: string): Promise<BoardPayload> {
  const qs = search ? `?${search}` : '';
  const res = await fetch(`/api/board${qs}`, { credentials: 'same-origin' });
  if (res.status === 401) {
    throw new Error('SIGN_IN_REQUIRED');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to load jobs');
  }
  return res.json() as Promise<BoardPayload>;
}

export function BoardPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const { data, isPending, isFetching, isError, error } = useQuery({
    queryKey: ['board', search],
    queryFn: () => fetchBoard(search),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (isError && error instanceof Error && error.message === 'SIGN_IN_REQUIRED') {
      router.replace('/sign-in');
    }
  }, [isError, error, router]);

  if (isPending && !data) {
    return <BoardSkeleton />;
  }

  if (isError || !data) {
    return (
      <p className="rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-sm text-red-300">
        {error instanceof Error && error.message !== 'SIGN_IN_REQUIRED'
          ? error.message
          : 'Could not load the job board. Try refreshing the page.'}
      </p>
    );
  }

  return (
    <div className={isFetching ? 'opacity-90 transition-opacity' : undefined}>
      <JobBoard
        jobs={data.jobs}
        total={data.total}
        page={data.page}
        totalPages={data.totalPages}
        view={data.view}
        stage={data.stage}
        sort={data.sort}
        q={data.q}
        filters={data.filters}
        signedIn={data.signedIn}
      />
    </div>
  );
}
