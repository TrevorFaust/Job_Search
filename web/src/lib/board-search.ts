import { normalizeBoardView, type BoardView } from './board-data';

const PREFERRED_CATS_KEY = 'jh_preferred_cats';

function canonicalizeParams(params: URLSearchParams): string {
  const entries = [...params.entries()].sort((a, b) =>
    a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
  );
  return new URLSearchParams(entries).toString();
}

function rememberPreferredCats(cats: string[]) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PREFERRED_CATS_KEY, JSON.stringify(cats));
  } catch {
    // ignore private mode / quota
  }
}

function readPreferredCats(): string[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PREFERRED_CATS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const cats = parsed.filter((cat): cat is string => typeof cat === 'string' && cat.length > 0);
    return cats.length ? cats : null;
  } catch {
    return null;
  }
}

function withoutCategories(params: URLSearchParams) {
  params.delete('cat');
}

function restorePreferredCats(params: URLSearchParams) {
  if (params.has('cat')) return;
  const saved = readPreferredCats();
  if (!saved?.length) return;
  for (const cat of saved) params.append('cat', cat);
}

/** Stable query string for the current board URL, including page. */
export function canonicalBoardSearch(current: string): string {
  const params = new URLSearchParams(current);
  const view = normalizeBoardView(params.get('view') ?? undefined);
  params.set('view', view);
  if (view !== 'preferred' && params.has('cat')) {
    rememberPreferredCats(params.getAll('cat'));
    withoutCategories(params);
  }
  return canonicalizeParams(params);
}

/** First page of a tab, keeping the current filters, sort, and search. */
export function boardTabSearch(current: string, view: BoardView): string {
  const params = new URLSearchParams(current);
  const currentView = normalizeBoardView(params.get('view') ?? undefined);
  if (currentView === 'preferred' && view !== 'preferred') {
    rememberPreferredCats(params.getAll('cat'));
  }
  params.set('view', view);
  params.delete('page');
  params.delete('stage');
  if (view === 'preferred') restorePreferredCats(params);
  else withoutCategories(params);
  return canonicalizeParams(params);
}
