/** Client-safe ATS audit types — keep free of pdfkit / Anthropic imports. */

export type AtsFinding = {
  id: string;
  area: string;
  severity: 'high' | 'medium' | 'low';
  issue: string;
  fix: string;
};

export type AtsSoftBlocker = {
  id: string;
  requirement: string;
  reason: string;
  honest_approach: string;
};

export type AtsQuestion = {
  id: string;
  question: string;
  context: string;
  related_requirement: string;
  suggested_answers?: string[];
};

export type AtsAnswer = {
  question_id: string;
  answer: string;
  question?: string;
  related_requirement?: string;
};

export type AtsRebuttalKind = 'finding' | 'blocker';

export type AtsRebuttal = {
  target_id: string;
  kind: AtsRebuttalKind;
  rebuttal: string;
};

/** @deprecated alias — prefer AtsRebuttal */
export type AtsFindingRebuttal = AtsRebuttal;

export type AtsAudit = {
  /** Current screenability after any auto-patches (0–100). Evidence/context weighted over raw keywords. */
  score: number;
  score_before_patches?: number;
  /** Honest ceiling without inventing experience (0–100). */
  ceiling: number;
  ceiling_reasons: string[];
  /** What it would take to reach ~90–95%, or the best honest path if that band is unreachable. */
  path_to_target: string;
  evidence_notes: string;
  findings: AtsFinding[];
  soft_blockers: AtsSoftBlocker[];
  /** Targeted rewrite notes already applied without asking the candidate. */
  auto_patches_applied: string[];
  /** Short chip-friendly questions (0–5) that could raise the score further. */
  questions: AtsQuestion[];
  answers?: AtsAnswer[];
  /** Candidate rebuttals to findings / soft blockers from the last apply pass. */
  rebuttals?: AtsRebuttal[];
  /** Score before the last Apply ATS improvements pass (for UI delta). */
  score_before_apply?: number;
  /** When true, hide rebuttal/question UI — apply pass already handled or dismissed. */
  follow_ups_closed?: boolean;
  audited_at: string;
};

export function isAtsAudit(value: unknown): value is AtsAudit {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.score === 'number' && typeof v.ceiling === 'number' && typeof v.path_to_target === 'string';
}

export function findingKey(f: Pick<AtsFinding, 'id' | 'issue'>): string {
  return f.id || f.issue;
}

export function blockerKey(b: Pick<AtsSoftBlocker, 'id' | 'requirement'>): string {
  return b.id || b.requirement;
}

export function rebuttalStateKey(kind: AtsRebuttalKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * After Apply: close the interactive follow-up loop.
 * Residual guidance stays in evidence_notes / path_to_target / ceiling_reasons.
 */
export function pruneAcceptedAtsFollowUps(prior: AtsAudit, next: AtsAudit): AtsAudit {
  return {
    ...next,
    findings: [],
    soft_blockers: [],
    questions: [],
    answers: prior.answers ?? next.answers,
    rebuttals: prior.rebuttals ?? next.rebuttals,
    score_before_apply: prior.score,
    follow_ups_closed: true,
  };
}

export function hasAtsFollowUps(audit: AtsAudit): boolean {
  if (audit.follow_ups_closed) return false;
  return audit.findings.length > 0 || audit.soft_blockers.length > 0 || audit.questions.length > 0;
}

/** Close follow-ups on an existing audit without regenerating (stuck sessions). */
export function closeAtsFollowUps(audit: AtsAudit): AtsAudit {
  return {
    ...audit,
    findings: [],
    soft_blockers: [],
    questions: [],
    score_before_apply: audit.score_before_apply ?? audit.score,
    follow_ups_closed: true,
  };
}

/** True when the candidate already completed an ATS Q&A / apply round on this session. */
export function atsFollowUpsAlreadyHandled(audit: AtsAudit | null | undefined): boolean {
  if (!audit || !isAtsAudit(audit)) return false;
  if (audit.follow_ups_closed) return true;
  if (audit.score_before_apply != null) return true;
  if ((audit.rebuttals?.length ?? 0) > 0) return true;
  if ((audit.answers ?? []).some((a) => a.answer.trim())) return true;
  return false;
}

/**
 * After a rescore/refresh/revise: keep the new score/patches, but do not re-open
 * questions/findings/blockers the candidate already answered or closed.
 */
export function preserveClosedAtsFollowUps(prior: AtsAudit | null | undefined, next: AtsAudit): AtsAudit {
  if (!prior || !atsFollowUpsAlreadyHandled(prior)) return next;
  return {
    ...next,
    findings: [],
    soft_blockers: [],
    questions: [],
    answers: prior.answers ?? next.answers,
    rebuttals: prior.rebuttals ?? next.rebuttals,
    score_before_apply: prior.score_before_apply ?? prior.score,
    follow_ups_closed: true,
  };
}
