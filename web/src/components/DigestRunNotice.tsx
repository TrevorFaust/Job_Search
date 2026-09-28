'use client';

import { useEffect, useState } from 'react';

type DigestNotice = {
  status: 'failed' | 'success';
  summary: string;
  finishedAt: string | null;
  runUrl: string | null;
};

export function DigestRunNotice() {
  const [notice, setNotice] = useState<DigestNotice | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/digest-status', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { notice?: DigestNotice | null } | null) => {
        if (!cancelled) setNotice(body?.notice ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!notice) return null;

  const failed = notice.status === 'failed';
  const when = notice.finishedAt
    ? new Date(notice.finishedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className={
        failed
          ? 'mb-6 rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-100'
          : 'mb-6 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-50'
      }
    >
      <p className="font-medium">
        {failed ? 'Daily digest failed' : 'Daily digest finished with source problems'}
        {when ? <span className="font-normal text-zinc-400"> · {when}</span> : null}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-zinc-300">{notice.summary}</p>
      {notice.runUrl ? (
        <a href={notice.runUrl} className="mt-2 inline-block text-amber-300 hover:text-amber-200">
          GitHub run
        </a>
      ) : null}
    </div>
  );
}
