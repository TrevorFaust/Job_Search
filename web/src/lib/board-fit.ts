import { analyzeKeywords } from './resume-keywords';
import {
  normalizeFitScore,
  type FitLevel,
} from './fit-level';

const TITLE_STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'at', 'with',
  'remote', 'hybrid', 'onsite', 'on', 'site', 'full', 'time', 'part', 'contract',
  'temporary', 'permanent', 'i', 'ii', 'iii', 'iv', 'sr', 'jr',
]);

/** Alone these shouldn't salvage a near-zero skill match (e.g. "engineer" on an SWE role). */
const WEAK_TITLE_TOKENS = new Set([
  'engineer', 'engineering', 'manager', 'analyst', 'specialist', 'associate',
  'coordinator', 'consultant', 'officer', 'lead', 'head', 'director', 'product',
  'design', 'data', 'digital', 'senior', 'junior',
]);

type SeniorityBand = { pattern: RegExp; level: number };

/**
 * Higher = more senior. Caps are role-aware (manager OK, head stretch, director+ out).
 */
const SENIORITY: SeniorityBand[] = [
  { pattern: /\b(ceo|cto|cfo|coo|chief\s+\w+\s+officer)\b/i, level: 5 },
  { pattern: /\b(vp|vice[\s-]?president|svp|evp)\b/i, level: 4 },
  { pattern: /\bdirector\b/i, level: 3 },
  { pattern: /\bhead\s+of\b/i, level: 2 },
  {
    pattern:
      /\b(?:engineering\s+manager|product\s+manager|program\s+manager|project\s+manager|people\s+manager|hiring\s+manager|\w+\s+manager|manager)\b/i,
    level: 2,
  },
  { pattern: /\b(principal|staff\s+\w+|tech\s+lead|team\s+lead)\b/i, level: 1 },
  { pattern: /\b(senior|sr\.?)\b/i, level: 1 },
  { pattern: /\b(junior|jr\.?|intern|entry[\s-]?level|associate|assistant|representative|analyst)\b/i, level: 0 },
];

type RoleKind = 'c_level' | 'vp' | 'director' | 'head' | 'manager' | 'ic';

function roleKindFromTitle(title: string): RoleKind {
  if (/\b(ceo|cto|cfo|coo|chief\s+\w+\s+officer)\b/i.test(title)) return 'c_level';
  if (/\b(vp|vice[\s-]?president|svp|evp)\b/i.test(title)) return 'vp';
  if (/\bdirector\b/i.test(title)) return 'director';
  if (/\bhead\s+of\b/i.test(title)) return 'head';
  if (/\bmanager\b/i.test(title)) return 'manager';
  return 'ic';
}

const EXEC_LEADERSHIP =
  /\b(executive|c-suite|org(?:anizational)?\s+leadership|lead(?:ing)?\s+(?:the\s+)?(?:product|design|engineering)?\s*organizations?|succession\s+planning|p&l|profit\s+and\s+loss|board\s+(?:reporting|of\s+directors)|high-performing\s+(?:product|design|engineering)?\s*(?:team|organization)|matrixed\s+(?:executive|environment)|senior\s+leadership)\b/i;

export type BoardFitEstimate = {
  fit_level: FitLevel;
  fit_score: number;
  fit_estimated: true;
};

function seniorityLevel(text: string): number | null {
  for (const band of SENIORITY) {
    if (band.pattern.test(text)) return band.level;
  }
  return null;
}

/** Max seniority mentioned in resume titles / experience lines only (not whole JD fluff). */
function resumeSeniorityLevel(resume: string): number {
  // Prefer looking at early sections / title-like lines to avoid inflated hits from Q&A.
  const head = resume.slice(0, 8000);
  let max = 0;
  let found = false;
  for (const band of SENIORITY) {
    if (band.pattern.test(head)) {
      found = true;
      max = Math.max(max, band.level);
    }
  }
  // IC default when no seniority markers — Channel Rep / Analyst / Engineer.
  return found ? max : 0;
}

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s/-]/g, ' ')
    .split(/[\s/-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !TITLE_STOP.has(t));
}

function titleOverlapRatio(jobTitle: string, resumeText: string): number {
  const tokens = titleTokens(jobTitle);
  if (!tokens.length) return 0.45;
  const resume = resumeText.toLowerCase();
  const hits = tokens.filter((t) => new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(resume)).length;
  return hits / tokens.length;
}

function distinctiveTitleOverlap(jobTitle: string, resumeText: string): number {
  const tokens = titleTokens(jobTitle).filter((t) => !WEAK_TITLE_TOKENS.has(t));
  if (!tokens.length) return 0;
  const resume = resumeText.toLowerCase();
  const hits = tokens.filter((t) => new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(resume)).length;
  return hits / tokens.length;
}

function escapeRe(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Pull the highest "N+ years" / "N years of experience" requirement from the JD. */
export function requiredYearsFromJob(text: string): number | null {
  let max: number | null = null;
  const patterns = [
    /(\d+)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|product|leadership|professional)/gi,
    /(?:minimum|at\s+least|requires?)\s+(\d+)\s*\+?\s*(?:years?|yrs?)/gi,
    /(\d+)\s*\+\s*(?:years?|yrs?)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const n = Number(match[1]);
      if (!Number.isFinite(n) || n < 1 || n > 50) continue;
      max = max == null ? n : Math.max(max, n);
    }
  }
  return max;
}

/** Rough years of experience from date ranges on the resume (earliest start → now). */
export function estimateResumeYears(resume: string): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based

  const starts: { y: number; m: number }[] = [];

  const rangePatterns = [
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\s+(\d{4})\s*[–—\-to]+\s*(Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})/gi,
    /\b(20\d{2})\s*[–—\-]\s*(Present|Current|20\d{2})\b/gi,
  ];

  const monthIndex = (label: string) => {
    const key = label.slice(0, 3).toLowerCase();
    const map: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    return map[key] ?? 0;
  };

  for (const pattern of rangePatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(resume)) !== null) {
      if (/^\d{4}$/.test(match[1])) {
        starts.push({ y: Number(match[1]), m: 0 });
      } else {
        starts.push({ y: Number(match[2]), m: monthIndex(match[1]) });
      }
    }
  }

  // Graduation year as a fallback floor
  const grad = resume.match(/\b(20[0-2]\d)\b(?:[^\n]{0,40}(?:University|B\.?S\.?|Bachelor|graduat))/i)
    ?? resume.match(/(?:University|B\.?S\.?|Bachelor)[^\n]{0,60}\b(20[0-2]\d)\b/i);
  if (grad) {
    const gy = Number(grad[1]);
    if (gy >= 2000 && gy <= year) starts.push({ y: gy, m: 5 });
  }

  if (!starts.length) return 4; // conservative default for mid-career IC without parsed dates

  const earliest = starts.reduce((a, b) => (a.y < b.y || (a.y === b.y && a.m < b.m) ? a : b));
  const years = year - earliest.y + (month - earliest.m) / 12;
  return Math.max(0, Math.min(40, Math.round(years * 10) / 10));
}

function keywordMatchStrength(description: string, resume: string): number {
  const keywords = description
    ? analyzeKeywords(description, resume)
    : { matched: [] as string[], partial: [] as string[], missing: [] as string[] };

  const matched = keywords.matched.length;
  const partial = keywords.partial.length;
  const missing = keywords.missing.length;
  const denom = matched + partial + missing * 0.35;
  if (denom <= 0) return 0.3;

  const raw = (matched + 0.55 * partial) / denom;
  return Math.min(1, Math.pow(raw, 0.78) * 1.1);
}

function fitLevelFromScore(score: number): FitLevel {
  if (score >= 7.5) return 'strong';
  if (score >= 5.5) return 'moderate';
  if (score >= 3.5) return 'stretch';
  return 'long_shot';
}

/**
 * Title-based ceiling for an IC / early-career profile.
 * Manager can still score well; head-of is a stretch; director+ is out of range.
 */
function roleKindScoreCap(kind: RoleKind, resumeLevel: number): number | null {
  if (resumeLevel >= 3) return null; // already operating at director+
  if (resumeLevel >= 2) {
    // Already manager/head-shaped on resume
    if (kind === 'c_level' || kind === 'vp') return 3.0;
    if (kind === 'director') return 5.0;
    return null;
  }
  switch (kind) {
    case 'c_level':
    case 'vp':
      return 2.0;
    case 'director':
      return 3.5;
    case 'head':
      return 5.5; // stretch — more plausible at smaller companies
    case 'manager':
      return 7.5; // potentially okay if skills align
    default:
      return null;
  }
}

/** Absolute ceiling from numeric seniority gap (backup when title kind is unclear). */
function seniorityScoreCap(jobLevel: number | null, resumeLevel: number): number | null {
  if (jobLevel == null) return null;
  const gap = jobLevel - resumeLevel;
  if (gap >= 4) return 2.0;
  if (gap === 3) return 3.5;
  if (gap === 2) return 7.0; // manager / head-of from IC
  if (gap === 1) return 8.5;
  return null;
}

/**
 * Years shortfall hard-cap. Out-of-range kicks in around 8–10 years short;
 * smaller gaps stay soft so a 5-yr profile can still chase 8–10 yr IC roles.
 */
function yearsScoreCap(required: number | null, have: number): number | null {
  if (required == null) return null;
  const gap = required - have;
  if (gap >= 10) return 2.5;
  if (gap >= 8) return 3.5;
  if (gap >= 6) return 6.0;
  if (gap >= 4) return 7.5;
  if (gap >= 2) return 9.0;
  return null;
}

/**
 * Fast resume↔job fit estimate for the board (no LLM).
 *
 * Signals used:
 * 1. Keyword overlap (skills / domain terms in JD vs your full experience corpus)
 * 2. Title token overlap (distinctive words in the job title)
 * 3. Seniority gap (VP/Director vs IC) — hard-capped
 * 4. Years-required vs estimated years on resume — hard-capped
 * 5. Executive-leadership language when you don't have org-leadership signals
 */
export function estimateBoardFit(
  job: { title: string; description?: string | null },
  resumeText: string
): BoardFitEstimate {
  const resume = resumeText.trim();
  const description = (job.description ?? '').trim();
  const haystack = `${job.title}\n${description}`;

  const matchStrength = keywordMatchStrength(
    description || `${job.title}\n${job.title}`,
    resume
  );
  const titleRatio = titleOverlapRatio(job.title, resume);
  const distinctiveTitle = distinctiveTitleOverlap(job.title, resume);

  const roleKind = roleKindFromTitle(job.title);
  const roleKindLevel: Record<RoleKind, number> = {
    c_level: 5,
    vp: 4,
    director: 3,
    head: 2,
    manager: 2,
    ic: 0,
  };
  // Title-first — don't let JD phrases like "hiring manager" inflate seniority.
  const jobSeniority = seniorityLevel(job.title) ?? (roleKind !== 'ic' ? roleKindLevel[roleKind] : null);
  const resumeLevel = resumeSeniorityLevel(resume);
  const seniorityGap =
    jobSeniority != null ? Math.max(0, jobSeniority - resumeLevel) : 0;

  const requiredYears = requiredYearsFromJob(haystack);
  const resumeYears = estimateResumeYears(resume);
  const yearsGap =
    requiredYears != null ? Math.max(0, requiredYears - resumeYears) : 0;

  const execJob =
    EXEC_LEADERSHIP.test(haystack) ||
    roleKind === 'c_level' ||
    roleKind === 'vp' ||
    roleKind === 'director';
  const execResume = EXEC_LEADERSHIP.test(resume.slice(0, 8000)) || resumeLevel >= 3;

  let seniorityPenalty = 0;
  if (roleKind === 'c_level' || roleKind === 'vp') seniorityPenalty = 4.5;
  else if (roleKind === 'director') seniorityPenalty = 3.2;
  else if (roleKind === 'head') seniorityPenalty = 1.4;
  else if (roleKind === 'manager') seniorityPenalty = 0.5;
  else if (seniorityGap >= 3) seniorityPenalty = 4.0;
  else if (seniorityGap === 2) seniorityPenalty = 1.2;
  else if (seniorityGap === 1) seniorityPenalty = 0.5;

  // Soft until ~8 years short; hard out-of-range starts there.
  let yearsPenalty = 0;
  if (yearsGap >= 10) yearsPenalty = 3.5;
  else if (yearsGap >= 8) yearsPenalty = 2.5;
  else if (yearsGap >= 6) yearsPenalty = 1.2;
  else if (yearsGap >= 4) yearsPenalty = 0.6;
  else if (yearsGap >= 2) yearsPenalty = 0.2;

  let execPenalty = 0;
  if (execJob && !execResume) {
    if (roleKind === 'c_level' || roleKind === 'vp') execPenalty = 1.5;
    else if (roleKind === 'director') execPenalty = 1.0;
    else execPenalty = 0.4;
  }

  let score =
    2.8 +
    matchStrength * 4.2 +
    titleRatio * 2.4 -
    seniorityPenalty -
    yearsPenalty -
    execPenalty;

  if (!description || description.length < 120) {
    score = 2.4 + titleRatio * 4.2 + matchStrength * 2.2 - seniorityPenalty - yearsPenalty - execPenalty;
  }

  const managerStretchOk = roleKind === 'manager' && yearsGap <= 4;
  const headStretchOk = roleKind === 'head' && yearsGap <= 5;

  // Only boost toward 9–10 when seniority AND years are in band.
  const eligibleForTop =
    seniorityGap <= 0 &&
    yearsGap <= 1 &&
    roleKind === 'ic' &&
    (!execJob || execResume);

  if (eligibleForTop) {
    if (matchStrength >= 0.5 && titleRatio >= 0.45) score += 0.9;
    if (matchStrength >= 0.65 && titleRatio >= 0.6) score += 0.8;
    if (matchStrength >= 0.75 && titleRatio >= 0.75) score += 0.5;
  } else if ((seniorityGap <= 1 || managerStretchOk) && yearsGap <= 4) {
    if (matchStrength >= 0.55 && distinctiveTitle >= 0.3) score += 0.5;
  } else if (headStretchOk && matchStrength >= 0.6) {
    score += 0.35;
  }

  // Related IC / manager-track roles with solid skills shouldn't sit in low 4s
  if (
    (seniorityGap <= 1 || managerStretchOk) &&
    yearsGap <= 5 &&
    score >= 4.0 &&
    score < 6.5 &&
    (matchStrength >= 0.4 || distinctiveTitle >= 0.35)
  ) {
    score += 0.7;
  }

  if (matchStrength < 0.3 && distinctiveTitle < 0.25) {
    score = Math.min(score, 3.0);
  }

  if (resumeLevel - (jobSeniority ?? resumeLevel) >= 2 && distinctiveTitle >= 0.35) {
    score += 0.5;
  }

  // Hard ceilings — keywords cannot push past these.
  const caps = [
    roleKindScoreCap(roleKind, resumeLevel),
    seniorityScoreCap(jobSeniority, resumeLevel),
    yearsScoreCap(requiredYears, resumeYears),
  ].filter((c): c is number => c != null);
  if (caps.length) score = Math.min(score, Math.min(...caps));

  // VP/C-level stays a long shot for IC profiles (domain keywords like NFL/product can't save it).
  if ((roleKind === 'c_level' || roleKind === 'vp') && resumeLevel < 3) {
    score = Math.min(score, 2.5);
  }
  // Director is likely out of range unless already operating at that level.
  if (roleKind === 'director' && resumeLevel < 3) {
    score = Math.min(score, 3.5);
  }

  const fit_score = normalizeFitScore(score) ?? 0;
  return {
    fit_level: fitLevelFromScore(fit_score),
    fit_score,
    fit_estimated: true,
  };
}
