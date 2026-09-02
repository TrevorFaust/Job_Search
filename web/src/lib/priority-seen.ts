'use client';

import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'jh_priority_seen';
const VERSION = 1;

type Stored = { v: number; ids: number[] };

export function loadPrioritySeenIds(): Set<number> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Stored;
    if (parsed?.v !== VERSION || !Array.isArray(parsed.ids)) return new Set();
    return new Set(parsed.ids.filter((id) => typeof id === 'number' && Number.isFinite(id)));
  } catch {
    return new Set();
  }
}

export function savePrioritySeenIds(ids: Set<number>, validIds?: Iterable<number>) {
  if (typeof window === 'undefined') return;
  let toStore = ids;
  if (validIds) {
    const validList = [...validIds];
    if (validList.length) {
      const valid = new Set(validList);
      toStore = new Set([...ids].filter((id) => valid.has(id)));
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, ids: [...toStore] }));
  } catch {
    // ignore quota / private mode
  }
}

export function markPriorityJobsSeen(pageIds: number[], validIds: number[]): Set<number> {
  const seen = loadPrioritySeenIds();
  for (const id of pageIds) seen.add(id);
  savePrioritySeenIds(seen, validIds);
  if (!validIds.length) return seen;
  const valid = new Set(validIds);
  return new Set([...seen].filter((id) => valid.has(id)));
}

/** Tracks which priority jobs the user has actually opened a list page for. */
export function usePrioritySeen(
  view: string,
  pageJobIds: number[],
  priorityJobIds: number[]
) {
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const [sessionUnseen, setSessionUnseen] = useState<Set<number>>(() => new Set());
  const [ready, setReady] = useState(false);
  const pageKey = pageJobIds.join(',');
  const priorityKey = priorityJobIds.join(',');

  useEffect(() => {
    const stored = loadPrioritySeenIds();
    if (view === 'priority' && pageJobIds.length) {
      const nextSession = new Set<number>();
      for (const id of pageJobIds) {
        if (!stored.has(id)) nextSession.add(id);
      }
      if (nextSession.size) {
        setSessionUnseen((prev) => {
          const merged = new Set(prev);
          for (const id of nextSession) merged.add(id);
          return merged;
        });
      }
      setSeen(markPriorityJobsSeen(pageJobIds, priorityJobIds));
    } else {
      setSeen(stored);
    }
    setReady(true);
  }, [view, pageKey, priorityKey]);

  const newCount = useMemo(() => {
    if (!ready) return 0;
    return priorityJobIds.reduce((n, id) => n + (seen.has(id) ? 0 : 1), 0);
  }, [ready, priorityJobIds, seen]);

  return { ready, newCount, sessionUnseen };
}
