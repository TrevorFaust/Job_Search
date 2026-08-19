'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { clearBoardHref, saveBoardHref } from '@/lib/board-state';

/** Keeps the last board URL in sessionStorage for BoardHomeLink back navigation. */
export function PersistBoardFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname !== '/') return;

    const qs = searchParams.toString();
    if (qs) {
      saveBoardHref(`/?${qs}`);
      return;
    }

    // Bare `/` is the explicit "all jobs" view — don't restore a saved tab.
    clearBoardHref();
  }, [pathname, searchParams]);

  return null;
}

export function ResetBoardFiltersLink({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <a
      href="/"
      className={className}
      onClick={() => clearBoardHref()}
    >
      {children}
    </a>
  );
}
