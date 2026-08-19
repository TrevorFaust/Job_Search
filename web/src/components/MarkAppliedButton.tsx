'use client';

import { useFormStatus } from 'react-dom';
import { markJobApplied } from '@/lib/application-actions';

type Props = {
  jobId?: number;
  manualJobId?: string;
  sessionId?: string;
  className?: string;
  label?: string;
};

function SubmitButton({ className, label }: { className: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} suppressHydrationWarning>
      {label}
    </button>
  );
}

export function MarkAppliedButton({
  jobId,
  manualJobId,
  sessionId,
  className = 'text-xs font-medium text-zinc-400 hover:text-amber-300',
  label = 'Mark applied',
}: Props) {
  return (
    <form action={markJobApplied} suppressHydrationWarning>
      {jobId != null && <input type="hidden" name="jobId" value={jobId} />}
      {manualJobId && <input type="hidden" name="manualJobId" value={manualJobId} />}
      {sessionId && <input type="hidden" name="sessionId" value={sessionId} />}
      <SubmitButton className={className} label={label} />
    </form>
  );
}
