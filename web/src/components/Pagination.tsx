import Link from 'next/link';

type Props = {
  page: number;
  totalPages: number;
  total: number;
  hrefForPage: (page: number) => string;
};

export function Pagination({ page, totalPages, total, hrefForPage }: Props) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2
  );

  return (
    <nav className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
      <p className="text-sm text-ink-faint">
        Page {page} of {totalPages} · {total} jobs total
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {page > 1 && (
          <Link
            href={hrefForPage(page - 1)}
            className="rounded-full border border-line bg-sheet px-3.5 py-1.5 text-sm text-ink-soft hover:border-ink/25"
          >
            ← Prev
          </Link>
        )}
        {pages.map((p, i) => {
          const prev = pages[i - 1];
          const gap = prev && p - prev > 1;
          return (
            <span key={p} className="flex items-center gap-1">
              {gap && <span className="px-1 text-ink-faint">…</span>}
              <Link
                href={hrefForPage(p)}
                className={`rounded-full px-3.5 py-1.5 text-sm ${
                  p === page
                    ? 'bg-brand font-semibold text-paper'
                    : 'border border-line bg-sheet text-ink-soft hover:border-ink/25'
                }`}
              >
                {p}
              </Link>
            </span>
          );
        })}
        {page < totalPages && (
          <Link
            href={hrefForPage(page + 1)}
            className="rounded-full border border-line bg-sheet px-3.5 py-1.5 text-sm text-ink-soft hover:border-ink/25"
          >
            Next →
          </Link>
        )}
      </div>
    </nav>
  );
}
