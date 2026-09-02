import { stripHtml } from './job-description';
import type { Job } from './queries';
import { extractSalaryFromText, salaryFromJobPosting, withExtractedSalary } from './salary';
import { getDb } from './supabase';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DESCRIPTION_MAX = 15000;
const FETCH_TIMEOUT_MS = 12000;
const MIN_DESCRIPTION_LENGTH = 120;

export function needsJobDescription(job: Pick<Job, 'description' | 'company'>): boolean {
  const desc = (job.description ?? '').trim();
  if (!desc || desc.length < MIN_DESCRIPTION_LENGTH) return true;
  const company = (job.company ?? '').trim();
  return Boolean(company && desc.toLowerCase() === company.toLowerCase());
}

export function needsJobSalary(job: Pick<Job, 'salary' | 'salary_min_annual' | 'salary_max_annual'>): boolean {
  return job.salary_min_annual == null && job.salary_max_annual == null;
}

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return blocks;
}

function flattenLd(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const item of node) flattenLd(item, out);
    return out;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    out.push(obj);
    flattenLd(obj['@graph'], out);
  }
  return out;
}

function isJobPosting(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
}

function jobPostingFromHtml(html: string): Record<string, unknown> | undefined {
  for (const block of jsonLdBlocks(html)) {
    const posting = flattenLd(block).find(isJobPosting);
    if (posting) return posting;
  }
  return undefined;
}

export function extractDescriptionFromHtml(html = ''): string {
  const posting = jobPostingFromHtml(html);
  const desc = posting?.description;
  if (typeof desc === 'string') {
    const text = stripHtml(desc);
    if (text.length > 80) return text;
  }

  const teamworkBody = html.match(
    /class="[^"]*opportunity-preview__body[^"]*"[\s\S]*?>([\s\S]*?)<div class="opportunity-preview__apply"/i
  );
  if (teamworkBody?.[1]) {
    const text = stripHtml(teamworkBody[1]);
    if (text.length > 80) return text;
  }

  return '';
}

export function extractSalaryFromHtml(html = '', description = ''): string | null {
  const fromLd = salaryFromJobPosting(jobPostingFromHtml(html));
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

  return extractSalaryFromText(description || extractDescriptionFromHtml(html))?.raw ?? null;
}

export function workdayJobApiUrl(jobUrl: string): string | null {
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

function truncateDescription(text: string) {
  return text.length > DESCRIPTION_MAX ? `${text.slice(0, DESCRIPTION_MAX)}…` : text;
}

async function fetchWorkdayPosting(jobUrl: string): Promise<{ description: string; salary: string | null }> {
  const apiUrl = workdayJobApiUrl(jobUrl);
  if (!apiUrl) return { description: '', salary: null };
  const res = await fetch(apiUrl, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return { description: '', salary: null };
  const data = (await res.json()) as {
    jobPostingInfo?: { jobDescription?: string; compensation?: unknown; payRange?: unknown; salary?: unknown };
  };
  const info = data.jobPostingInfo ?? {};
  const description = stripHtml(info.jobDescription ?? '');
  const salaryHint = [info.compensation, info.payRange, info.salary]
    .map((value) => (typeof value === 'string' ? value : value ? JSON.stringify(value) : ''))
    .filter(Boolean)
    .join(' ');
  const salary =
    extractSalaryFromText(salaryHint)?.raw ?? extractSalaryFromText(description)?.raw ?? null;
  return { description, salary };
}

export async function fetchJobPostingFromUrl(
  url: string
): Promise<{ description: string; salary: string | null }> {
  if (!url) return { description: '', salary: null };
  try {
    if (url.includes('myworkdayjobs.com')) {
      const fromApi = await fetchWorkdayPosting(url);
      if (fromApi.description.length > 80) {
        return { description: truncateDescription(fromApi.description), salary: fromApi.salary };
      }
    }

    const res = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    const html = await res.text();
    const description = extractDescriptionFromHtml(html);
    return {
      description: description.length > 80 ? truncateDescription(description) : '',
      salary: extractSalaryFromHtml(html, description),
    };
  } catch {
    return { description: '', salary: null };
  }
}

export async function fetchJobDescriptionFromUrl(url: string): Promise<string> {
  const posting = await fetchJobPostingFromUrl(url);
  return posting.description;
}

/** Fetch missing descriptions and parse salary out of the posting text. */
export async function ensureJobDescription(job: Job): Promise<Job> {
  let next: Job = job;

  if (job.url && (needsJobDescription(job) || needsJobSalary(job))) {
    const fetched = await fetchJobPostingFromUrl(job.url);
    next = { ...job };
    if (fetched.description.length > (job.description?.trim().length ?? 0)) {
      next.description = fetched.description;
    }
    if (fetched.salary && !job.salary) next.salary = fetched.salary;
  }

  next = withExtractedSalary(next);
  const descChanged = (next.description ?? '') !== (job.description ?? '');
  const salaryChanged =
    next.salary_min_annual !== job.salary_min_annual || next.salary_max_annual !== job.salary_max_annual;

  if (!descChanged && !salaryChanged) return next;

  const patch: Record<string, unknown> = {};
  if (descChanged) patch.description = next.description;
  if (salaryChanged) {
    patch.salary = next.salary;
    patch.salary_raw = next.salary;
    patch.salary_min_annual = next.salary_min_annual;
    patch.salary_max_annual = next.salary_max_annual;
  }

  const query = getDb().from('jobs').update(patch);
  const { error } = descChanged && job.url ? await query.eq('url', job.url) : await query.eq('id', job.id);
  if (error) {
    console.error(`Failed to store fetched job details for ${job.id}:`, error.message);
  }

  return next;
}
