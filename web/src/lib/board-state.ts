export const BOARD_STATE_KEY = 'jh_board_href';

export function saveBoardHref(href: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(BOARD_STATE_KEY, href);
  } catch {
    // ignore quota / private mode
  }
}

export function clearBoardHref() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(BOARD_STATE_KEY);
  } catch {
    // ignore
  }
}

export function getBoardHref(): string {
  if (typeof window === 'undefined') return '/';
  try {
    return sessionStorage.getItem(BOARD_STATE_KEY) || '/';
  } catch {
    return '/';
  }
}

export function hasPersistedBoardState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const href = sessionStorage.getItem(BOARD_STATE_KEY);
    return !!href && href !== '/';
  } catch {
    return false;
  }
}
