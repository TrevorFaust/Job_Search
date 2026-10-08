export function BoardListSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading jobs">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-line bg-sheet p-5">
          <div className="h-6 w-2/3 animate-pulse rounded bg-deep" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-deep/80" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-deep/60" />
        </div>
      ))}
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]" aria-busy="true" aria-label="Loading jobs">
      <div className="hidden space-y-4 rounded-2xl border border-line bg-sheet p-5 lg:block">
        <div className="h-4 w-20 animate-pulse rounded bg-deep" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl bg-deep/80" />
          ))}
        </div>
      </div>
      <div className="space-y-6">
        <div className="h-14 animate-pulse rounded-2xl bg-sheet" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-deep" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-line bg-sheet p-5">
              <div className="h-6 w-2/3 animate-pulse rounded bg-deep" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-deep/80" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-deep/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
