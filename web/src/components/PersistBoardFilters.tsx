'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { clearBoardHref, getBoardHref, saveBoardHref } from '@/lib/board-state';

/** Keeps the last board URL in sessionStorage and restores it when returning to `/`. */
export function PersistBoardFilters() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== '/') return;

    const qs = searchParams.toString();
    if (qs) {
      saveBoardHref(`/?${qs}`);
      return;
    }

    const saved = getBoardHref();
    if (saved !== '/') {
      router.replace(saved);
    }
  }, [pathname, searchParams, router]);

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
