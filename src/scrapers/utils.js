const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export { USER_AGENT };

export async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

/** Max chars stored for job descriptions (full posting text for the web app). */
export const DESCRIPTION_MAX = 15000;

export function stripHtml(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<h[1-6][^>]*>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns the list of keywords found in the job's title/company/description.
 * Word-boundary matching so "sports" doesn't match "esports".
 */
export function matchKeywords(job, keywords) {
  const haystack = `${job.title} ${job.company ?? ''} ${job.description ?? ''}`.toLowerCase();
  return keywords.filter((kw) =>
    new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`).test(haystack)
  );
}

export function isExcluded(job, excludeKeywords) {
  if (!excludeKeywords?.length) return false;
  const title = job.title.toLowerCase();
  return excludeKeywords.some((kw) =>
    new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`).test(title)
  );
}

export function isTooOld(job, maxJobAgeDays) {
  if (!job.postedAt) return false; // keep jobs with unknown dates
  const ageMs = Date.now() - new Date(job.postedAt).getTime();
  return ageMs > maxJobAgeDays * 24 * 60 * 60 * 1000;
}

/** Trim text; use DESCRIPTION_MAX for full job postings, shorter max for previews. */
export function truncate(text = '', max = 500) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function truncateDescription(text = '') {
  return truncate(text, DESCRIPTION_MAX);
}

/** When the same job appears from multiple scrape paths, keep the richer record. */
export function mergeJobRecords(prev, next) {
  const prevDesc = prev.description ?? '';
  const nextDesc = next.description ?? '';
  const description = nextDesc.length > prevDesc.length ? nextDesc : prevDesc;

  return {
    ...prev,
    ...next,
    description,
    company: next.company || prev.company,
    location: next.location || prev.location,
    salary: next.salary || prev.salary,
    postedAt: next.postedAt || prev.postedAt,
  };
}
