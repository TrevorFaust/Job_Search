'use client';

import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import type { StoredInterviewAnswer, StoredInterviewPrep } from '@/lib/interview-actions';
import { generateInterviewPrepForJob } from '@/lib/interview-actions';
import type { InterviewQuestionCategory } from '@/lib/llm';
import { InterviewAnswerCoach } from './InterviewAnswerCoach';

type ProviderProps = {
  jobId?: number;
  manualJobId?: string;
  initialPrep?: StoredInterviewPrep | null;
  defaultExpanded?: boolean;
  children: ReactNode;
};

type TriggerVariant = 'sidebar' | 'default';

type InterviewPrepContextValue = {
  jobId?: number;
  manualJobId?: string;
  prep: StoredInterviewPrep | null;
  expanded: boolean;
  openQuestion: string | null;
  pending: boolean;
  error: string | null;
  hasPrep: boolean;
  setExpanded: (value: boolean) => void;
  setOpenQuestion: (id: string | null) => void;
  handleGenerate: (regenerate?: boolean) => void;
  openPrep: () => void;
};

const InterviewPrepContext = createContext<InterviewPrepContextValue | null>(null);

function useInterviewPrep() {
  const ctx = useContext(InterviewPrepContext);
  if (!ctx) throw new Error('InterviewPrep components must be used within InterviewPrepProvider');
  return ctx;
}

const CATEGORY_LABELS: Record<InterviewQuestionCategory, string> = {
  behavioral: 'Behavioral',
  technical: 'Technical',
  role_specific: 'Role-specific',
  situational: 'Situational',
};

const CATEGORY_STYLES: Record<InterviewQuestionCategory, string> = {
  behavioral: 'bg-violet-400/10 text-violet-300',
  technical: 'bg-sky-400/10 text-sky-300',
  role_specific: 'bg-amber-400/10 text-amber-300',
  situational: 'bg-emerald-400/10 text-emerald-300',
};

function formatGeneratedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function InterviewPrepProvider({
  jobId,
  manualJobId,
  initialPrep = null,
  defaultExpanded = false,
  children,
}: ProviderProps) {
  const [prep, setPrep] = useState<StoredInterviewPrep | null>(initialPrep);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate(regenerate = false) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateInterviewPrepForJob(jobId, manualJobId, regenerate);
        setPrep(result);
        setExpanded(true);
        setOpenQuestion(result.questions[0]?.id ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generation failed');
      }
    });
  }

  function openPrep() {
    setExpanded(true);
    if (prep?.questions[0]?.id) setOpenQuestion(prep.questions[0].id);
  }

  const value: InterviewPrepContextValue = {
    jobId,
    manualJobId,
    prep,
    expanded,
    openQuestion,
    pending,
    error,
    hasPrep: !!prep?.questions.length,
    setExpanded,
    setOpenQuestion,
    handleGenerate,
    openPrep,
  };

  return (
    <InterviewPrepContext.Provider value={value}>{children}</InterviewPrepContext.Provider>
  );
}

export function InterviewPrepTrigger({ variant = 'default' }: { variant?: TriggerVariant }) {
  const { hasPrep, prep, pending, expanded, handleGenerate, openPrep } = useInterviewPrep();

  if (expanded) return null;

  if (hasPrep) {
    return (
      <button
        type="button"
        onClick={openPrep}
        className={
          variant === 'sidebar'
            ? 'text-xs font-medium text-violet-400 hover:text-violet-300'
            : 'rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400'
        }
      >
        View interview questions ({prep!.questions.length})
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => handleGenerate(false)}
      disabled={pending}
      className={
        variant === 'sidebar'
          ? 'text-xs font-medium text-violet-400 hover:text-violet-300 disabled:opacity-50'
          : 'rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:opacity-50'
      }
    >
      {pending ? 'Generating…' : 'Generate interview questions'}
    </button>
  );
}

export function InterviewPrepExpanded({ variant = 'default' }: { variant?: TriggerVariant }) {
  const {
    prep,
    expanded,
    openQuestion,
    pending,
    error,
    setExpanded,
    setOpenQuestion,
    handleGenerate,
  } = useInterviewPrep();

  if (!expanded) return null;

  const isSidebar = variant === 'sidebar';

  return (
    <div
      className={
        isSidebar
          ? 'mt-4'
          : 'mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5'
      }
    >
      {!isSidebar && (
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Interview prep
        </h2>
      )}

      <div className={isSidebar ? '' : 'mt-4'}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleGenerate(!!prep)}
              disabled={pending}
              className="rounded-lg border border-violet-500/40 px-4 py-2 text-sm font-medium text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
            >
              {pending ? 'Generating…' : prep ? 'Regenerate questions' : 'Generate interview questions'}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Collapse
            </button>
            {prep && (
              <span className="text-xs text-zinc-500">
                Generated {formatGeneratedAt(prep.generated_at)}
              </span>
            )}
          </div>

          {pending && !prep && (
            <p className="text-sm text-zinc-500">
              Building questions from your resume and this role — usually 15–30 seconds.
            </p>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {prep && (
            <>
              <p className="text-sm leading-relaxed text-zinc-300">{prep.overview}</p>

              <div className="space-y-2">
                {prep.questions.map((q) => {
                  const isOpen = openQuestion === q.id;
                  return (
                    <div
                      key={q.id}
                      className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenQuestion(isOpen ? null : q.id)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-900/80"
                      >
                        <span
                          className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CATEGORY_STYLES[q.category] ?? 'bg-zinc-800 text-zinc-400'}`}
                        >
                          {CATEGORY_LABELS[q.category] ?? q.category}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-medium text-zinc-100">
                          {q.question}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">{isOpen ? '−' : '+'}</span>
                      </button>

                      {isOpen && (
                        <div className="space-y-3 border-t border-zinc-800 px-4 py-3 text-sm">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                              Why they might ask
                            </p>
                            <p className="mt-1 text-zinc-400">{q.why_they_ask}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                              How to frame it
                            </p>
                            <p className="mt-1 text-zinc-400">{q.framing_tips}</p>
                          </div>
                          {(q.strength_to_highlight || q.weakness_to_address) && (
                            <div className="flex flex-wrap gap-3">
                              {q.strength_to_highlight && (
                                <div className="min-w-[12rem] flex-1 rounded-lg bg-emerald-400/5 px-3 py-2">
                                  <p className="text-xs font-medium text-emerald-400/90">
                                    Strength to highlight
                                  </p>
                                  <p className="mt-1 text-zinc-400">{q.strength_to_highlight}</p>
                                </div>
                              )}
                              {q.weakness_to_address && (
                                <div className="min-w-[12rem] flex-1 rounded-lg bg-amber-400/5 px-3 py-2">
                                  <p className="text-xs font-medium text-amber-400/90">Gap to address</p>
                                  <p className="mt-1 text-zinc-400">{q.weakness_to_address}</p>
                                </div>
                              )}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                              Sample answer
                            </p>
                            <p className="mt-1 leading-relaxed text-zinc-300">{q.sample_answer}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type PanelProps = {
  jobId?: number;
  manualJobId?: string;
  initialPrep?: StoredInterviewPrep | null;
  initialAnswers?: StoredInterviewAnswer[];
};

/** Standalone panel for job detail pages */
export function InterviewPrepPanel({
  jobId,
  manualJobId,
  initialPrep = null,
  initialAnswers = [],
}: PanelProps) {
  return (
    <InterviewPrepProvider jobId={jobId} manualJobId={manualJobId} initialPrep={initialPrep}>
      <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Interview prep
        </h2>
        <div className="mt-4">
          <InterviewPrepTrigger variant="default" />
          <InterviewPrepExpanded variant="sidebar" />
        </div>
        <InterviewAnswerCoach
          jobId={jobId}
          manualJobId={manualJobId}
          initialAnswers={initialAnswers}
        />
      </div>
    </InterviewPrepProvider>
  );
}
