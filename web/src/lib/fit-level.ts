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

/** Band cuts aligned with board-fit estimate bands. */
export function fitLevelFromScore(score: number): FitLevel {
  if (score >= 7.5) return 'strong';
  if (score >= 5.5) return 'moderate';
  if (score >= 3.5) return 'stretch';
  return 'long_shot';
}

/**
 * Map ATS audit 0–100 score to board 0–10 fit.
 * Uses min(score, ceiling) so the badge never exceeds the honest cap.
 */
export function fitFromAtsAudit(
  atsAudit: unknown
): { fit_level: FitLevel; fit_score: number } | undefined {
  if (!atsAudit || typeof atsAudit !== 'object') return undefined;
  const a = atsAudit as { score?: unknown; ceiling?: unknown };
  const score = typeof a.score === 'number' && Number.isFinite(a.score) ? a.score : null;
  const ceiling = typeof a.ceiling === 'number' && Number.isFinite(a.ceiling) ? a.ceiling : null;
  if (score == null && ceiling == null) return undefined;

  const percent =
    score != null && ceiling != null ? Math.min(score, ceiling) : (score ?? ceiling!);
  if (percent <= 0) return undefined;

  const fit_score = normalizeFitScore(percent / 10);
  if (fit_score == null) return undefined;
  return { fit_score, fit_level: fitLevelFromScore(fit_score) };
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
