'use client';

import Link from 'next/link';
import { getBoardHref } from '@/lib/board-state';

type Props = {
  from?: string;
  className?: string;
  children: React.ReactNode;
};

/** Back link to the job board, preserving filters when possible. */
export function BoardHomeLink({ from, className, children }: Props) {
  const href = from && from.startsWith('/') ? from : getBoardHref();
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
