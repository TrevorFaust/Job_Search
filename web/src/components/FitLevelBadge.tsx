import {
  fitLevelBadgeClass,
  fitLevelLabel,
  formatFitScore,
  type FitLevel,
} from '@/lib/fit-level';

type Props = {
  fitLevel: FitLevel;
  fitScore?: number;
  estimated?: boolean;
};

export function FitLevelBadge({ fitLevel, fitScore, estimated }: Props) {
  const scoreLabel =
    fitScore != null
      ? ` · ${estimated ? '~' : ''}${formatFitScore(fitScore)}/10`
      : '';
  const title =
    fitScore != null
      ? estimated
        ? `Estimated board fit: ${fitLevelLabel(fitLevel)} (~${formatFitScore(fitScore)}/10 from your experience corpus)`
        : `Resume fit: ${fitLevelLabel(fitLevel)} (${formatFitScore(fitScore)}/10 likelihood with tailored resume)`
      : estimated
        ? `Estimated board fit: ${fitLevelLabel(fitLevel)}`
        : `Resume fit: ${fitLevelLabel(fitLevel)}`;

  return (
    <span className={fitLevelBadgeClass(fitLevel)} title={title}>
      {fitLevelLabel(fitLevel)}
      {scoreLabel}
    </span>
  );
}
