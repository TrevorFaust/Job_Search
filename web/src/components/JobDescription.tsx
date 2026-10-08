import { parseJobDescription } from '@/lib/job-description';

type Props = {
  description: string;
};

export function JobDescription({ description }: Props) {
  const blocks = parseJobDescription(description);

  return (
    <div className="space-y-5 rounded-xl border border-line bg-paper p-5 text-sm leading-relaxed text-ink-soft">
      {blocks.map((block, i) => {
        if (block.type === 'heading') {
          return (
            <h3
              key={i}
              className="border-b border-line pb-2 font-[family-name:var(--font-display)] text-base font-semibold text-ink"
            >
              {block.text}
            </h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={i} className="ml-1 list-inside list-disc space-y-2 text-ink-soft">
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-ink-soft">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
