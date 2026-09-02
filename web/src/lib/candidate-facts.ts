export type CandidateFact = {
  id: string;
  /** Distinctive phrases; a question matches when enough of these appear. */
  triggers: string[];
  minHits: number;
  answer: string;
};

/**
 * First-person notes for systems Trevor built (this repo and related projects).
 * Matched clarifying questions get this text prefilled so he can review instead of recalling internals.
 */
export const CANDIDATE_FACTS: CandidateFact[] = [
  {
    id: 'job-board-fit-scoring',
    triggers: [
      'job board',
      'scoring logic',
      'scoring mechanism',
      'fit scoring',
      'fit score',
      'rate fit',
      'rule-based',
      'rule based',
      'anyone other than you',
      'used by anyone',
    ],
    minHits: 2,
    answer:
      'Nobody else uses it; it is a personal Next.js job-hunt board. Listing scores are rule-based TypeScript, not an LLM prompt asking for a 1-10 rating. For jobs I have not tailored yet, fit is a 0-10 estimate from JD vs experience-corpus keyword overlap, title-token overlap, seniority gap (IC vs manager/director/VP), years-required vs resume dates, and hard caps so exec roles cannot be inflated by domain keywords. After I tailor a resume, that session\'s gap-analysis score replaces the estimate. Bands: 7.5+ strong, 5.5+ moderate, 3.5+ stretch, else long shot.',
  },
];

export type FactMatchable = {
  question: string;
  related_requirement?: string;
};

export function matchCandidateFact(item: FactMatchable): CandidateFact | undefined {
  const hay = `${item.question} ${item.related_requirement ?? ''}`.toLowerCase();
  let best: { fact: CandidateFact; hits: number } | undefined;

  for (const fact of CANDIDATE_FACTS) {
    let hits = 0;
    for (const trigger of fact.triggers) {
      if (hay.includes(trigger.toLowerCase())) hits += 1;
    }
    if (hits < fact.minHits) continue;
    if (!best || hits > best.hits) best = { fact, hits };
  }

  return best?.fact;
}

function isPlaceholderAnswer(text: string | undefined): boolean {
  const value = (text ?? '').trim().toLowerCase();
  if (!value) return true;
  return /^(n\/?a|skip+|no|not really|idk|i don'?t know\.?)$/.test(value);
}

export function withFactDrafts<T extends FactMatchable & { id: string }>(
  questions: T[],
  existing: Record<string, string>
): Record<string, string> {
  const next = { ...existing };
  for (const question of questions) {
    if (!isPlaceholderAnswer(next[question.id])) continue;
    const fact = matchCandidateFact(question);
    if (fact) next[question.id] = fact.answer;
  }
  return next;
}
