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
  return /\b(per\s+)?hour|\/\s*hr\b|hourly\b/i.test(text);
}

function isAnnual(text) {
  return /\b(per\s+)?year|\/\s*yr\b|annual|yearly\b/i.test(text);
}

/**
 * Parse a salary string into annual min/max integers.
 * Hourly rates use: rate × 40 × 4 × 12 (1920 hours/year).
 * e.g. "$15-20/hr" → { min: 28800, max: 38400, period: 'hourly' }
 */
export function parseSalary(raw = '') {
  if (!raw?.trim()) return null;

  const text = raw.trim();
  const numbers = [...text.matchAll(/\$?\s*([\d,]+(?:\.\d+)?)\s*k?/gi)].map((m) =>
    parseMoneyToken(m[1])
  ).filter((n) => n != null && n > 0);

  if (!numbers.length) return null;

  const hourly = isHourly(text) && !isAnnual(text);
  const annual = isAnnual(text) && !isHourly(text);

  let min = numbers[0];
  let max = numbers.length > 1 ? numbers[1] : numbers[0];
  if (min > max) [min, max] = [max, min];

  if (hourly) {
    min = Math.round(min * HOURS_PER_YEAR);
    max = Math.round(max * HOURS_PER_YEAR);
    return { min, max, period: 'hourly', raw: text };
  }

  // Large bare numbers without period are treated as annual (e.g. Dice "100,000 - 135,000")
  if (!annual && max < 1000) {
    min = Math.round(min * HOURS_PER_YEAR);
    max = Math.round(max * HOURS_PER_YEAR);
    return { min, max, period: 'hourly', raw: text };
  }

  return { min, max, period: 'annual', raw: text };
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
