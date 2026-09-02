import { extractSalaryFromText, salaryFromJobPosting } from '../../lib/salary.js';
import { isJunkDescription, stripHtml, truncateDescription, USER_AGENT } from './utils.js';

const FETCH_TIMEOUT_MS = 12000;

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return blocks;
}

function flattenLd(node, out = []) {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const item of node) flattenLd(item, out);
    return out;
  }
  if (typeof node === 'object') {
    out.push(node);
    flattenLd(node['@graph'], out);
  }
  return out;
}

function isJobPosting(node) {
  const type = node?.['@type'];
  return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
}

function jobPostingFromHtml(html = '') {
  for (const block of jsonLdBlocks(html)) {
    const posting = flattenLd(block).find(isJobPosting);
    if (posting) return posting;
  }
  return null;
}

function teamworkDescription(html = '') {
  const teamworkBody = html.match(
    /class="[^"]*opportunity-preview__body[^"]*"[\s\S]*?>([\s\S]*?)<div class="opportunity-preview__apply"/i
  );
  if (teamworkBody?.[1]) {
    const text = stripHtml(teamworkBody[1]);
    if (text.length > 80) return text;
  }
  return '';
}

/** Plain-text job description from JSON-LD JobPosting markup. */
export function extractDescriptionFromHtml(html = '') {
  const posting = jobPostingFromHtml(html);
  const desc = posting?.description;
  if (typeof desc === 'string') {
    const text = stripHtml(desc);
    if (text.length > 80) return text;
  }
  return teamworkDescription(html);
}

/** Pay from JSON-LD or posting HTML — never the full page (related jobs pollute that). */
export function extractSalaryFromHtml(html = '', description = '') {
  const posting = jobPostingFromHtml(html);
  const fromLd = salaryFromJobPosting(posting);
  if (fromLd) return fromLd.raw;

  const payWidgets = [
    ...html.matchAll(
      /<(?:div|span)[^>]*(?:class="[^"]*pay-range[^"]*"|data-automation-id="[^"]*salary[^"]*")[^>]*>[\s\S]*?<\/(?:div|span)>/gi
    ),
  ]
    .map((m) => m[0])
    .join('\n');
  const fromWidget = extractSalaryFromText(payWidgets);
  if (fromWidget) return fromWidget.raw;

  const fromDesc = extractSalaryFromText(description || extractDescriptionFromHtml(html));
  return fromDesc?.raw ?? null;
}

/** Convert a public Workday job URL into the CXS job-detail API URL. */
export function workdayJobApiUrl(jobUrl) {
  try {
    const u = new URL(jobUrl);
    if (!u.hostname.includes('myworkdayjobs.com')) return null;
    const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    let i = 0;
    if (/^[a-z]{2}-[A-Z]{2}$/.test(parts[0])) i = 1;
    const site = parts[i];
    const rest = parts.slice(i + 1);
    if (!site || rest[0] !== 'job' || rest.length < 2) return null;
    const tenant = u.hostname.split('.')[0];
    return `${u.protocol}//${u.hostname}/wday/cxs/${tenant}/${site}/${rest.join('/')}`;
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  return res.text();
}

async function fetchWorkdayPosting(jobUrl) {
  const apiUrl = workdayJobApiUrl(jobUrl);
  if (!apiUrl) return { description: '', salary: null };
  try {
    const data = await fetchJson(apiUrl);
    const info = data?.jobPostingInfo ?? {};
    const description = stripHtml(info.jobDescription ?? '');
    const salaryHint = [info.compensation, info.payRange, info.salary]
      .map((value) => (typeof value === 'string' ? value : value ? JSON.stringify(value) : ''))
      .filter(Boolean)
      .join(' ');
    const salary =
      extractSalaryFromText(salaryHint)?.raw ?? extractSalaryFromText(description)?.raw ?? null;
    return { description, salary };
  } catch {
    return { description: '', salary: null };
  }
}

/** Pull a full posting from the original listing URL (JSON-LD, Workday API, or known markup). */
export async function fetchJobPostingFromUrl(url) {
  if (!url) return { description: '', salary: null };
  try {
    if (url.includes('myworkdayjobs.com')) {
      const fromApi = await fetchWorkdayPosting(url);
      if (fromApi.description.length > 80) {
        return {
          description: truncateDescription(fromApi.description),
          salary: fromApi.salary,
        };
      }
    }

    const html = await fetchHtml(url);
    const description = extractDescriptionFromHtml(html);
    const salary = extractSalaryFromHtml(html, description);
    return {
      description: description.length > 80 ? truncateDescription(description) : '',
      salary,
    };
  } catch {
    return { description: '', salary: null };
  }
}

export async function fetchJobDescriptionFromUrl(url) {
  const posting = await fetchJobPostingFromUrl(url);
  return posting.description;
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/**
 * Fill empty/short descriptions by fetching each job's public page.
 * Mutates jobs in place. Returns the same array.
 */
export async function enrichDescriptionsFromPages(
  jobs,
  { minLength = 120, maxFetch, concurrency = 5 } = {}
) {
  const pending = jobs.filter(
    (job) => job.url && (isJunkDescription(job, minLength) || !job.salary)
  );
  const limit = maxFetch ?? pending.length;
  const batch = pending.slice(0, limit);
  if (!batch.length) return jobs;

  await mapPool(batch, concurrency, async (job) => {
    const posting = await fetchJobPostingFromUrl(job.url);
    if (posting.description.length > (job.description?.length ?? 0)) {
      job.description = posting.description;
    }
    if (posting.salary && !job.salary) job.salary = posting.salary;
  });

  return jobs;
}
