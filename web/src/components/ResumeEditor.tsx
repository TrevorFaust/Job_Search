'use client';

import { useRef, useState, useTransition } from 'react';
import type { Resume } from '@/lib/resume-queries';
import { saveResumeFile, saveResumeText } from '@/lib/resume-actions';

type Props = {
  token: string;
  resume: Resume | null;
};

export function ResumeEditor({ token, resume }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleTextSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveResumeText(token, formData);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Save failed');
      }
    });
  }

  function handleFileSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveResumeFile(token, formData);
        setSaved(true);
        if (fileRef.current) fileRef.current.value = '';
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      }
    });
  }

  return (
    <section className="space-y-6">
      {resume && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Active resume saved</p>
          <p className="mt-1 text-emerald-800">
            {resume.label}
            {resume.source_filename ? ` · ${resume.source_filename}` : ''}
            {' · '}
            {resume.content_text.length.toLocaleString('en-US')} characters
          </p>
        </div>
      )}

      <form action={handleFileSubmit} className="space-y-3 rounded-xl border border-line bg-paper p-5">
        <h2 className="font-medium text-ink">Upload file</h2>
        <p className="text-sm text-ink-faint">DOCX, PDF, or plain text. Replaces your current master resume.</p>
        <input type="hidden" name="token" value={token} />
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="block w-full text-sm text-ink-soft file:mr-4 file:rounded-lg file:border-0 file:bg-deep file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-deep"
          required={!resume}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-paper hover:bg-brand-soft disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload resume'}
        </button>
      </form>

      <form action={handleTextSubmit} className="space-y-3 rounded-xl border border-line bg-paper p-5">
        <h2 className="font-medium text-ink">Or paste text</h2>
        <textarea
          name="content_text"
          defaultValue={resume?.content_text ?? ''}
          rows={14}
          placeholder="Paste your full resume here…"
          className="w-full rounded-lg border border-line bg-sheet px-3 py-2 font-mono text-sm text-ink"
          required={!resume}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save pasted resume'}
        </button>
      </form>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {saved && <p className="text-sm text-emerald-800">Resume saved.</p>}
    </section>
  );
}
