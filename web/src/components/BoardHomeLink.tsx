'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBoardHref } from '@/lib/board-state';

type Props = {
  from?: string;
  className?: string;
  children: React.ReactNode;
};

/** Back link to the job board, preserving filters when possible. */
export function BoardHomeLink({ from, className, children }: Props) {
  const staticHref = from && from.startsWith('/') ? from : '/';
  const [href, setHref] = useState(staticHref);

  useEffect(() => {
    if (from && from.startsWith('/')) return;
    setHref(getBoardHref());
  }, [from]);

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
