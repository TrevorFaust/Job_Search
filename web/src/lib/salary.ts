export const HOURS_PER_YEAR = 40 * 4 * 12;

function parseMoneyToken(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '').toLowerCase();
  if (!cleaned) return null;
  const k = cleaned.match(/^(\d+(?:\.\d+)?)k$/);
  if (k) return Math.round(Number(k[1]) * 1000);
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function isHourly(text: string) {
  return /\b(per\s+)?hour|\/\s*hr\b|hourly\b/i.test(text);
}

function isAnnual(text: string) {
  return /\b(per\s+)?year|\/\s*yr\b|annual|yearly\b/i.test(text);
}

export function parseSalary(raw = '') {
  if (!raw?.trim()) return null;
  const text = raw.trim();
  const numbers = [...text.matchAll(/\$?\s*([\d,]+(?:\.\d+)?)\s*k?/gi)]
    .map((m) => parseMoneyToken(m[1]))
    .filter((n): n is number => n != null && n > 0);
  if (!numbers.length) return null;

  const hourly = isHourly(text) && !isAnnual(text);
  const annual = isAnnual(text) && !isHourly(text);
  let min = numbers[0];
  let max = numbers.length > 1 ? numbers[1] : numbers[0];
  if (min > max) [min, max] = [max, min];

  if (hourly) {
    return { min: Math.round(min * HOURS_PER_YEAR), max: Math.round(max * HOURS_PER_YEAR), period: 'hourly' as const, raw: text };
  }
  if (!annual && max < 1000) {
    return { min: Math.round(min * HOURS_PER_YEAR), max: Math.round(max * HOURS_PER_YEAR), period: 'hourly' as const, raw: text };
  }
  return { min, max, period: 'annual' as const, raw: text };
}

export function formatAnnualSalary(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  const fmt = (n: number) => `$${n.toLocaleString()}`;
  if (min != null && max != null && min !== max) return `${fmt(min)} – ${fmt(max)} /yr`;
  return `${fmt(max ?? min!)} /yr`;
}
