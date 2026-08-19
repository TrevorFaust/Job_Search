'use client';

import { useState, useTransition } from 'react';
import type { StoredInterviewAnswer } from '@/lib/interview-actions';
import {
  answerInterviewQuestionForJob,
  deleteInterviewAnswerForJob,
} from '@/lib/interview-actions';

type Props = {
  jobId?: number;
  manualJobId?: string;
  initialAnswers?: StoredInterviewAnswer[];
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

function AnswerTweakForm({
  pending,
  disabled,
  onApply,
}: {
  pending: boolean;
  disabled: boolean;
  onApply: (notes: string) => void;
}) {
  const [notes, setNotes] = useState('');

  return (
    <form
      className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = notes.trim();
        if (!trimmed) return;
        onApply(trimmed);
      }}
    >
      <label className="block text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Tweak this answer
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              const trimmed = notes.trim();
              if (trimmed) onApply(trimmed);
            }
          }}
          rows={2}
          maxLength={1500}
          placeholder="I like this — just make it shorter, or swap in the NFL example…"
          className="mt-1 w-full min-h-16 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
          disabled={disabled}
        />
      </label>
      <button
        type="submit"
        disabled={disabled || !notes.trim()}
        className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Applying tweaks…' : 'Apply tweaks'}
      </button>
    </form>
  );
}

export function InterviewAnswerCoach({
  jobId,
  manualJobId,
  initialAnswers = [],
}: Props) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<StoredInterviewAnswer[]>(initialAnswers);
  const [openId, setOpenId] = useState<string | null>(initialAnswers[0]?.id ?? null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function draftAnswer(text: string, replaceId?: string, revisionNotes?: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setError('Paste a question first');
      return;
    }
    if (replaceId && !revisionNotes?.trim()) {
      setError('Add what you want changed before applying tweaks');
      return;
    }
    setError(null);
    setBusyId(replaceId ? `redraft:${replaceId}` : 'new');
    startTransition(async () => {
      try {
        const result = await answerInterviewQuestionForJob(
          trimmed,
          jobId,
          manualJobId,
          replaceId,
          revisionNotes
        );
        setAnswers((prev) => {
          if (replaceId) return prev.map((a) => (a.id === replaceId ? result : a));
          return [
            result,
            ...prev.filter(
              (a) => a.question.toLowerCase() !== result.question.toLowerCase()
            ),
          ];
        });
        setOpenId(result.id);
        if (!replaceId) setQuestion('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not draft an answer');
      } finally {
        setBusyId(null);
      }
    });
  }

  function removeAnswer(id: string) {
    setError(null);
    setBusyId(`delete:${id}`);
    startTransition(async () => {
      try {
        await deleteInterviewAnswerForJob(id, jobId, manualJobId);
        setAnswers((prev) => prev.filter((a) => a.id !== id));
        setOpenId((current) => (current === id ? null : current));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove that answer');
      } finally {
        setBusyId(null);
      }
    });
  }

  async function copyTrack(answer: StoredInterviewAnswer) {
    try {
      await navigator.clipboard.writeText(answer.talking_track);
      setCopiedId(answer.id);
      window.setTimeout(() => setCopiedId((current) => (current === answer.id ? null : current)), 2000);
    } catch {
      setError('Could not copy. Select the talking track and copy it manually.');
    }
  }

  return (
    <div className="border-t border-zinc-800 pt-5">
      <h3 className="text-sm font-medium text-zinc-200">Answer a question they asked</h3>
      <p className="mt-1 text-sm text-zinc-500">
        Paste an interview question. We&apos;ll draft a talking track from your resume, tailor
        Q&amp;A, and this role — without inventing experience.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          draftAnswer(question);
        }}
      >
        <label className="block text-sm">
          <span className="text-zinc-400">Their question</span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                draftAnswer(question);
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder="Tell me about a time you had to influence without authority…"
            className="mt-1 w-full min-h-20 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/60 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
            disabled={pending}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !question.trim()}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyId === 'new' ? 'Drafting…' : 'Draft my answer'}
          </button>
          {pending && busyId === 'new' && (
            <p className="text-sm text-zinc-500">Pulling from your resume and history…</p>
          )}
        </div>
      </form>

      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {answers.length > 0 && (
        <div className="mt-4 space-y-2">
          {answers.map((answer) => {
            const isOpen = openId === answer.id;
            const isRedrafting = pending && busyId === `redraft:${answer.id}`;
            return (
              <div
                key={answer.id}
                className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : answer.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-900/80"
                  aria-expanded={isOpen}
                >
                  <span className="min-w-0 flex-1 text-sm font-medium text-zinc-100">
                    {answer.question}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{isOpen ? '−' : '+'}</span>
                </button>

                {isOpen ? (
                  <div className="space-y-3 border-t border-zinc-800 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyTrack(answer)}
                        className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:border-amber-500/50"
                      >
                        {copiedId === answer.id ? 'Copied' : 'Copy talking track'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAnswer(answer.id)}
                        disabled={pending}
                        className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:text-red-400 disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <span className="text-xs text-zinc-600">
                        Drafted {formatGeneratedAt(answer.generated_at)}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Talking track
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-200">
                        {answer.talking_track}
                      </p>
                    </div>

                    {answer.framing && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          How to frame it
                        </p>
                        <p className="mt-1 text-zinc-400">{answer.framing}</p>
                      </div>
                    )}

                    {answer.evidence.length > 0 && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                          Pulled from your background
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-zinc-400">
                          {answer.evidence.map((item, i) => (
                            <li key={`${i}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {answer.watch_outs && (
                      <div className="rounded-lg bg-amber-400/5 px-3 py-2">
                        <p className="text-xs font-medium text-amber-400/90">Watch-outs</p>
                        <p className="mt-1 text-zinc-400">{answer.watch_outs}</p>
                      </div>
                    )}

                    <AnswerTweakForm
                      key={answer.generated_at}
                      pending={isRedrafting}
                      disabled={pending}
                      onApply={(notes) => draftAnswer(answer.question, answer.id, notes)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
