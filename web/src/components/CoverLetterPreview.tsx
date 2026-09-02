'use client';

import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
import {
  coverLetterDate,
  coverLetterHeaderLines,
  coverLetterSpacingForBody,
  normalizeCoverLetterBody,
} from '@/lib/cover-letter';

type Props = {
  body: string;
  onChange: (body: string) => void;
  saving?: boolean;
  saved?: boolean;
  readOnly?: boolean;
};

function AutoTextarea({
  value,
  onChange,
  className,
  placeholder,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      style={style}
      className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-inherit outline-none ring-0 placeholder:text-neutral-400 focus:bg-amber-50/60 ${className ?? ''}`}
    />
  );
}

export function CoverLetterPreview({ body, onChange, saving, saved, readOnly = false }: Props) {
  const headerLines = coverLetterHeaderLines();
  const { paragraphs, spacing } = coverLetterSpacingForBody(body);

  function updateParagraph(index: number, text: string) {
    const next = paragraphs.map((p, i) => (i === index ? text : p));
    onChange(normalizeCoverLetterBody(next.join('\n\n')));
  }

  return (
    <div className="space-y-3">
      {!readOnly && (
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {saving && <span className="text-zinc-500">Saving…</span>}
        {saved && !saving && <span className="text-emerald-400/80">Saved</span>}
        <span className="text-zinc-600">Header and date stay locked. Click the letter body to edit.</span>
      </div>
      )}

      <div className={`rounded-lg border border-zinc-700 bg-zinc-950 p-3 ${readOnly ? 'overflow-visible' : 'overflow-x-auto'}`}>
        <div
          className="mx-auto bg-white text-black shadow-xl"
          style={{
            width: '8.5in',
            minHeight: readOnly ? undefined : '11in',
            padding: '1in',
            fontFamily: "Cambria, Caladea, 'Times New Roman', serif",
            fontSize: '11pt',
            color: '#000',
          }}
        >
          <div className={readOnly ? 'pointer-events-none select-text' : undefined}>
            {headerLines.map((line) => (
              <p key={line} style={{ margin: 0, lineHeight: `${spacing.headerLineHeight}pt` }}>
                {line}
              </p>
            ))}
            <p
              style={{
                margin: 0,
                marginTop: `${spacing.headerLineHeight}pt`,
                lineHeight: `${spacing.headerLineHeight}pt`,
              }}
            >
              {coverLetterDate()}
            </p>
            <div style={{ marginTop: `${spacing.afterDate}pt` }}>
              {paragraphs.length === 0 ? (
                readOnly ? (
                  <p className="text-neutral-400">No cover letter body.</p>
                ) : (
                  <AutoTextarea
                    value=""
                    onChange={onChange}
                    placeholder="Company or salutation, then the letter body…"
                    style={{ lineHeight: `${spacing.lineHeight}pt` }}
                  />
                )
              ) : (
                paragraphs.map((paragraph, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: i < paragraphs.length - 1 ? `${spacing.paragraphGap}pt` : 0,
                    }}
                  >
                    {readOnly ? (
                      <p style={{ margin: 0, lineHeight: `${spacing.lineHeight}pt`, whiteSpace: 'pre-wrap' }}>
                        {paragraph}
                      </p>
                    ) : (
                      <AutoTextarea
                        value={paragraph}
                        onChange={(text) => updateParagraph(i, text)}
                        style={{ lineHeight: `${spacing.lineHeight}pt` }}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useDebouncedCoverSave(
  sessionId: string,
  text: string,
  save: (sessionId: string, text: string) => Promise<unknown>
) {
  const [saving, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (!text) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      startTransition(async () => {
        await save(sessionId, text);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
      });
    }, 700);
    return () => window.clearTimeout(t);
  }, [text, sessionId, save]);

  return { saving, saved };
}
