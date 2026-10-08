'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { TailorJobView } from '@/lib/manual-jobs';
import type { ApplicationStage } from '@/lib/applications';
import type { TailoringSession } from '@/lib/resume-queries';
import type { AtsAudit } from '@/lib/ats-audit';
import {
  blockerKey,
  findingKey,
  hasAtsFollowUps,
  isAtsAudit,
  rebuttalStateKey,
} from '@/lib/ats-audit';
import type { TailorAnswer, TailorQuestion } from '@/lib/llm';
import type { CandidateFact } from '@/lib/candidate-facts';
import { matchCandidateFact, withFactDrafts } from '@/lib/candidate-facts';
import {
  applyAtsImprovements,
  dismissAtsFollowUps,
  fitResumeDraft,
  generateCoverLetterDraft,
  generateTailoredDraft,
  refreshAtsAudit,
  reviseTailoredDraft,
  runGapAnalysis,
  saveCoverLetter,
  saveResumeDraft,
  saveTailorAnswers,
} from '@/lib/resume-actions';
import { composeCoverLetter, normalizeCoverLetterBody, type CoverIdentity } from '@/lib/cover-letter';
import { draftToPlainText, parseResumeOutput, resolveResumeFromOutput, serializeResumeOutput } from '@/lib/resume-draft';
import type { ResumeDraft } from '@/lib/resume-template';
import { MarkAppliedButton } from './MarkAppliedButton';
import { ApplicationStageSelect } from './ApplicationStageSelect';
import { DismissJobButton } from './DismissJobButton';
import { PlainTextResumePreview } from './PlainTextResumePreview';
import { ResumePreview, useDebouncedDraftSave } from './ResumePreview';
import { CoverLetterPreview, useDebouncedCoverSave } from './CoverLetterPreview';

type Props = {
  job: TailorJobView;
  session: TailoringSession;
  initialReusedCount?: number;
  backHref?: string;
  applicationStage?: ApplicationStage;
  identity?: {
    displayName: string;
    facts: CandidateFact[];
    cover: CoverIdentity;
  };
};

const QUICK_CHIPS = ['Yes', 'No', 'Not really', 'Skip'];

function displayQuestion(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 180) return cleaned;
  const sentences = (cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned])
    .map((s) => s.trim())
    .filter(Boolean);
  const withMark = sentences.filter((s) => s.includes('?'));
  const pick = withMark[withMark.length - 1] ?? sentences[sentences.length - 1] ?? cleaned;
  return pick.length <= 220 ? pick : `${pick.slice(0, 200).replace(/\s+\S*$/, '')}…`;
}

function QuestionField({
  index,
  total,
  question,
  value,
  onChange,
  facts,
}: {
  index: number;
  total: number;
  question: TailorQuestion;
  value: string;
  onChange: (value: string) => void;
  facts?: CandidateFact[];
}) {
  const factAnswer = matchCandidateFact(question, facts)?.answer;
  const usingNotes = Boolean(factAnswer && value === factAnswer);
  const chips: string[] = [];
  if (factAnswer) chips.push('Project notes');
  for (const chip of [...QUICK_CHIPS, ...(question.suggested_answers ?? [])]) {
    if (!chips.some((existing) => existing.toLowerCase() === chip.toLowerCase())) {
      chips.push(chip);
    }
  }

  return (
    <div className="space-y-1.5 border-t border-line pt-3 first:border-0 first:pt-0">
      <p className="text-sm font-medium leading-snug text-ink">
        {total > 1 ? <span className="mr-1.5 text-ink-faint">{index + 1}.</span> : null}
        {displayQuestion(question.question)}
      </p>
      {usingNotes ? (
        <p className="text-xs text-emerald-800">
          Drafted from your project notes. Edit anything that&apos;s off.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {chips.slice(0, 6).map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              if (chip === 'Project notes' && factAnswer) onChange(factAnswer);
              else onChange(chip === 'Skip' ? 'n/a' : chip);
            }}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              chip === 'Project notes'
                ? usingNotes
                  ? 'border-brand/50 text-brand'
                  : 'border-line text-ink-soft hover:border-brand hover:text-brand'
                : (chip === 'Skip' ? value === 'n/a' : value === chip)
                  ? 'border-brand/50 text-brand'
                  : 'border-line text-ink-soft hover:border-brand hover:text-brand'
            }`}
          >
            {chip}
          </button>
        ))}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={usingNotes || value.length > 160 ? 5 : 2}
        placeholder="Short answer is enough"
        className="w-full rounded-lg border border-line bg-sheet px-3 py-1.5 text-sm text-ink"
      />
    </div>
  );
}

function DraftRevisionPanel({
  docLabel,
  pending,
  disabled,
  onRevise,
}: {
  docLabel: 'resume' | 'cover letter';
  pending: boolean;
  disabled: boolean;
  onRevise: (notes: string) => void;
}) {
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-2 rounded-lg border border-line bg-sheet p-4">
      <label className="block text-sm font-medium text-ink" htmlFor={`revise-${docLabel}`}>
        Anything you want changed?
      </label>
      <p className="text-xs text-ink-faint">
        Optional for small edits in the preview above. Use this when you want a broader rerun — tone,
        emphasis, swapping examples, or restructuring sections.
      </p>
      <textarea
        id={`revise-${docLabel}`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            const trimmed = notes.trim();
            if (trimmed) {
              onRevise(trimmed);
              setNotes('');
            }
          }
        }}
        rows={3}
        maxLength={1500}
        placeholder={
          docLabel === 'resume'
            ? 'e.g. Lead with the NFL project, cut Process Engineer, make the profile less sales-heavy…'
            : 'e.g. Shorter opening, mention DraftDNA, less formal tone…'
        }
        className="w-full rounded-lg border border-line bg-sheet px-3 py-1.5 text-sm text-ink"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={() => {
          const trimmed = notes.trim();
          if (!trimmed) return;
          onRevise(trimmed);
          setNotes('');
        }}
        disabled={disabled || pending || !notes.trim()}
        className="rounded-lg border border-brand/40 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Regenerating…' : `Regenerate ${docLabel} with changes`}
      </button>
    </div>
  );
}

function KeywordPills({ label, terms, tone }: { label: string; terms: string[]; tone: string }) {
  if (!terms.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {terms.slice(0, 24).map((term) => (
          <span key={term} className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
            {term}
          </span>
        ))}
        {terms.length > 24 && (
          <span className="px-2 py-0.5 text-xs text-ink-faint">+{terms.length - 24} more</span>
        )}
      </div>
    </div>
  );
}

export function TailorWizard({
  job,
  session: initialSession,
  initialReusedCount = 0,
  backHref = '/',
  applicationStage,
  identity,
}: Props) {
  const [session, setSession] = useState(initialSession);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reusedCount, setReusedCount] = useState(initialReusedCount);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialSession.answers ?? []) map[a.question_id] = a.answer;
    return withFactDrafts(initialSession.questions ?? [], map, identity?.facts);
  });
  const [output, setOutput] = useState(initialSession.output_text ?? '');
  const coverName = identity?.displayName;
  const [coverLetterOutput, setCoverLetterOutput] = useState(
    initialSession.cover_letter_text ? normalizeCoverLetterBody(initialSession.cover_letter_text, coverName) : ''
  );
  const [draftView, setDraftView] = useState<'resume' | 'cover-letter'>('resume');
  const [resumeDraft, setResumeDraft] = useState<ResumeDraft | null>(
    () => resolveResumeFromOutput(initialSession.output_text)?.draft ?? null
  );
  const { saving: draftSaving, saved: draftSaved } = useDebouncedDraftSave(
    session.id,
    resumeDraft,
    saveResumeDraft
  );
  const { saving: coverSaving, saved: coverSaved } = useDebouncedCoverSave(
    session.id,
    coverLetterOutput,
    saveCoverLetter
  );
  const [extraContext, setExtraContext] = useState(initialSession.extra_context ?? '');
  const [pagePreference, setPagePreference] = useState<'one' | 'two'>(
    initialSession.page_preference ?? 'one'
  );
  const [fitMessage, setFitMessage] = useState<string | null>(null);
  const [atsAnswers, setAtsAnswers] = useState<Record<string, string>>(() => {
    const audit = isAtsAudit(initialSession.ats_audit) ? initialSession.ats_audit : null;
    const map: Record<string, string> = {};
    for (const a of audit?.answers ?? []) map[a.question_id] = a.answer;
    return withFactDrafts(audit?.questions ?? [], map, identity?.facts);
  });
  const [atsRebuttals, setAtsRebuttals] = useState<Record<string, string>>(() => {
    const audit = isAtsAudit(initialSession.ats_audit) ? initialSession.ats_audit : null;
    const map: Record<string, string> = {};
    for (const r of audit?.rebuttals ?? []) {
      const kind = r.kind === 'blocker' ? 'blocker' : 'finding';
      const id = r.target_id || (r as { finding_id?: string }).finding_id;
      if (id) map[rebuttalStateKey(kind, id)] = r.rebuttal;
    }
    return map;
  });

  const kw = session.keyword_analysis ?? { matched: [], partial: [], missing: [] };
  const gap = session.gap_analysis && 'summary' in session.gap_analysis ? session.gap_analysis : null;
  const questions = session.questions ?? [];
  const atsAudit: AtsAudit | null = isAtsAudit(session.ats_audit) ? session.ats_audit : null;
  const step =
    session.status === 'done' && output
      ? 'done'
      : gap
        ? 'questions'
        : 'keywords';

  // Stuck sessions that already applied once but still show follow-up forms — close them.
  const autoClosedAts = useRef(false);
  useEffect(() => {
    if (autoClosedAts.current) return;
    if (!atsAudit || !hasAtsFollowUps(atsAudit)) return;
    const alreadyApplied =
      (atsAudit.rebuttals?.length ?? 0) > 0 ||
      atsAudit.score_before_apply != null ||
      /rebuttal/i.test(atsAudit.evidence_notes ?? '');
    if (!alreadyApplied) return;
    autoClosedAts.current = true;
    void dismissAtsFollowUps(session.id)
      .then((result) => {
        setAtsAnswers({});
        setAtsRebuttals({});
        setSession((s) => ({ ...s, ats_audit: result.ats_audit }));
      })
      .catch(() => {
        autoClosedAts.current = false;
      });
  }, [atsAudit, session.id]);

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runGapAnalysis(session.id);
        const prefilled: Record<string, string> = {};
        for (const a of result.answers ?? []) prefilled[a.question_id] = a.answer;
        setAnswers((prev) => withFactDrafts(result.questions, { ...prev, ...prefilled }, identity?.facts));
        setReusedCount(result.reusedCount ?? 0);
        setSession((s) => ({
          ...s,
          status: 'questioning',
          gap_analysis: result.gap_analysis,
          questions: result.questions,
          answers: result.answers ?? [],
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Analysis failed');
      }
    });
  }

  function handleGenerate() {
    setError(null);
    const payload: TailorAnswer[] = questions.map((q) => ({
      question_id: q.id,
      answer: answers[q.id]?.trim() ?? '',
      question: q.question,
      related_requirement: q.related_requirement,
    }));

    if (questions.length > 0 && payload.some((a) => !a.answer)) {
      setError('Answer every new question — even a short “no” helps the draft stay honest.');
      return;
    }

    startTransition(async () => {
      try {
        await saveTailorAnswers(session.id, payload, extraContext);
        const result = await generateTailoredDraft(session.id, extraContext, pagePreference);
        setOutput(result.output_text);
        setResumeDraft(resolveResumeFromOutput(result.output_text)?.draft ?? null);
        setCoverLetterOutput(
          result.cover_letter_text ? normalizeCoverLetterBody(result.cover_letter_text, coverName) : ''
        );
        setFitMessage(null);
        const audit = isAtsAudit(result.ats_audit) ? result.ats_audit : null;
        const map: Record<string, string> = {};
        for (const a of audit?.answers ?? []) map[a.question_id] = a.answer;
        setAtsAnswers(withFactDrafts(audit?.questions ?? [], map, identity?.facts));
        setAtsRebuttals({});
        setSession((s) => ({
          ...s,
          status: 'done',
          output_text: result.output_text,
          cover_letter_text: result.cover_letter_text,
          ats_audit: result.ats_audit ?? {},
          extra_context: extraContext.trim(),
          page_preference: pagePreference,
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generation failed');
      }
    });
  }

  function handleGenerateCoverLetter() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateCoverLetterDraft(session.id, extraContext);
        setCoverLetterOutput(normalizeCoverLetterBody(result.cover_letter_text, coverName));
        setSession((s) => ({ ...s, cover_letter_text: result.cover_letter_text }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Cover letter generation failed');
      }
    });
  }

  function handleFitToPage() {
    if (!resumeDraft) return;
    setError(null);
    setFitMessage(null);
    startTransition(async () => {
      try {
        const result = await fitResumeDraft(session.id, resumeDraft);
        setResumeDraft(result.draft);
        setFitMessage(result.message);
        setOutput(
          serializeResumeOutput({
            version: 1,
            draft: result.draft,
            keywordAlignment: parseResumeOutput(output)?.keywordAlignment ?? [],
          })
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fit failed');
      }
    });
  }

  function handleReviseDraft(notes: string) {
    setError(null);
    const target = draftView === 'cover-letter' ? 'cover-letter' : 'resume';

    startTransition(async () => {
      try {
        if (target === 'resume' && resumeDraft) {
          await saveResumeDraft(session.id, resumeDraft);
        }
        if (target === 'cover-letter' && coverLetterOutput) {
          await saveCoverLetter(session.id, coverLetterOutput);
        }

        const result = await reviseTailoredDraft(
          session.id,
          notes,
          target,
          resumeDraft,
          coverLetterOutput
        );

        if (target === 'resume') {
          setOutput(result.output_text);
          setResumeDraft(resolveResumeFromOutput(result.output_text)?.draft ?? null);
          setFitMessage(null);
          setAtsAnswers({});
          setAtsRebuttals({});
        }
        if (target === 'cover-letter') {
          setCoverLetterOutput(normalizeCoverLetterBody(result.cover_letter_text ?? '', coverName));
        }
        setSession((s) => ({
          ...s,
          status: 'done',
          output_text: result.output_text,
          cover_letter_text: result.cover_letter_text ?? s.cover_letter_text,
          ...(target === 'resume' && result.ats_audit
            ? { ats_audit: result.ats_audit }
            : {}),
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Revision failed');
      }
    });
  }

  function handleApplyAts() {
    setError(null);
    const qs = atsAudit?.questions ?? [];
    const payload: TailorAnswer[] = qs.map((q) => ({
      question_id: q.id,
      answer: atsAnswers[q.id]?.trim() ?? '',
      question: q.question,
      related_requirement: q.related_requirement,
    }));
    const findingRebuttals = (atsAudit?.findings ?? [])
      .map((f) => ({
        target_id: findingKey(f),
        kind: 'finding' as const,
        rebuttal: (atsRebuttals[rebuttalStateKey('finding', findingKey(f))] ?? '').trim(),
      }))
      .filter((r) => r.rebuttal.length > 0);
    const blockerRebuttals = (atsAudit?.soft_blockers ?? [])
      .map((b) => ({
        target_id: blockerKey(b),
        kind: 'blocker' as const,
        rebuttal: (atsRebuttals[rebuttalStateKey('blocker', blockerKey(b))] ?? '').trim(),
      }))
      .filter((r) => r.rebuttal.length > 0);
    const rebuttals = [...findingRebuttals, ...blockerRebuttals];

    if (payload.every((a) => !a.answer) && rebuttals.length === 0) {
      setError('Answer a question or rebut a finding/blocker before applying.');
      return;
    }

    startTransition(async () => {
      try {
        if (resumeDraft) await saveResumeDraft(session.id, resumeDraft);
        const result = await applyAtsImprovements(session.id, payload, rebuttals, resumeDraft);
        setOutput(result.output_text);
        setResumeDraft(resolveResumeFromOutput(result.output_text)?.draft ?? null);
        setFitMessage(null);
        setAtsAnswers({});
        setAtsRebuttals({});
        setSession((s) => ({
          ...s,
          status: 'done',
          output_text: result.output_text,
          ats_audit: result.ats_audit,
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'ATS improvement failed');
      }
    });
  }

  const keywordAlignment = parseResumeOutput(output)?.keywordAlignment ?? [];
  const atsNeedsInput = atsAudit ? hasAtsFollowUps(atsAudit) : false;

  return (
    <div className="space-y-8">
      <header className="rounded-xl border border-line bg-paper p-5">
        <p className="text-xs uppercase tracking-wide text-brand">
          {job.isManual ? 'Manual application' : job.source}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-ink">
          {job.title}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {job.company ?? 'Unknown company'} · {job.location ?? 'Location n/a'}
        </p>
        <p className="mt-3 text-xs text-ink-faint">
          Draft only — review before submitting. We produce a tailored resume and cover letter using the same answers and context.
        </p>
        {!applicationStage && (
          <div className="mt-4 border-t border-line pt-4">
            {job.isManual ? (
              <DismissJobButton
                manualJobId={job.id}
                redirectTo="/applications"
                label="Listing unavailable — remove job"
                className="text-sm text-ink-faint hover:text-ink"
              />
            ) : (
              <DismissJobButton
                jobId={Number(job.id)}
                redirectTo={backHref}
                label="Listing unavailable — remove from board"
                className="text-sm text-ink-faint hover:text-ink"
              />
            )}
          </div>
        )}
      </header>

      {step === 'keywords' && (
        <section className="space-y-5 rounded-xl border border-line bg-paper p-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">Keyword overlap</h2>
            <p className="mt-1 text-sm text-ink-faint">
              Instant scan of listing terms vs your resume — before AI analysis.
            </p>
          </div>
          <KeywordPills label="Already on your resume" terms={kw.matched} tone="bg-emerald-100 text-emerald-800" />
          <KeywordPills label="Related / partial" terms={kw.partial} tone="bg-brand/15 text-brand" />
          <KeywordPills label="Not found yet" terms={kw.missing} tone="bg-deep text-ink-soft" />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={pending}
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-paper hover:bg-brand-soft disabled:opacity-50"
          >
            {pending ? 'Analyzing…' : 'Run AI gap analysis & questions'}
          </button>
        </section>
      )}

      {step === 'questions' && gap && (
        <>
          <section className="space-y-4 rounded-xl border border-line bg-paper p-5">
            <h2 className="text-lg font-semibold text-ink">Gap analysis</h2>
            {gap.fit_level && (
              <p className="text-xs uppercase tracking-wide text-ink-faint">
                Fit:{' '}
                <span className="text-brand">
                  {gap.fit_level.replace('_', ' ')}
                  {gap.fit_score != null ? ` · ${gap.fit_score.toFixed(1)}/10` : ''}
                </span>
              </p>
            )}
            <p className="text-sm text-ink-soft">{gap.summary}</p>
            {gap.strong_matches?.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase text-emerald-800">Strong matches</p>
                <ul className="mt-2 space-y-2 text-sm text-ink-soft">
                  {gap.strong_matches.map((m) => (
                    <li key={m.skill}>
                      <span className="text-ink">{m.skill}</span> — {m.resume_evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {gap.partial_matches?.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase text-brand">Reframe opportunities</p>
                <ul className="mt-2 space-y-2 text-sm text-ink-soft">
                  {gap.partial_matches.map((m) => (
                    <li key={m.skill}>
                      <span className="text-ink">{m.skill}</span> — {m.reframe_suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-line bg-paper p-5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Clarifying questions</h2>
              <p className="mt-1 text-sm text-ink-faint">
                Short answers are saved and reused. We only ask what&apos;s new for this role.
              </p>
              {reusedCount > 0 && (
                <p className="mt-2 text-xs text-emerald-800">
                  {reusedCount} answer{reusedCount === 1 ? '' : 's'} reused from previous tailoring sessions.
                </p>
              )}
            </div>
            {questions.length === 0 ? (
              <p className="text-sm text-ink-soft">
                No new questions for this role — your saved answers cover it. Add optional context below and generate.
              </p>
            ) : (
              questions.map((q, i) => (
                <QuestionField
                  key={q.id}
                  index={i}
                  total={questions.length}
                  question={q}
                  value={answers[q.id] ?? ''}
                  onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
                  facts={identity?.facts}
                />
              ))
            )}
            <div className="space-y-1.5 border-t border-line pt-4">
              <label className="block text-sm font-medium text-ink" htmlFor="extra-context">
                Anything else we should know?
              </label>
              <p className="text-xs text-ink-faint">
                Optional. Why this role, a pivot story, or anything that doesn&apos;t fit above.
              </p>
              <textarea
                id="extra-context"
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
                rows={3}
                placeholder="e.g. I'm pursuing my PPL, my leadership in X translates to…"
                className="w-full rounded-lg border border-line bg-sheet px-3 py-1.5 text-sm text-ink"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-ink" htmlFor="page-length">
                Resume length
              </label>
              <select
                id="page-length"
                value={pagePreference}
                onChange={(e) => setPagePreference(e.target.value as 'one' | 'two')}
                className="w-full rounded-lg border border-line bg-sheet px-3 py-2 text-sm text-ink"
              >
                <option value="one">One page (default)</option>
                <option value="two">Up to two pages</option>
              </select>
              <p className="text-xs text-ink-faint">
                The draft targets a full page with only job-relevant experience. If space allows, relevant roles get more detail — unrelated jobs stay out. Accomplishment lines have no bullet characters for pasting into your template.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={pending}
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-paper hover:bg-brand-soft disabled:opacity-50"
            >
              {pending ? 'Generating drafts + ATS…' : 'Generate resume & cover letter'}
            </button>
          </section>
        </>
      )}

      {step === 'done' && output && atsAudit && (
        <section className="space-y-4 rounded-xl border border-line bg-paper p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">ATS screen audit</h2>
              <p className="mt-1 text-sm text-ink-faint">
              Evidence-weighted review. Soft blockers set the honest ceiling — after patches, your
              score should match that ceiling. Path notes are only about breaking above it.
            </p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-ink-faint">
                {atsAudit.score_before_apply != null || atsAudit.follow_ups_closed
                  ? 'Score after updates'
                  : 'ATS score'}
              </p>
              <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-brand">
                {atsAudit.score}%
              </p>
              <p className="text-xs text-ink-faint">
                ceiling {atsAudit.ceiling}%
                {atsAudit.score_before_apply != null
                  ? ` · was ${atsAudit.score_before_apply}% before your updates`
                  : atsAudit.score_before_patches != null
                    ? ` · was ${atsAudit.score_before_patches}% before auto-patches`
                    : ''}
              </p>
            </div>
          </div>

          {!atsNeedsInput && (
            <div className="space-y-2">
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Final ATS screen for this draft. Score and notes below are the summary — review the
                resume, then download when ready.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    try {
                      if (resumeDraft) await saveResumeDraft(session.id, resumeDraft);
                      const result = await refreshAtsAudit(session.id, resumeDraft);
                      setOutput(result.output_text);
                      setResumeDraft(resolveResumeFromOutput(result.output_text)?.draft ?? null);
                      setAtsAnswers({});
                      setAtsRebuttals({});
                      setSession((s) => ({
                        ...s,
                        output_text: result.output_text,
                        ats_audit: result.ats_audit,
                      }));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'ATS refresh failed');
                    }
                  });
                }}
                disabled={pending}
                className="text-xs text-ink-faint underline-offset-2 hover:text-brand hover:underline disabled:opacity-50"
              >
                {pending ? 'Refreshing ATS…' : 'Refresh ATS score on this draft'}
              </button>
            </div>
          )}

          {atsAudit.evidence_notes ? (
            <p className="text-sm text-ink-soft">{atsAudit.evidence_notes}</p>
          ) : null}

          <div className="rounded-lg border border-line bg-sheet p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Above this ceiling
            </p>
            <p className="mt-1 text-sm text-ink-soft">{atsAudit.path_to_target}</p>
          </div>

          {atsAudit.ceiling_reasons.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Why the ceiling is {atsAudit.ceiling}%
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                {atsAudit.ceiling_reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {atsNeedsInput && atsAudit.soft_blockers.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-brand">
                Soft blockers
              </p>
              <p className="mt-1 text-xs text-ink-faint">
                These cap the ceiling when true. If one is inaccurate, rebut it — we&apos;ll
                recalculate and patch when justified.
              </p>
              <ul className="mt-2 space-y-3 text-sm text-ink-soft">
                {atsAudit.soft_blockers.map((b) => {
                  const key = blockerKey(b);
                  const stateKey = rebuttalStateKey('blocker', key);
                  return (
                    <li key={key} className="rounded-lg border border-line bg-sheet p-3">
                      <p>
                        <span className="text-ink">{b.requirement}</span> — {b.reason}
                      </p>
                      {b.honest_approach ? (
                        <span className="mt-1 block text-xs text-ink-faint">
                          Approach: {b.honest_approach}
                        </span>
                      ) : null}
                      <label className="mt-2 block text-xs text-ink-faint" htmlFor={`blocker-${key}`}>
                        Rebuttal (optional)
                      </label>
                      <textarea
                        id={`blocker-${key}`}
                        value={atsRebuttals[stateKey] ?? ''}
                        onChange={(e) =>
                          setAtsRebuttals((prev) => ({ ...prev, [stateKey]: e.target.value }))
                        }
                        rows={2}
                        placeholder='e.g. "I have 5 years of AWS across Kennametal and side projects"'
                        className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-1.5 text-sm text-ink"
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {atsNeedsInput && atsAudit.findings.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Findings</p>
              <p className="mt-1 text-xs text-ink-faint">
                Informational notes are fine to ignore. If a finding is wrong, rebut it briefly.
              </p>
              <ul className="mt-2 space-y-3 text-sm text-ink-soft">
                {atsAudit.findings.map((f) => {
                  const key = findingKey(f);
                  const stateKey = rebuttalStateKey('finding', key);
                  return (
                    <li key={key} className="rounded-lg border border-line bg-sheet p-3">
                      <p>
                        <span
                          className={
                            f.severity === 'high'
                              ? 'text-rose-800'
                              : f.severity === 'low'
                                ? 'text-ink-faint'
                                : 'text-brand'
                          }
                        >
                          {f.severity}
                        </span>{' '}
                        · <span className="text-ink">{f.issue}</span>
                      </p>
                      {f.fix ? (
                        <span className="mt-1 block text-xs text-ink-faint">Fix: {f.fix}</span>
                      ) : null}
                      <label className="mt-2 block text-xs text-ink-faint" htmlFor={`rebut-${key}`}>
                        Rebuttal (optional)
                      </label>
                      <textarea
                        id={`rebut-${key}`}
                        value={atsRebuttals[stateKey] ?? ''}
                        onChange={(e) =>
                          setAtsRebuttals((prev) => ({ ...prev, [stateKey]: e.target.value }))
                        }
                        rows={2}
                        placeholder='e.g. "Actually I owned the Jenkins pipeline at Kennametal for 2 years"'
                        className="mt-1 w-full rounded-lg border border-line bg-sheet px-3 py-1.5 text-sm text-ink"
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {atsAudit.auto_patches_applied.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                Auto-patched without asking
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
                {atsAudit.auto_patches_applied.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {atsNeedsInput ? (
            <div className="space-y-3 border-t border-line pt-4">
              {atsAudit.questions.length > 0 ? (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Quick ATS questions</h3>
                    <p className="mt-1 text-xs text-ink-faint">
                      Optional. Chip answers or finding/blocker rebuttals above — one Apply pushes
                      the resume as far as honesty allows, then follow-ups close.
                    </p>
                  </div>
                  {atsAudit.questions.map((q, i) => (
                    <QuestionField
                      key={q.id}
                      index={i}
                      total={atsAudit.questions.length}
                      question={q}
                      value={atsAnswers[q.id] ?? ''}
                      onChange={(value) => setAtsAnswers((prev) => ({ ...prev, [q.id]: value }))}
                      facts={identity?.facts}
                    />
                  ))}
                </>
              ) : (
                <p className="text-sm text-ink-faint">
                  Optional rebuttals above. Apply once to patch and lock this ATS screen — skipped
                  items are treated as accepted.
                </p>
              )}
              <button
                type="button"
                onClick={handleApplyAts}
                disabled={pending}
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-paper hover:bg-brand-soft disabled:opacity-50"
              >
                {pending ? 'Applying ATS updates…' : 'Apply ATS improvements'}
              </button>
            </div>
          ) : null}
        </section>
      )}

      {step === 'done' && output && (
        <section className="space-y-4 rounded-xl border border-line bg-paper p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-ink">Your drafts</h2>
              <div className="flex rounded-lg border border-line bg-sheet p-0.5">
                <button
                  type="button"
                  onClick={() => setDraftView('resume')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    draftView === 'resume'
                      ? 'bg-brand text-paper'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => setDraftView('cover-letter')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    draftView === 'cover-letter'
                      ? 'bg-brand text-paper'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Cover letter
                </button>
              </div>
            </div>
            {(draftView === 'resume' || coverLetterOutput) && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      draftView === 'resume'
                        ? resumeDraft
                          ? draftToPlainText(resumeDraft)
                          : output
                        : composeCoverLetter(coverLetterOutput, undefined, identity?.cover)
                    )
                  }
                  className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-brand"
                >
                  Copy
                </button>
                {draftView === 'resume' && resumeDraft && (
                  <button
                    type="button"
                    onClick={handleFitToPage}
                    disabled={pending}
                    className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-brand disabled:opacity-50"
                  >
                    Trim to one page
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        if (draftView === 'resume' && resumeDraft) {
                          await saveResumeDraft(session.id, resumeDraft);
                        }
                        if (draftView === 'cover-letter' && coverLetterOutput) {
                          await saveCoverLetter(session.id, coverLetterOutput);
                        }
                        window.location.href = `/api/tailor/${session.id}/download?format=docx&doc=${
                          draftView === 'resume' ? 'resume' : 'cover-letter'
                        }`;
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Download failed');
                      }
                    });
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Download DOCX
                </button>
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        if (draftView === 'resume' && resumeDraft) {
                          await saveResumeDraft(session.id, resumeDraft);
                        }
                        if (draftView === 'cover-letter' && coverLetterOutput) {
                          await saveCoverLetter(session.id, coverLetterOutput);
                        }
                        window.location.href = `/api/tailor/${session.id}/download?format=pdf&doc=${
                          draftView === 'resume' ? 'resume' : 'cover-letter'
                        }`;
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Download failed');
                      }
                    });
                  }}
                  className="rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
                >
                  Download PDF
                </button>
              </div>
            )}
          </div>
          {fitMessage && draftView === 'resume' && (
            <p className="text-xs text-ink-soft">{fitMessage}</p>
          )}
          {draftView === 'resume' && resumeDraft ? (
            <ResumePreview
              draft={resumeDraft}
              onChange={setResumeDraft}
              saving={draftSaving}
              saved={draftSaved}
            />
          ) : draftView === 'resume' ? (
            <PlainTextResumePreview text={output} />
          ) : coverLetterOutput ? (
            <CoverLetterPreview
              body={coverLetterOutput}
              onChange={setCoverLetterOutput}
              saving={coverSaving}
              saved={coverSaved}
              headerLines={identity ? [identity.cover.name, identity.cover.locationContact, identity.cover.profiles] : undefined}
              candidateName={identity?.displayName}
            />
          ) : (
            <p className="rounded-lg border border-line bg-sheet p-4 text-sm text-ink-faint">
              No cover letter yet for this session.
            </p>
          )}
          {draftView === 'resume' && keywordAlignment.length > 0 && (
            <div className="rounded-lg border border-line bg-sheet p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
                Keyword alignment
              </p>
              <div className="flex flex-wrap gap-1.5">
                {keywordAlignment.map((item) => (
                  <span
                    key={item.term}
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      /yes/i.test(item.status)
                        ? 'bg-emerald-100 text-emerald-800'
                        : /partial/i.test(item.status)
                          ? 'bg-brand/15 text-brand'
                          : 'bg-deep text-ink-soft'
                    }`}
                  >
                    {item.term} · {item.status}
                  </span>
                ))}
              </div>
            </div>
          )}
          {draftView === 'cover-letter' && !coverLetterOutput && (
            <button
              type="button"
              onClick={handleGenerateCoverLetter}
              disabled={pending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-paper hover:bg-brand-soft disabled:opacity-50"
            >
              {pending ? 'Generating…' : 'Generate cover letter'}
            </button>
          )}
          {((draftView === 'resume' && output) ||
            (draftView === 'cover-letter' && coverLetterOutput)) && (
            <DraftRevisionPanel
              docLabel={draftView === 'cover-letter' ? 'cover letter' : 'resume'}
              pending={pending}
              disabled={pending}
              onRevise={handleReviseDraft}
            />
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {applicationStage ? (
              <>
                <ApplicationStageSelect
                  jobId={job.isManual ? undefined : Number(job.id)}
                  manualJobId={job.isManual ? job.id : undefined}
                  stage={applicationStage}
                />
                <Link
                  href="/?view=applied"
                  className="text-sm text-brand hover:underline"
                >
                  View in Applied tab
                </Link>
              </>
            ) : job.isManual ? (
              <MarkAppliedButton
                manualJobId={job.id}
                sessionId={session.id}
                label="I've applied — move to Applied tab"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-paper hover:bg-brand-soft"
              />
            ) : (
              <>
                <MarkAppliedButton
                  jobId={Number(job.id)}
                  sessionId={session.id}
                  label="I've applied — move to Applied tab"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-paper hover:bg-brand-soft"
                />
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink-soft hover:text-brand"
                  >
                    Open listing to apply ↗
                  </a>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-ink-faint">
            {draftView === 'resume'
              ? resumeDraft
                ? 'Edit bullets in the preview. Header and education start filled in. Trim to one page removes extras when the PDF would spill. PDF uses Cambria 11pt.'
                : 'Legacy plain-text draft — regenerate for the structured Cambria editor.'
              : 'Click the letter to edit any paragraph, including the name under Sincerely. Header and date stay locked. Download PDF for Cambria 11, same as the resume.'}
          </p>
        </section>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
