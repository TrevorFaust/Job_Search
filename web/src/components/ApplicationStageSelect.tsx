'use client';

import { useTransition } from 'react';
import { updateApplicationStage } from '@/lib/application-actions';
import { useInvalidateBoardCache } from '@/lib/board-cache';
import {
  APPLICATION_STAGES,
  STAGE_LABELS,
  type ApplicationStage,
} from '@/lib/applications';

const STAGE_STYLES: Record<ApplicationStage, string> = {
  applied: 'border-zinc-600 bg-zinc-800 text-zinc-200',
  interviewing: 'border-amber-600/50 bg-amber-950/40 text-amber-200',
  rejected: 'border-red-800/50 bg-red-950/30 text-red-300',
  offered: 'border-emerald-700/50 bg-emerald-950/40 text-emerald-200',
};

type Props = {
  jobId?: number;
  manualJobId?: string;
  stage: ApplicationStage;
  compact?: boolean;
};

export function ApplicationStageSelect({ jobId, manualJobId, stage, compact }: Props) {
  const [pending, startTransition] = useTransition();
  const invalidateBoard = useInvalidateBoardCache();

  function handleChange(next: ApplicationStage) {
    const fd = new FormData();
    if (jobId != null) fd.set('jobId', String(jobId));
    if (manualJobId) fd.set('manualJobId', manualJobId);
    fd.set('stage', next);
    startTransition(async () => {
      await updateApplicationStage(fd);
      invalidateBoard();
    });
  }

  return (
    <select
      value={stage}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value as ApplicationStage)}
      className={`rounded-lg border px-2 py-1 text-xs font-medium disabled:opacity-50 ${STAGE_STYLES[stage]} ${compact ? '' : 'mt-2'}`}
      aria-label="Application stage"
    >
      {APPLICATION_STAGES.map((s) => (
        <option key={s} value={s}>
          {STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
