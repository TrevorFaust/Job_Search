'use client';

import { useMemo, useState } from 'react';
import { resolveResumeFromOutput } from '@/lib/resume-draft';
import { normalizeCoverLetterBody } from '@/lib/cover-letter';
import { CoverLetterPreview } from '@/components/CoverLetterPreview';
import { PlainTextResumePreview } from '@/components/PlainTextResumePreview';
import { ResumePreviewStatic } from '@/components/ResumePreviewStatic';
import Link from 'next/link';

type DraftView = 'resume' | 'cover-letter';

type Props = {
  tailorHref: string;
  outputText: string | null;
  coverLetterText: string | null;
};

export function JobApplicationMaterials({ tailorHref, outputText, coverLetterText }: Props) {
  const resume = useMemo(() => resolveResumeFromOutput(outputText), [outputText]);
  const coverBody = coverLetterText ? normalizeCoverLetterBody(coverLetterText) : '';
  const hasResume = !!resume?.draft;
  const hasCover = coverBody.trim().length > 0;
  const legacyPlainText =
    !resume?.draft && outputText?.trim() && !outputText.trim().startsWith('{') ? outputText : null;
  const [draftView, setDraftView] = useState<DraftView>(hasResume || legacyPlainText ? 'resume' : 'cover-letter');

  if (!hasResume && !legacyPlainText && !hasCover) {
    return (
      <div className="rounded-xl border border-line bg-paper p-8 text-center">
        <p className="text-sm text-ink-soft">No tailored resume or cover letter yet.</p>
        <Link
          href={tailorHref}
          className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-paper hover:bg-brand-soft"
        >
          Tailor resume for this role
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-line bg-sheet p-0.5">
            {(hasResume || legacyPlainText) && (
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
            )}
            {hasCover && (
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
            )}
          </div>
        </div>
        <Link
          href={tailorHref}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:border-brand hover:text-brand"
        >
          Edit resume & cover letter →
        </Link>
      </div>

      {draftView === 'resume' && resume?.draft && <ResumePreviewStatic draft={resume.draft} />}

      {draftView === 'resume' && !resume?.draft && legacyPlainText && (
        <PlainTextResumePreview text={legacyPlainText} />
      )}

      {draftView === 'cover-letter' && hasCover && (
        <CoverLetterPreview body={coverBody} onChange={() => {}} readOnly />
      )}
    </div>
  );
}
