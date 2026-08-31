/** Full-time hours: 40/week × 4 weeks/month × 12 months/year */
export const HOURS_PER_YEAR = 40 * 4 * 12; // 1920

function parseMoneyToken(raw) {
  const cleaned = raw.replace(/[$,\s]/g, '').toLowerCase();
  if (!cleaned) return null;
  const k = cleaned.match(/^(\d+(?:\.\d+)?)k$/);
  if (k) return Math.round(Number(k[1]) * 1000);
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function isHourly(text) {
  return /\b(per\s+)?hours?\b|\/\s*hrs?\b|hourly\b|p\/h\b|an\s+hour\b/i.test(text);
}

function isMonthly(text) {
  return /\b(per\s+)?months?\b|\/\s*mo(?:nth)?s?\b|a\s+month\b|monthly\b/i.test(text);
}

function isWeekly(text) {
  return /\b(per\s+)?weeks?\b|\/\s*wks?\b|a\s+week\b|weekly\b/i.test(text);
}

function isAnnual(text) {
  return /\b(per\s+)?years?\b|\/\s*yrs?\b|annual|yearly|a\s+year\b/i.test(text);
}

function flattenPayWidgets(raw) {
  return raw.replace(
    /<(?:div|span)[^>]*class="[^"]*pay-range[^"]*"[^>]*>[\s\S]*?<\/(?:div|span)>/gi,
    (block) => {
      const nums = [...block.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => m[1]);
      if (nums.length >= 2) return ` Salary $${nums[0]} - $${nums[1]} USD `;
      if (nums.length === 1) return ` Salary $${nums[0]} USD `;
      return ' ';
    }
  );
}

function normalizeSalaryText(raw) {
  return flattenPayWidgets(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;|&ndash;|&#8212;|&#8211;/gi, '-')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a salary string into annual min/max integers.
 * Hourly rates use: rate × 40 × 4 × 12 (1920 hours/year).
 * e.g. "$15-20/hr" → { min: 28800, max: 38400, period: 'hourly' }
 */
export function parseSalary(raw = '') {
  if (!raw?.trim()) return null;
  if (/depends on experience|\bdoe\b|competitive|not disclosed/i.test(raw) && !/\$[\d,]/.test(raw)) {
    return null;
  }

  const text = normalizeSalaryText(raw);
  const numbers = [...text.matchAll(/\$?\s*([\d,]+(?:\.\d+)?\s*k?)/gi)]
    .map((m) => parseMoneyToken(m[1]))
    .filter((n) => n != null && n > 0);

  if (!numbers.length) return null;

  const hourly = isHourly(text) && !isAnnual(text) && !isMonthly(text);
  const monthly = isMonthly(text) && !isHourly(text) && !isAnnual(text);
  const weekly = isWeekly(text) && !isHourly(text) && !isAnnual(text) && !isMonthly(text);
  const annual = isAnnual(text) && !isHourly(text) && !isMonthly(text);

  let min = numbers[0];
  let max = numbers.length > 1 ? numbers[1] : numbers[0];
  if (min > max) [min, max] = [max, min];

  if (hourly) {
    min = Math.round(min * HOURS_PER_YEAR);
    max = Math.round(max * HOURS_PER_YEAR);
    return { min, max, period: 'hourly', raw: text };
  }

  if (weekly) {
    return { min: Math.round(min * 52), max: Math.round(max * 52), period: 'annual', raw: text };
  }

  if (monthly) {
    return { min: Math.round(min * 12), max: Math.round(max * 12), period: 'annual', raw: text };
  }

  // Large bare numbers without period are treated as annual (e.g. Dice "100,000 - 135,000")
  if (!annual && max < 1000) {
    min = Math.round(min * HOURS_PER_YEAR);
    max = Math.round(max * HOURS_PER_YEAR);
    return { min, max, period: 'hourly', raw: text };
  }

  return { min, max, period: 'annual', raw: text };
}

function isPlausible(parsed) {
  if (parsed.period === 'hourly') {
    const rateMin = parsed.min / HOURS_PER_YEAR;
    const rateMax = parsed.max / HOURS_PER_YEAR;
    return rateMin >= 8 && rateMax <= 500 && rateMax >= rateMin;
  }
  return parsed.min >= 15000 && parsed.max <= 1_000_000 && parsed.max >= parsed.min;
}

const RANGE_RE =
  /(?:USD\s*)?\$\s*([\d,]+(?:\.\d+)?)\s*(k)?(?:\s*(?:-|to)\s*(?:USD\s*)?\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?)?/gi;
const USD_BARE_RE =
  /\bUSD\s*([\d,]+(?:\.\d+)?)\s*(k)?(?:\s*(?:-|to)\s*([\d,]+(?:\.\d+)?)\s*(k)?)?/gi;
const PERIOD_SUFFIX_RE =
  /^\s*(?:USD)?\s*(?:\/\s*(?:hrs?|hours?|yrs?|years?|mo|mos|months?)|per\s+(?:hour|year|month|week)|hourly|annually|monthly|a year|an hour|a month|p\/h(?:r)?s?)?/i;
const SALARY_LABEL_RE = /(?:base\s+)?(?:salary|compensation|pay|wage|ote)(?:\s+range)?/i;
const NOT_PAY_RE = /\b(acv|arr|gmv|valuation|revenue|industry|equity|budget|billion|million|stipend)\b/i;

function looksLikeHourlyRates(min, max) {
  return min >= 8 && max <= 400 && max >= min && max < 1000;
}

/** Structured salary from JSON-LD JobPosting.baseSalary / estimatedSalary. */
export function salaryFromJobPosting(posting) {
  if (!posting || typeof posting !== 'object') return null;
  const comp = posting.baseSalary ?? posting.estimatedSalary;
  if (!comp || typeof comp !== 'object') return null;
  const value = comp.value && typeof comp.value === 'object' ? comp.value : comp;
  const minRaw = Number(value.minValue ?? value.value ?? comp.minValue);
  const maxRaw = Number(value.maxValue ?? value.minValue ?? value.value ?? comp.maxValue);
  if (!Number.isFinite(minRaw) && !Number.isFinite(maxRaw)) return null;

  let min = Number.isFinite(minRaw) ? minRaw : maxRaw;
  let max = Number.isFinite(maxRaw) ? maxRaw : minRaw;
  if (min > max) [min, max] = [max, min];

  const unit = String(value.unitText ?? comp.unitText ?? '').toUpperCase();
  let period = 'annual';
  if (/HOUR/.test(unit) || (!unit && looksLikeHourlyRates(min, max))) {
    min = Math.round(min * HOURS_PER_YEAR);
    max = Math.round(max * HOURS_PER_YEAR);
    period = 'hourly';
  } else if (/WEEK/.test(unit)) {
    min = Math.round(min * 52);
    max = Math.round(max * 52);
  } else if (/MONTH/.test(unit)) {
    min = Math.round(min * 12);
    max = Math.round(max * 12);
  } else if (/DAY/.test(unit)) {
    min = Math.round(min * 260);
    max = Math.round(max * 260);
  }

  const parsed = {
    min,
    max,
    period,
    raw: [minRaw, maxRaw].filter((n) => Number.isFinite(n)).join(' - ') + (unit ? ` ${unit}` : ''),
  };
  return isPlausible(parsed) ? parsed : null;
}

/** Pull a salary out of a job description when the dedicated salary field is empty. */
export function extractSalaryFromText(raw = '') {
  if (!raw?.trim()) return null;
  const text = normalizeSalaryText(raw);
  const candidates = [];

  const pushMatch = (match) => {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 36);
    if (/^\s*[BTbtMm](?:illion|\+|B|T)?/.test(after) && !PERIOD_SUFFIX_RE.test(after)) {
      return;
    }
    if (/^[BTbtMm+]/.test(after.trim())) return;
    if (NOT_PAY_RE.test(after) || NOT_PAY_RE.test(text.slice(Math.max(0, match.index - 24), match.index))) {
      return;
    }

    const suffix = after.match(PERIOD_SUFFIX_RE)?.[0] ?? '';
    const snippet = `${match[0]}${suffix}`.trim();
    const parsed = parseSalary(snippet);
    if (!parsed || !isPlausible(parsed)) return;

    const before = text.slice(Math.max(0, match.index - 100), match.index);
    const labeled = SALARY_LABEL_RE.test(before);
    const hasPeriod = isHourly(snippet) || isAnnual(snippet) || isMonthly(snippet) || isWeekly(snippet);
    const hourlyUnlabeled =
      parsed.period === 'hourly' &&
      !hasPeriod &&
      !labeled &&
      !/USD/i.test(snippet) &&
      parsed.min === parsed.max;
    if (hourlyUnlabeled) return;

    const score =
      (labeled ? 8 : 0) +
      (hasPeriod ? 4 : 0) +
      (parsed.min !== parsed.max ? 3 : 0) +
      (parsed.min >= 20000 ? 2 : 0);
    candidates.push({ parsed: { ...parsed, raw: snippet }, score });
  };

  let match;
  RANGE_RE.lastIndex = 0;
  while ((match = RANGE_RE.exec(text))) pushMatch(match);
  USD_BARE_RE.lastIndex = 0;
  while ((match = USD_BARE_RE.exec(text))) {
    if (text.slice(Math.max(0, match.index - 2), match.index).includes('$')) continue;
    pushMatch(match);
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || b.parsed.min - a.parsed.min);
  return candidates[0].parsed;
}

export function withExtractedSalary(job) {
  if (job.salary_min_annual != null || job.salary_max_annual != null) return job;
  const parsed =
    parseSalary(job.salary ?? '') ??
    extractSalaryFromText(`${job.salary ?? ''}\n${job.description ?? ''}`);
  if (!parsed) return job;
  return {
    ...job,
    salary: job.salary?.trim() && !/depends|doe|competitive/i.test(job.salary) ? job.salary : parsed.raw,
    salary_min_annual: parsed.min,
    salary_max_annual: parsed.max,
  };
}

export function formatAnnualSalary(min, max) {
  if (min == null && max == null) return null;
  const fmt = (n) => `$${n.toLocaleString()}`;
  if (min != null && max != null && min !== max) return `${fmt(min)} – ${fmt(max)} /yr`;
  const val = max ?? min;
  return `${fmt(val)} /yr`;
}

export function passesSalaryFilter(job, profile) {
  const { min_salary_annual: floor, include_unknown_salary: allowUnknown } = profile;
  if (!floor) return true;

  const hasSalary = job.salary_min_annual != null || job.salary_max_annual != null;
  if (!hasSalary) return allowUnknown !== false;

  const jobMax = job.salary_max_annual ?? job.salary_min_annual;
  return jobMax >= floor;
}
