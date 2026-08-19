'use client';

import { useTransition } from 'react';
import { dismissJobFromBoard } from '@/lib/application-actions';
import { useInvalidateBoardCache } from '@/lib/board-cache';

type Props = {
  jobId?: number;
  manualJobId?: string;
  className?: string;
  label?: string;
  redirectTo?: string;
};

export function DismissJobButton({
  jobId,
  manualJobId,
  className = 'text-xs text-zinc-500 hover:text-zinc-300',
  label = 'Remove from board',
  redirectTo,
}: Props) {
  const [pending, startTransition] = useTransition();
  const invalidateBoard = useInvalidateBoardCache();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await dismissJobFromBoard(fd);
      invalidateBoard();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {manualJobId ? (
        <input type="hidden" name="manualJobId" value={manualJobId} />
      ) : jobId != null ? (
        <input type="hidden" name="jobId" value={jobId} />
      ) : null}
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <button type="submit" disabled={pending} className={className}>
        {pending ? 'Removing…' : label}
      </button>
    </form>
  );
}
