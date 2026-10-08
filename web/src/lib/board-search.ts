import { normalizeBoardView, type BoardView } from './board-data';

function canonicalizeParams(params: URLSearchParams): string {
  const entries = [...params.entries()].sort((a, b) =>
    a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
  );
  return new URLSearchParams(entries).toString();
}

/** Stable query string for the current board URL, including page. */
export function canonicalBoardSearch(current: string): string {
  const params = new URLSearchParams(current);
  const view = normalizeBoardView(params.get('view') ?? undefined);
  params.set('view', view);
  return canonicalizeParams(params);
}

/** First page of a tab, keeping the current filters, sort, and search. */
export function boardTabSearch(current: string, view: BoardView): string {
  const params = new URLSearchParams(current);
  params.set('view', view);
  params.delete('page');
  params.delete('stage');
  return canonicalizeParams(params);
}
