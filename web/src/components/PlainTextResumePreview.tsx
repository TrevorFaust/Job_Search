'use client';

import { parseResumeBlocks, type ResumeBlock } from '@/lib/resume-structure';

type Props = {
  text: string;
};

function Block({ block }: { block: ResumeBlock }) {
  switch (block.type) {
    case 'header':
      return (
        <p
          className={
            block.primary
              ? 'text-center text-xl font-bold leading-tight'
              : block.center
                ? 'text-center text-sm leading-snug text-neutral-700'
                : 'text-sm leading-snug'
          }
        >
          {block.text}
        </p>
      );
    case 'section':
      return (
        <p className="mb-1 mt-4 border-b border-neutral-400 pb-0.5 text-xs font-bold uppercase tracking-wide">
          {block.text}
        </p>
      );
    case 'bullet':
      return (
        <p className="flex gap-2 pl-2 text-sm leading-snug">
          <span className="shrink-0">•</span>
          <span>{block.text}</span>
        </p>
      );
    case 'body':
      return <p className="text-sm leading-snug">{block.text}</p>;
  }
}

/** Read-only resume sheet for legacy plain-text tailoring sessions (pre-JSON draft). */
export function PlainTextResumePreview({ text }: Props) {
  const blocks = parseResumeBlocks(text);

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 overflow-x-auto">
      <div
        className="mx-auto bg-white text-black shadow-xl"
        style={{
          width: '8.5in',
          minHeight: '11in',
          padding: '0.75in',
          fontFamily: "Cambria, Caladea, 'Times New Roman', serif",
          fontSize: '11pt',
          lineHeight: 1.25,
        }}
      >
        {blocks.map((block, index) => (
          <Block key={`${block.type}-${index}`} block={block} />
        ))}
      </div>
    </div>
  );
}
