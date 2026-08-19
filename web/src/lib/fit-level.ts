export type FitLevel = 'strong' | 'moderate' | 'stretch' | 'long_shot';

const FIT_LEVELS: FitLevel[] = ['strong', 'moderate', 'stretch', 'long_shot'];

export function parseFitLevel(gapAnalysis: unknown): FitLevel | undefined {
  if (!gapAnalysis || typeof gapAnalysis !== 'object') return undefined;
  const fit = (gapAnalysis as { fit_level?: unknown }).fit_level;
  if (typeof fit === 'string' && FIT_LEVELS.includes(fit as FitLevel)) {
    return fit as FitLevel;
  }
  return undefined;
}

/** Clamp to 0–10 and round to one decimal place. */
export function normalizeFitScore(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

export function parseFitScore(gapAnalysis: unknown): number | undefined {
  if (!gapAnalysis || typeof gapAnalysis !== 'object') return undefined;
  return normalizeFitScore((gapAnalysis as { fit_score?: unknown }).fit_score);
}

export function formatFitScore(score: number): string {
  return score.toFixed(1);
}

export function fitLevelLabel(level: FitLevel): string {
  switch (level) {
    case 'strong':
      return 'Strong fit';
    case 'moderate':
      return 'Moderate fit';
    case 'stretch':
      return 'Stretch';
    case 'long_shot':
      return 'Long shot';
  }
}

export function fitLevelBadgeClass(level: FitLevel): string {
  const base = 'rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide';
  switch (level) {
    case 'strong':
      return `${base} bg-emerald-400/15 text-emerald-300`;
    case 'moderate':
      return `${base} bg-amber-400/15 text-amber-300`;
    case 'stretch':
      return `${base} bg-orange-400/15 text-orange-300`;
    case 'long_shot':
      return `${base} bg-rose-400/15 text-rose-300`;
  }
}
