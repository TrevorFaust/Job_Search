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
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm text-emerald-200/90">
          <p className="font-medium">Active resume saved</p>
          <p className="mt-1 text-emerald-300/70">
            {resume.label}
            {resume.source_filename ? ` · ${resume.source_filename}` : ''}
            {' · '}
            {resume.content_text.length.toLocaleString()} characters
          </p>
        </div>
      )}

      <form action={handleFileSubmit} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="font-medium text-zinc-200">Upload file</h2>
        <p className="text-sm text-zinc-500">DOCX, PDF, or plain text. Replaces your current master resume.</p>
        <input type="hidden" name="token" value={token} />
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="block w-full text-sm text-zinc-400 file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-200 hover:file:bg-zinc-700"
          required={!resume}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {pending ? 'Uploading…' : 'Upload resume'}
        </button>
      </form>

      <form action={handleTextSubmit} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="font-medium text-zinc-200">Or paste text</h2>
        <textarea
          name="content_text"
          defaultValue={resume?.content_text ?? ''}
          rows={14}
          placeholder="Paste your full resume here…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100"
          required={!resume}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save pasted resume'}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && <p className="text-sm text-emerald-400">Resume saved.</p>}
    </section>
  );
}
