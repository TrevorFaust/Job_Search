'use client';

import { useTransition } from 'react';
import { removeJobApplication } from '@/lib/application-actions';
import { useInvalidateBoardCache } from '@/lib/board-cache';

type Props = {
  jobId?: number;
  manualJobId?: string;
  className?: string;
  label?: string;
};

export function RemoveApplicationButton({
  jobId,
  manualJobId,
  className = 'text-xs text-zinc-500 hover:text-zinc-300',
  label = 'Move back to board',
}: Props) {
  const [pending, startTransition] = useTransition();
  const invalidateBoard = useInvalidateBoardCache();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await removeJobApplication(fd);
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
      <button type="submit" disabled={pending} className={className}>
        {label}
      </button>
    </form>
  );
}
