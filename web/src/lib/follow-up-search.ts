import { searchWebBatch, type WebSearchResponse } from './web-search';
import { guessCompanyEmailDomain, isLikelySportsOrganization } from './follow-up-utils';

type JobForSearch = {
  title: string;
  company: string | null;
  description: string;
  url?: string | null;
};

/** Extract department/team name from common JD phrasing. */
function extractDepartment(description: string): string {
  const patterns = [
    /(?:the\s+)?([A-Z][\w\s&]+?)\s+department\b/i,
    /(?:join|within|part of)\s+(?:the\s+)?([A-Z][\w\s&]+?)\s+(?:team|group|division)\b/i,
  ];
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]) {
      const dept = match[1].trim();
      if (dept.length >= 4 && dept.length <= 80) return dept;
    }
  }
  return '';
}

/** Strip seniority prefix and trailing location/company from title. */
function coreTitle(title: string): string {
  return title
    .replace(/^(Manager|Director|Coordinator|Senior|Junior|Lead|Principal|Associate|Analyst|VP|SVP),?\s*/gi, '')
    .replace(/\s+[-–—|]\s+.*/, '')
    .trim();
}

function titleKeywords(title: string): string {
  const core = coreTitle(title);
  const firstSegment = core.split(/[,/&]/)[0]?.trim() ?? core;
  return firstSegment
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(and|the|for|with)$/i.test(w))
    .slice(0, 5)
    .join(' ');
}

/**
 * Serper free accounts reject advanced Google operators (site:, -term, @domain, etc.).
 * Keep queries plain — "linkedin" as a keyword still surfaces profile pages.
 */
function plainQuery(parts: Array<string | false | null | undefined>): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build targeted queries prioritizing recruiters and hiring managers.
 * Matches manual research style (company + department + linkedin + role keywords).
 */
export function buildFollowUpSearchQueries(
  job: JobForSearch,
  variant: 'initial' | 'more' = 'initial'
): string[] {
  const company = (job.company ?? '').trim();
  const title = job.title.trim();
  const department = extractDepartment(job.description);
  const keywords = titleKeywords(title);
  const titleShort = coreTitle(title).split(/[,/&]/)[0]?.trim() ?? title;
  const firstKeyword = keywords.split(' ')[0] ?? titleShort.split(' ')[0] ?? '';

  const queries: string[] = [];

  if (company && department) {
    queries.push(
      plainQuery([company, department, 'LinkedIn', titleShort, 'manager'])
    );
  }

  if (company) {
    queries.push(plainQuery([company, 'linkedin.com/in']));
    queries.push(plainQuery([company, 'linkedin', 'profile']));
    queries.push(plainQuery([company, 'linkedin', 'team']));
    queries.push(plainQuery([company, 'founder', 'CEO', 'linkedin']));
    queries.push(plainQuery([company, 'people', 'linkedin']));
    queries.push(plainQuery([company, 'Talent Acquisition', 'recruiter', 'linkedin']));
    queries.push(
      plainQuery([company, 'Talent Acquisition', 'recruiter', keywords, 'linkedin'])
    );
    queries.push(plainQuery([company, 'recruiter', firstKeyword, 'linkedin']));
    queries.push(plainQuery([company, 'human resources', 'linkedin']));
    queries.push(plainQuery([company, 'people operations', 'linkedin']));
    queries.push(plainQuery([company, 'hiring', 'linkedin']));
  }

  if (company && isLikelySportsOrganization(company)) {
    queries.push(plainQuery([company, 'NFL', 'talent acquisition', 'linkedin']));
    queries.push(plainQuery([company, 'NFL', 'recruiter', 'linkedin']));
    queries.push(plainQuery([company, 'human resources', 'NFL', 'linkedin']));
  }

  if (company && keywords) {
    queries.push(plainQuery([company, 'Director', keywords, 'linkedin']));
    queries.push(plainQuery([company, 'Manager', keywords, 'linkedin']));
    queries.push(plainQuery([company, keywords, 'linkedin.com/in']));
    queries.push(plainQuery([company, keywords, 'VP', 'linkedin']));
    queries.push(plainQuery([company, keywords, 'hiring manager', 'linkedin']));
  }

  if (company && department && variant === 'more') {
    queries.push(plainQuery([company, department, 'coordinator', 'linkedin']));
    queries.push(plainQuery([company, department, 'hiring', 'linkedin']));
  }

  if (variant === 'more' && company && keywords) {
    queries.push(plainQuery([company, 'human resources', keywords, 'linkedin']));
    queries.push(plainQuery([company, 'people operations', keywords, 'linkedin']));
    queries.push(plainQuery([company, 'engineer', keywords, 'linkedin']));
    queries.push(plainQuery([company, 'software', 'developer', 'linkedin']));
    queries.push(plainQuery([company, 'product', keywords, 'linkedin']));
    queries.push(plainQuery([company, 'designer', 'linkedin']));
  }

  if (variant === 'more' && company) {
    queries.push(plainQuery([company, 'employee', 'linkedin']));
  }

  if (title && company) {
    queries.push(plainQuery([title, company]));
  }

  return [...new Set(queries.filter((q) => q.length > 8))].slice(0, variant === 'more' ? 14 : 12);
}

export async function runFollowUpSearches(
  job: JobForSearch,
  variant: 'initial' | 'more' = 'initial'
): Promise<{
  queries: string[];
  searches: WebSearchResponse[];
  guessedDomain: string | null;
}> {
  const queries = buildFollowUpSearchQueries(job, variant);
  const searches = await searchWebBatch(queries);
  const guessedDomain = guessCompanyEmailDomain(job.company, job.url);
  return { queries, searches, guessedDomain };
}
