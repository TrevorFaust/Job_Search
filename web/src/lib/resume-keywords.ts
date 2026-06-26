const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'you', 'your', 'we', 'our', 'they', 'their', 'this', 'that',
  'these', 'those', 'it', 'its', 'who', 'which', 'what', 'when', 'where', 'how', 'all',
  'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'about', 'above',
  'after', 'again', 'against', 'any', 'because', 'before', 'between', 'during', 'into',
  'through', 'under', 'until', 'while', 'work', 'working', 'role', 'position', 'job',
  'team', 'company', 'years', 'year', 'experience', 'required', 'preferred', 'ability',
  'including', 'etc', 'plus', 'well', 'also', 'using', 'use', 'used', 'within', 'across',
]);

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWord(haystack: string, term: string) {
  return new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(haystack);
}

function hasPartial(haystack: string, term: string) {
  const normalized = term.toLowerCase();
  return haystack.toLowerCase().includes(normalized);
}

/** Pull likely requirement phrases from a job description. */
export function extractJobTerms(description: string): string[] {
  const terms = new Set<string>();
  const text = description.replace(/\r/g, '');

  const patterns = [
    /(?:experience with|proficiency in|knowledge of|familiarity with|expertise in|skills in|background in)\s+([^.\n;]{3,80})/gi,
    /(?:required|must have|must possess)[:\s]+([^.\n]{3,120})/gi,
    /(?:preferred|nice to have|bonus)[:\s]+([^.\n]{3,120})/gi,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g,
    /\b([A-Z]{2,6})\b/g,
    /(?:^|\n)\s*[-•*]\s*([^\n]{4,120})/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1].trim().replace(/\s+/g, ' ');
      splitIntoTerms(raw).forEach((t) => terms.add(t));
    }
  }

  const words = text.toLowerCase().match(/\b[a-z0-9+#.]{3,30}\b/g) ?? [];
  for (const word of words) {
    if (!STOP_WORDS.has(word) && word.length >= 4) terms.add(word);
  }

  return [...terms]
    .filter((t) => t.length >= 2 && t.length <= 60)
    .sort((a, b) => b.length - a.length)
    .slice(0, 80);
}

function splitIntoTerms(phrase: string): string[] {
  return phrase
    .split(/[,;/|•]|(?:\s+and\s+)|(?:\s+or\s+)/i)
    .map((p) => p.trim().replace(/^[^a-z0-9]+|[^a-z0-9+#.]+$/gi, ''))
    .filter((p) => p.length >= 2);
}

export type KeywordAnalysis = {
  matched: string[];
  partial: string[];
  missing: string[];
};

/** Compare job terms against resume text without an LLM. */
export function analyzeKeywords(jobDescription: string, resumeText: string): KeywordAnalysis {
  const resume = resumeText.toLowerCase();
  const terms = extractJobTerms(jobDescription);
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];

  for (const term of terms) {
    if (hasWord(resume, term)) matched.push(term);
    else if (hasPartial(resume, term)) partial.push(term);
    else missing.push(term);
  }

  return { matched, partial, missing };
}
