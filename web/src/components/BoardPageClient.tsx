'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BoardPayload, BoardView } from '@/lib/board-data';
import { normalizeBoardView } from '@/lib/board-data';
import { boardTabSearch, canonicalBoardSearch } from '@/lib/board-search';
import { saveBoardHref } from '@/lib/board-state';
import { normalizeApplicationStage } from '@/lib/applications';
import { JobBoard } from './JobBoard';
import { BoardSkeleton } from './BoardSkeleton';
import { DigestRunNotice } from './DigestRunNotice';

const TAB_VIEWS: BoardView[] = ['all', 'preferred', 'priority', 'applied'];

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

function rememberBoardUrl(search: string) {
  const href = search ? `/?${search}` : '/';
  const state = window.history.state as { __NA?: boolean; _N?: boolean } | null;
  // Keep Next from treating this as a navigation. A real route change reloads the page.
  if (state && (state.__NA || state._N)) {
    window.history.replaceState(state, '', href);
  } else {
    window.history.replaceState({ __NA: true }, '', href);
  }
  saveBoardHref(href);
}

export function BoardPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.toString();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(() => canonicalBoardSearch(urlSearch));
  const shellRef = useRef<BoardPayload | null>(null);

  useEffect(() => {
    const cleaned = canonicalBoardSearch(urlSearch);
    setSearch(cleaned);
    if (cleaned !== urlSearch && new URLSearchParams(urlSearch).has('cat')) {
      rememberBoardUrl(cleaned);
    }
  }, [urlSearch]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['board', search],
    queryFn: () => fetchBoard(search),
  });

  if (data) shellRef.current = data;
  const shell = data ?? shellRef.current;
  const signedIn = shell?.signedIn ?? false;

  useEffect(() => {
    const views = signedIn ? TAB_VIEWS : TAB_VIEWS.filter((view) => view !== 'applied');
    for (const view of views) {
      const key = boardTabSearch(search, view);
      void queryClient.prefetchQuery({
        queryKey: ['board', key],
        queryFn: () => fetchBoard(key),
      });
    }
  }, [search, signedIn, queryClient]);

  useEffect(() => {
    if (isError && error instanceof Error && error.message === 'SIGN_IN_REQUIRED') {
      router.replace('/sign-in');
    }
  }, [isError, error, router]);

  function selectView(view: BoardView) {
    const next = boardTabSearch(search, view);
    if (next === search) return;
    setSearch(next);
    rememberBoardUrl(next);
  }

  if (!shell) {
    if (isError) {
      return (
        <p className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {error instanceof Error && error.message !== 'SIGN_IN_REQUIRED'
            ? error.message
            : 'Could not load the job board. Try refreshing the page.'}
        </p>
      );
    }
    return <BoardSkeleton />;
  }

  const activeView = normalizeBoardView(new URLSearchParams(search).get('view') ?? undefined);
  const ready = !!data && !isPending;
  const activeStage =
    activeView === 'applied'
      ? normalizeApplicationStage(new URLSearchParams(search).get('stage') ?? undefined)
      : undefined;

  return (
    <div>
      {signedIn ? <DigestRunNotice /> : null}
      <JobBoard
        jobs={ready ? data.jobs : []}
        total={ready ? data.total : 0}
        page={ready ? data.page : 1}
        totalPages={ready ? data.totalPages : 1}
        view={activeView}
        stage={ready ? data.stage : activeStage}
        sort={ready ? data.sort : shell.sort}
        q={ready ? data.q : shell.q}
        filters={ready ? data.filters : shell.filters}
        signedIn={signedIn}
        priorityJobIds={ready ? data.priorityJobIds : shell.priorityJobIds}
        organizations={ready ? data.organizations : shell.organizations}
        locations={ready ? data.locations : shell.locations}
        preferredCategories={ready ? data.preferredCategories : shell.preferredCategories}
        settingsToken={ready ? data.settingsToken : shell.settingsToken}
        listPending={!ready}
        onSelectView={selectView}
      />
    </div>
  );
}
