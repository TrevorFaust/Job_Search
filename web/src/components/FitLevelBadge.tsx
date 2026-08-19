import {
  fitLevelBadgeClass,
  fitLevelLabel,
  formatFitScore,
  type FitLevel,
} from '@/lib/fit-level';

type Props = {
  fitLevel: FitLevel;
  fitScore?: number;
};

export function FitLevelBadge({ fitLevel, fitScore }: Props) {
  const scoreLabel =
    fitScore != null ? ` · ${formatFitScore(fitScore)}/10` : '';
  const title =
    fitScore != null
      ? `Resume fit: ${fitLevelLabel(fitLevel)} (${formatFitScore(fitScore)}/10 likelihood with tailored resume)`
      : `Resume fit: ${fitLevelLabel(fitLevel)}`;

  return (
    <span className={fitLevelBadgeClass(fitLevel)} title={title}>
      {fitLevelLabel(fitLevel)}
      {scoreLabel}
    </span>
  );
}
