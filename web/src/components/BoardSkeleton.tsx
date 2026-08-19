export function BoardSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]" aria-busy="true" aria-label="Loading jobs">
      <div className="hidden space-y-4 lg:block">
        <div className="h-6 w-24 animate-pulse rounded bg-zinc-800" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-zinc-800/80" />
          ))}
        </div>
      </div>
      <div className="space-y-6">
        <div className="h-11 animate-pulse rounded-xl bg-zinc-800" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-zinc-800" />
          ))}
        </div>
        <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 p-5">
              <div className="h-6 w-2/3 animate-pulse rounded bg-zinc-800" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-800/80" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-800/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
