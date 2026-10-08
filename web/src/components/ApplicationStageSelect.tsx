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
  applied: 'border-line bg-deep text-ink',
  interviewing: 'border-brand/40 bg-brand/10 text-brand',
  rejected: 'border-red-200 bg-red-50 text-red-800',
  offered: 'border-emerald-300 bg-emerald-50 text-emerald-900',
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
