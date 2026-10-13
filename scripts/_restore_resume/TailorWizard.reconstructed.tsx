'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import type { TailorJobView } from '@/lib/manual-jobs';
import type { ApplicationStage } from '@/lib/applications';
import type { TailoringSession } from '@/lib/resume-queries';
import type { TailorAnswer } from '@/lib/llm';
import {
  fitResumeDraft,
  generateCoverLetterDraft,
  generateTailoredDraft,
  runGapAnalysis,
  saveCoverLetter,
  saveResumeDraft,
  saveTailorAnswers,
} from '@/lib/resume-actions';
import { composeCoverLetter, normalizeCoverLetterBody } from '@/lib/cover-letter';
import { draftToPlainText, parseResumeOutput, serializeResumeOutput } from '@/lib/resume-draft';
import { ResumePreview, useDebouncedDraftSave } from '@/components/ResumePreview';
import { CoverLetterPreview, useDebouncedCoverSave } from '@/components/CoverLetterPreview';
import { ResumeSaveFolder } from '@/components/ResumeSaveFolder';
import type { ResumeDraft } from '@/lib/resume-template';
import {
  filenameFromDisposition,
  triggerBrowserDownload,
  writeBlobToSavedFolder,
} from '@/lib/resume-save-folder';
import { MarkAppliedButton } from './MarkAppliedButton';
import { ApplicationStageSelect } from './ApplicationStageSelect';
import { DismissJobButton } from './DismissJobButton';

type Props = {
  job: TailorJobView;
  session: TailoringSession;
  initialReusedCount?: number;
  backHref?: string;
  applicationStage?: ApplicationStage;
};

function KeywordPills({ label, terms, tone }: { label: string; terms: string[]; tone: string }) {
  if (!terms.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {terms.slice(0, 24).map((term) => (
          <span key={term} className={`rounded-full px-2.5 py-0.5 text-xs ${tone}`}>
            {term}
          </span>
        ))}
        {terms.length > 24 && (
          <span className="px-2 py-0.5 text-xs text-zinc-500">+{terms.length - 24} more</span>
        )}
      </div>
    </div>
  );
}

export function TailorWizard({ job, session: initialSession, initialReusedCount = 0, backHref = '/', applicationStage }: Props) {
  const [session, setSession] = useState(initialSession);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reusedCount, setReusedCount] = useState(initialReusedCount);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of initialSession.answers ?? []) map[a.question_id] = a.answer;
    return map;
  });
  const [output, setOutput] = useState(initialSession.output_text ?? '');
  const [coverLetterOutput, setCoverLetterOutput] = useState(() =>
    normalizeCoverLetterBody(initialSession.cover_letter_text ?? '')
  );
  const [draftView, setDraftView] = useState<'resume' | 'cover-letter'>('resume');
  const [resumeDraft, setResumeDraft] = useState<ResumeDraft | null>(
    () => parseResumeOutput(initialSession.output_text)?.draft ?? null
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
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);

  const kw = session.keyword_analysis ?? { matched: [], partial: [], missing: [] };
  const gap = session.gap_analysis && 'summary' in session.gap_analysis ? session.gap_analysis : null;
  const questions = session.questions ?? [];
  const step =
    session.status === 'done' && output
      ? 'done'
      : gap
        ? 'questions'
        : 'keywords';

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await runGapAnalysis(session.id);
        const prefilled: Record<string, string> = {};
        for (const a of result.answers ?? []) prefilled[a.question_id] = a.answer;
        setAnswers((prev) => ({ ...prev, ...prefilled }));
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
        setResumeDraft(parseResumeOutput(result.output_text)?.draft ?? null);
        setCoverLetterOutput(normalizeCoverLetterBody(result.cover_letter_text));
        setFitMessage(null);
        setSession((s) => ({
          ...s,
          status: 'done',
          output_text: result.output_text,
          cover_letter_text: result.cover_letter_text,
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
        setCoverLetterOutput(result.cover_letter_text);
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

  async function handleDownload(format: 'pdf' | 'docx') {
    setError(null);
    setDownloadMessage(null);
    if (draftView === 'resume' && resumeDraft) {
      try {
        await saveResumeDraft(session.id, resumeDraft);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
        return;
      }
    }
    if (draftView === 'cover-letter' && coverLetterOutput) {
      try {
        await saveCoverLetter(session.id, coverLetterOutput);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
        return;
      }
    }
    const doc = draftView === 'resume' ? 'resume' : 'cover-letter';
    try {
      const res = await fetch(`/api/tailor/${session.id}/download?format=${format}&doc=${doc}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const fallback = format === 'pdf' ? 'Resume.pdf' : 'Resume.docx';
      const filename = filenameFromDisposition(res.headers.get('Content-Disposition'), fallback);
      const folder = await writeBlobToSavedFolder(filename, blob);
      if (folder) {
        setDownloadMessage(`Saved to ${folder}`);
        return;
      }
      triggerBrowserDownload(filename, blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  }

  const keywordAlignment = parseResumeOutput(output)?.keywordAlignment ?? [];

  return (
    <div className="space-y-8">
      <header className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <p className="text-xs uppercase tracking-wide text-amber-400/80">
          {job.isManual ? 'Manual application' : job.source}
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-zinc-50">
          {job.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {job.company ?? 'Unknown company'} · {job.location ?? 'Location n/a'}
        </p>
        <p className="mt-3 text-xs text-zinc-600">
          Draft only — review before submitting. We produce a tailored resume and cover letter using the same answers and context.
        </p>
        {!applicationStage && (
          <div className="mt-4 border-t border-zinc-800 pt-4">
            {job.isManual ? (
              <DismissJobButton
                manualJobId={job.id}
                redirectTo="/applications"
                label="Listing unavailable — remove job"
                className="text-sm text-zinc-500 hover:text-zinc-300"
              />
            ) : (
              <DismissJobButton
                jobId={Number(job.id)}
                redirectTo={backHref}
                label="Listing unavailable — remove from board"
                className="text-sm text-zinc-500 hover:text-zinc-300"
              />
            )}
          </div>
        )}
      </header>

      {step === 'keywords' && (
        <section className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Keyword overlap</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Instant scan of listing terms vs your resume — before AI analysis.
            </p>
          </div>
          <KeywordPills label="Already on your resume" terms={kw.matched} tone="bg-emerald-950 text-emerald-300" />
          <KeywordPills label="Related / partial" terms={kw.partial} tone="bg-amber-950/80 text-amber-200" />
          <KeywordPills label="Not found yet" terms={kw.missing} tone="bg-zinc-800 text-zinc-400" />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={pending}
            className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {pending ? 'Analyzing…' : 'Run AI gap analysis & questions'}
          </button>
        </section>
      )}

      {step === 'questions' && gap && (
        <>
          <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-lg font-semibold text-zinc-100">Gap analysis</h2>
            {gap.fit_level && (
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                Fit:{' '}
                <span className="text-amber-300">
                  {gap.fit_level.replace('_', ' ')}
                  {gap.fit_score != null ? ` · ${gap.fit_score.toFixed(1)}/10` : ''}
                </span>
              </p>
            )}
            <p className="text-sm text-zinc-300">{gap.summary}</p>
            {gap.strong_matches?.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase text-emerald-500">Strong matches</p>
                <ul className="mt-2 space-y-2 text-sm text-zinc-400">
                  {gap.strong_matches.map((m) => (
                    <li key={m.skill}>
                      <span className="text-zinc-200">{m.skill}</span> — {m.resume_evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {gap.partial_matches?.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase text-amber-400">Reframe opportunities</p>
                <ul className="mt-2 space-y-2 text-sm text-zinc-400">
                  {gap.partial_matches.map((m) => (
                    <li key={m.skill}>
                      <span className="text-zinc-200">{m.skill}</span> — {m.reframe_suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Clarifying questions</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Your answers are saved for future applications — similar jobs won&apos;t re-ask them.
              </p>
              {reusedCount > 0 && (
                <p className="mt-2 text-xs text-emerald-400/90">
                  {reusedCount} answer{reusedCount === 1 ? '' : 's'} reused from previous tailoring sessions.
                </p>
              )}
            </div>
            {questions.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No new questions for this role — your saved answers cover it. Add optional context below and generate.
              </p>
            ) : (
              questions.map((q) => (
              <div key={q.id} className="space-y-2 border-t border-zinc-800 pt-4 first:border-0 first:pt-0">
                <p className="text-sm font-medium text-zinc-200">{q.question}</p>
                <p className="text-xs text-zinc-500">{q.context}</p>
                {q.suggested_answers && q.suggested_answers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {q.suggested_answers.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: s }))}
                        className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-amber-500/40 hover:text-amber-200"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  rows={3}
                  placeholder="Your honest answer…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </div>
              ))
            )}
            <div className="space-y-2 border-t border-zinc-800 pt-5">
              <label className="block text-sm font-medium text-zinc-200" htmlFor="extra-context">
                Anything else we should know?
              </label>
              <p className="text-xs text-zinc-500">
                Why this role, career pivot story, related interests, or context that doesn&apos;t fit the questions above.
                Especially useful when the fit is a stretch — we&apos;ll lean on this for your Profile section.
              </p>
              <textarea
                id="extra-context"
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
                rows={4}
                placeholder="e.g. I've always been passionate about aviation, I'm pursuing my PPL, my leadership in X translates to…"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-200" htmlFor="page-length">
                Resume length
              </label>
              <select
                id="page-length"
                value={pagePreference}
                onChange={(e) => setPagePreference(e.target.value as 'one' | 'two')}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="one">One page (default)</option>
                <option value="two">Up to two pages</option>
              </select>
              <p className="text-xs text-zinc-500">
                Generates a Cambria 11pt one-page PDF in your template. You can edit the preview before downloading.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={pending}
              className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {pending ? 'Generating drafts…' : 'Generate resume & cover letter'}
            </button>
          </section>
        </>
      )}

      {step === 'done' && output && (
        <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-zinc-100">Your drafts</h2>
              <div className="flex rounded-lg border border-zinc-700 bg-zinc-950 p-0.5">
                <button
                  type="button"
                  onClick={() => setDraftView('resume')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    draftView === 'resume'
                      ? 'bg-amber-400 text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => setDraftView('cover-letter')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    draftView === 'cover-letter'
                      ? 'bg-amber-400 text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
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
                        : composeCoverLetter(coverLetterOutput)
                    )
                  }
                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:border-amber-500/50"
                >
                  Copy
                </button>
                {draftView === 'resume' && resumeDraft && (
                  <button
                    type="button"
                    onClick={handleFitToPage}
                    disabled={pending}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:border-amber-500/50 disabled:opacity-50"
                  >
                    Trim to one page
                  </button>
                )}
                {fitMessage && draftView === 'resume' && (
                  <p className="w-full text-xs text-zinc-400">{fitMessage}</p>
                )}
                <button
                  type="button"
                  onClick={() => handleDownload('docx')}
                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:border-amber-500/50"
                >
                  Download DOCX
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload('pdf')}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Download PDF
                </button>
              </div>
            )}
            {(draftView === 'resume' || coverLetterOutput) && (
              <div className="space-y-1">
                <ResumeSaveFolder />
                {downloadMessage ? <p className="text-xs text-emerald-400/90">{downloadMessage}</p> : null}
              </div>
            )}
          </div>
          {draftView === 'resume' && resumeDraft ? (
            <ResumePreview
              draft={resumeDraft}
              onChange={setResumeDraft}
              saving={draftSaving}
              saved={draftSaved}
            />
          ) : draftView === 'cover-letter' && coverLetterOutput ? (
            <CoverLetterPreview
              body={coverLetterOutput}
              onChange={setCoverLetterOutput}
              saving={coverSaving}
              saved={coverSaved}
            />
          ) : (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-300">
              {draftView === 'resume' ? (
                output
              ) : (
                <span className="text-zinc-500">No cover letter yet for this session.</span>
              )}
            </pre>
          )}
          {draftView === 'resume' && keywordAlignment.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Keyword alignment</p>
              <div className="flex flex-wrap gap-1.5">
                {keywordAlignment.map((item) => (
                  <span
                    key={item.term}
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      /yes/i.test(item.status)
                        ? 'bg-emerald-950 text-emerald-300'
                        : /partial/i.test(item.status)
                          ? 'bg-amber-950/80 text-amber-200'
                          : 'bg-zinc-800 text-zinc-400'
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
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {pending ? 'Generating…' : 'Generate cover letter'}
            </button>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
            {applicationStage ? (
              <>
                <ApplicationStageSelect
                  jobId={job.isManual ? undefined : Number(job.id)}
                  manualJobId={job.isManual ? job.id : undefined}
                  stage={applicationStage}
                />
                <Link
                  href="/?view=applied"
                  className="text-sm text-amber-400 hover:underline"
                >
                  View in Applied tab
                </Link>
              </>
            ) : job.isManual ? (
              <MarkAppliedButton
                manualJobId={job.id}
                sessionId={session.id}
                label="I've applied — move to Applied tab"
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              />
            ) : (
              <>
                <MarkAppliedButton
                  jobId={Number(job.id)}
                  sessionId={session.id}
                  label="I've applied — move to Applied tab"
                  className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
                />
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-zinc-400 hover:text-amber-300"
                  >
                    Open listing to apply ↗
                  </a>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-zinc-600">
            {draftView === 'resume'
              ? 'Edits auto-save. Download PDF when it looks right. File name is "(job title) - Trevor Faust.pdf".'
              : 'Header and date are locked. The body auto-saves. Download PDF for Cambria 11, same as the resume.'}
          </p>
        </section>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
