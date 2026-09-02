'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { JobDescription } from '@/components/JobDescription';
import { JobApplicationMaterials } from '@/components/JobApplicationMaterials';
import {
  FollowUpContactsExpanded,
  FollowUpContactsProvider,
} from '@/components/FollowUpContactsPanel';
import {
  InterviewPrepExpanded,
  InterviewPrepProvider,
  InterviewPrepTrigger,
} from '@/components/InterviewPrepPanel';
import { InterviewAnswerCoach } from '@/components/InterviewAnswerCoach';
import type { StoredFollowUpContacts } from '@/lib/follow-up-utils';
import type { StoredInterviewAnswer, StoredInterviewPrep } from '@/lib/interview-actions';

export type JobDetailTab = 'description' | 'materials' | 'follow-up' | 'interview';

const TABS: { id: JobDetailTab; label: string }[] = [
  { id: 'description', label: 'Description' },
  { id: 'materials', label: 'Resume & cover letter' },
  { id: 'follow-up', label: 'Follow-up' },
  { id: 'interview', label: 'Interview' },
];

type Props = {
  description: string;
  tailorHref: string;
  outputText: string | null;
  coverLetterText: string | null;
  jobId?: number;
  manualJobId?: string;
  companyName?: string | null;
  followUpContacts: StoredFollowUpContacts | null;
  canFollowUp: boolean;
  canInterview: boolean;
  interviewEnabled: boolean;
  interviewPrep: StoredInterviewPrep | null;
  interviewAnswers: StoredInterviewAnswer[];
  followUpSummary?: string;
  defaultTab?: JobDetailTab;
};

function tabBadge(
  tab: JobDetailTab,
  followUpContacts: StoredFollowUpContacts | null,
  interviewPrep: StoredInterviewPrep | null
): string | null {
  if (tab === 'follow-up' && followUpContacts?.contacts.length) {
    const done = followUpContacts.contacts.filter((c) => c.followed_up_at).length;
    const total = followUpContacts.contacts.length;
    if (done === total) return `${total} · done`;
    if (done > 0) return `${done}/${total}`;
    return String(total);
  }
  if (tab === 'interview' && interviewPrep?.questions.length) {
    return String(interviewPrep.questions.length);
  }
  return null;
}

export function JobDetailTabs({
  description,
  tailorHref,
  outputText,
  coverLetterText,
  jobId,
  manualJobId,
  companyName,
  followUpContacts,
  canFollowUp,
  canInterview,
  interviewEnabled,
  interviewPrep,
  interviewAnswers,
  followUpSummary,
  defaultTab = 'description',
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as JobDetailTab | null;
  const tab =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : defaultTab;

  function setTab(next: JobDetailTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'description') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map((item) => {
          const badge = tabBadge(item.id, followUpContacts, interviewPrep);
          const disabled =
            (item.id === 'follow-up' && !canFollowUp) ||
            (item.id === 'interview' && !canInterview);
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => setTab(item.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition ${
                tab === item.id
                  ? 'text-amber-300 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-amber-400'
                  : disabled
                    ? 'cursor-not-allowed text-zinc-600'
                    : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {item.label}
              {badge ? (
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    item.id === 'interview'
                      ? 'bg-violet-400/10 text-violet-300'
                      : 'bg-sky-400/10 text-sky-300'
                  }`}
                >
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === 'description' &&
          (description ? (
            <JobDescription description={description} />
          ) : (
            <p className="text-sm text-zinc-500">
              Couldn&apos;t load a description from the original listing.
            </p>
          ))}

        {tab === 'materials' && (
          <JobApplicationMaterials
            tailorHref={tailorHref}
            outputText={outputText}
            coverLetterText={coverLetterText}
          />
        )}

        {tab === 'follow-up' && canFollowUp && (
          <FollowUpContactsProvider
            jobId={jobId}
            manualJobId={manualJobId}
            companyName={companyName}
            initialContacts={followUpContacts}
            defaultExpanded
          >
            {followUpSummary ? (
              <p className="mb-4 text-sm text-zinc-500">{followUpSummary}</p>
            ) : null}
            <FollowUpContactsExpanded variant="sidebar" />
          </FollowUpContactsProvider>
        )}

        {tab === 'follow-up' && !canFollowUp && (
          <p className="text-sm text-zinc-500">
            Mark this job as applied to find contacts and track follow-ups.
          </p>
        )}

        {tab === 'interview' && canInterview && !interviewEnabled && (
          <p className="text-sm text-zinc-500">
            Move this application to the <strong className="text-zinc-300">Interviewing</strong>{' '}
            stage to generate interview questions and practice answers.
          </p>
        )}

        {tab === 'interview' && canInterview && interviewEnabled && (
          <InterviewPrepProvider
            jobId={jobId}
            manualJobId={manualJobId}
            initialPrep={interviewPrep}
            defaultExpanded
          >
            <div className="space-y-4">
              {!interviewPrep && <InterviewPrepTrigger variant="default" />}
              <InterviewPrepExpanded variant="sidebar" />
              <InterviewAnswerCoach
                jobId={jobId}
                manualJobId={manualJobId}
                initialAnswers={interviewAnswers}
              />
            </div>
          </InterviewPrepProvider>
        )}

        {tab === 'interview' && !canInterview && (
          <p className="text-sm text-zinc-500">
            Mark this job as applied to unlock interview prep.
          </p>
        )}
      </div>
    </div>
  );
}
