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
    <nav className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-6">
      <p className="text-sm text-zinc-500">
        Page {page} of {totalPages} · {total} jobs total
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {page > 1 && (
          <Link
            href={hrefForPage(page - 1)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            ← Prev
          </Link>
        )}
        {pages.map((p, i) => {
          const prev = pages[i - 1];
          const gap = prev && p - prev > 1;
          return (
            <span key={p} className="flex items-center gap-1">
              {gap && <span className="px-1 text-zinc-600">…</span>}
              <Link
                href={hrefForPage(p)}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  p === page
                    ? 'bg-amber-400 font-semibold text-zinc-950'
                    : 'border border-zinc-700 text-zinc-300 hover:border-zinc-500'
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
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
          >
            Next →
          </Link>
        )}
      </div>
    </nav>
  );
}
