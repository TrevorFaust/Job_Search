import { getDb } from './supabase';
import {
  applyJobFiltersAsync,
  applyJobFiltersSync,
  paginate,
  sortJobs,
  PAGE_SIZE,
  BOARD_SCAN_LIMIT,
  hasActiveFilters,
  type JobFilters,
} from './filters';
import { categoryDbKeywords, filterByCategories } from './categories';
import type { ApplicationStage } from './applications';
import type { FitLevel } from './fit-level';
import type { ManualJob } from './manual-jobs';
import { hydrateFitLevels } from './job-fit';
import { manualJobToBoardView } from './manual-jobs';
import { jobOrganization, jobPlace, uniqueSortedLabels } from './priority-jobs';

export type SortKey = 'date' | 'date_asc' | 'salary_high' | 'salary_low';

/** Legacy alias from older URLs. */
export function normalizeSortKey(sort: string): SortKey {
  if (sort === 'newest') return 'date';
  if (sort === 'date_asc' || sort === 'salary_high' || sort === 'salary_low') return sort;
  return 'date';
}

export type Job = {
  id: number;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  salary: string | null;
  salary_min_annual: number | null;
  salary_max_annual: number | null;
  description: string | null;
  posted_at: string | null;
  created_at: string;
  status: string;
  is_special?: boolean;
};

export type SearchProfile = {
  id: string;
  name: string;
  keywords: string[];
  exclude_keywords: string[];
  locations: string[];
  remote_only: boolean;
  min_salary_annual: number | null;
  include_unknown_salary: boolean;
  frequency: 'daily' | 'every_3_days' | 'weekly';
  active: boolean;
};

export type Subscriber = {
  id: string;
  email: string;
  edit_token: string;
};

export type JobView = Job & {
  match_id?: number;
  matched_keywords?: string[];
  profile_name?: string;
  emailed_at?: string | null;
  application_stage?: ApplicationStage;
  applied_at?: string;
  interview_prep?: Record<string, unknown>;
  follow_up_contacts?: Record<string, unknown>;
  fit_level?: FitLevel;
  fit_score?: number;
  fit_estimated?: boolean;
  isManual?: boolean;
  manual_job_id?: string;
};

export type PaginatedJobs = {
  jobs: JobView[];
  total: number;
  page: number;
  totalPages: number;
  /** All active priority job ids (for unseen badge). */
  priorityJobIds?: number[];
  organizations?: string[];
  locations?: string[];
};

export type FetchBoardJobsOptions = {
  specialOnly?: boolean;
  excludeSpecial?: boolean;
};

/** Columns for list views — description is loaded only for the current page. */
const JOB_LIST_SELECT =
  'id, source, title, company, location, url, salary, salary_min_annual, salary_max_annual, posted_at, created_at, status, is_special';

const JOB_LIST_SELECT_WITH_DESCRIPTION =
  'id, source, title, company, location, url, salary, salary_min_annual, salary_max_annual, posted_at, created_at, status, is_special, description';

type JobListRow = Omit<Job, 'description'> & { description?: string | null };

function applyDbFilters<T extends { or: (filters: string) => T; ilike: (col: string, pattern: string) => T }>(
  query: T,
  filters?: JobFilters
): T {
  if (!filters || !hasActiveFilters(filters)) return query;

  if (filters.recencyDays) {
    const cutoff = new Date(Date.now() - filters.recencyDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.or(`posted_at.gte.${cutoff},and(posted_at.is.null,created_at.gte.${cutoff})`);
  }

  if (filters.excludeNoSalary) {
    query = query.or('salary_min_annual.not.is.null,salary_max_annual.not.is.null');
  }

  if (filters.minSalary != null) {
    query = query.or(
      `salary_max_annual.gte.${filters.minSalary},and(salary_max_annual.is.null,salary_min_annual.gte.${filters.minSalary})`
    );
  }

  if (filters.workType === 'remote') {
    query = query.ilike('location', '%remote%');
  } else if (filters.workType === 'hybrid') {
    query = query.ilike('location', '%hybrid%');
  }

  return query;
}

export async function getSubscriberByToken(token: string) {
  const { data, error } = await getDb()
    .from('subscribers')
    .select('id, email, edit_token')
    .eq('edit_token', token)
    .maybeSingle();
  if (error) throw error;
  return data as Subscriber | null;
}

export async function getOrCreateSubscriber(email: string) {
  const db = getDb();
  const { data: existing } = await db.from('subscribers').select('*').eq('email', email).maybeSingle();
  if (existing) return existing as Subscriber;

  const { data, error } = await db.from('subscribers').insert({ email }).select('*').single();
  if (error) throw error;
  return data as Subscriber;
}

export async function getProfiles(subscriberId: string) {
  const { data, error } = await getDb()
    .from('search_profiles')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .eq('active', true)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as SearchProfile[];
}

function filterBySearch(jobs: Job[], q?: string) {
  const query = typeof q === 'string' ? q.trim() : '';
  if (!query) return jobs;
  const needle = query.toLowerCase();
  return jobs.filter((j) => {
    const haystack = `${j.title} ${j.company ?? ''} ${j.location ?? ''} ${j.description ?? ''}`.toLowerCase();
    return haystack.includes(needle);
  });
}

function toPaginated(jobs: JobView[], page: number): PaginatedJobs {
  const { items, total, page: p, totalPages } = paginate(jobs, page);
  return { jobs: items, total, page: p, totalPages };
}

async function hydrateDescriptions(jobs: JobView[]): Promise<JobView[]> {
  if (!jobs.length) return jobs;

  const scraped = jobs.filter((j) => !j.isManual);
  if (!scraped.length) return jobs;

  const ids = scraped.map((j) => j.id);
  const { data, error } = await getDb().from('jobs').select('id, description').in('id', ids);
  if (error) throw error;

  const descriptions = new Map((data ?? []).map((row) => [row.id as number, row.description as string | null]));
  return jobs.map((job) =>
    job.isManual ? job : { ...job, description: descriptions.get(job.id) ?? null }
  );
}

function dedupeJobsById<T extends { id: number }>(jobs: T[]): T[] {
  const seen = new Set<number>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

/** Supabase/PostgREST returns at most 1,000 rows per request — batch until cap. */
async function fetchActiveJobs(
  filters?: JobFilters,
  max = BOARD_SCAN_LIMIT,
  includeDescription = false,
  options?: FetchBoardJobsOptions
): Promise<JobListRow[]> {
  const jobs: JobListRow[] = [];
  const batchSize = 1000;
  const select = includeDescription ? JOB_LIST_SELECT_WITH_DESCRIPTION : JOB_LIST_SELECT;
  let offset = 0;

  while (jobs.length < max) {
    const from = offset;
    const to = Math.min(from + batchSize - 1, max - 1);

    let query = getDb()
      .from('jobs')
      .select(select)
      .eq('status', 'active')
      .order('posted_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false });

    if (options?.specialOnly) query = query.eq('is_special', true);
    else if (options?.excludeSpecial) query = query.eq('is_special', false);

    query = applyDbFilters(query, filters);

    const { data, error } = await query.range(from, to);

    if (error) throw error;
    if (!data?.length) break;

    jobs.push(...(data as unknown as JobListRow[]));
    offset += data.length;
    if (data.length < batchSize) break;
  }

  return dedupeJobsById(jobs);
}

async function fetchManualJobsForSubscriber(subscriberId: string): Promise<JobView[]> {
  const { data, error } = await getDb()
    .from('manual_jobs')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => manualJobToBoardView(row as ManualJob));
}

async function fetchSubscriberJobViews(
  profileIds: string[],
  view: 'matches' | 'emailed' | 'pending',
  max = BOARD_SCAN_LIMIT
): Promise<JobView[]> {
  const jobs: JobView[] = [];
  const batchSize = 1000;

  while (jobs.length < max) {
    const from = jobs.length;
    const to = Math.min(from + batchSize - 1, max - 1);

    let query = getDb()
      .from('profile_job_matches')
      .select('id, matched_keywords, emailed_at, jobs(*), search_profiles(name)')
      .in('profile_id', profileIds);

    if (view === 'emailed') query = query.not('emailed_at', 'is', null);
    if (view === 'pending') query = query.is('emailed_at', null);

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (!data?.length) break;

    jobs.push(
      ...data.map((m: Record<string, unknown>) => {
        const job = m.jobs as Job;
        const profile = m.search_profiles as { name: string };
        return {
          ...job,
          match_id: m.id as number,
          matched_keywords: m.matched_keywords as string[],
          profile_name: profile?.name,
          emailed_at: m.emailed_at as string | null,
        };
      })
    );

    if (data.length < batchSize) break;
  }

  return jobs;
}

function needsMemoryBoardScan(filters?: JobFilters): boolean {
  if (!filters) return false;
  if (filters.locations.length > 0) return true;
  if (filters.workType === 'onsite') return true;
  // Preferred / category matching needs description text — DB OR-ilike blows up.
  if (filters.categories.length > 0) return true;
  return false;
}

function applyExclusionFilter<T extends { not: (col: string, op: string, val: string) => T }>(
  query: T,
  excludeJobIds?: Set<number>
): T {
  if (!excludeJobIds?.size) return query;
  const ids = [...excludeJobIds];
  if (!ids.length) return query;
  return query.not('id', 'in', `(${ids.join(',')})`);
}

function applyCategoryDbFilter<T extends { or: (expr: string) => T }>(
  query: T,
  categoryIds?: string[]
): T {
  if (!categoryIds?.length) return query;
  const keywords = categoryDbKeywords(categoryIds);
  if (!keywords.length) return query;
  // Title/company only — description.ilike across dozens of keywords times out on PostgREST.
  const clauses = keywords.flatMap((kw) => [`title.ilike.%${kw}%`, `company.ilike.%${kw}%`]);
  return query.or(clauses.join(','));
}

function applyBoardFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters?: JobFilters,
  excludeJobIds?: Set<number>,
  q?: string,
  categoryIds?: string[],
  options?: FetchBoardJobsOptions
) {
  if (options?.specialOnly) query = query.eq('is_special', true);
  else if (options?.excludeSpecial) query = query.eq('is_special', false);
  query = applyDbFilters(query, filters);
  query = applyExclusionFilter(query, excludeJobIds);
  // Category matching uses the memory path; keep DB category filter off the hot path.
  if (categoryIds?.length && !needsMemoryBoardScan(filters)) {
    query = applyCategoryDbFilter(query, categoryIds);
  }
  if (q?.trim()) {
    const safe = q.trim().replace(/[%_,]/g, ' ').trim();
    if (safe) {
      query = query.textSearch('board_search', safe, { type: 'websearch', config: 'simple' });
    }
  }
  return query;
}

async function countActiveJobs(
  filters?: JobFilters,
  excludeJobIds?: Set<number>,
  q?: string,
  categoryIds?: string[],
  options?: FetchBoardJobsOptions
): Promise<number> {
  let query = getDb()
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');
  query = applyBoardFilters(query, filters, excludeJobIds, q, categoryIds, options);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function buildActiveJobsQuery(
  filters?: JobFilters,
  excludeJobIds?: Set<number>,
  q?: string,
  categoryIds?: string[],
  options?: FetchBoardJobsOptions
) {
  let query = getDb()
    .from('jobs')
    .select(JOB_LIST_SELECT, { count: 'exact' })
    .eq('status', 'active');
  return applyBoardFilters(query, filters, excludeJobIds, q, categoryIds, options);
}

function applyBoardSort(
  query: ReturnType<typeof buildActiveJobsQuery>,
  sort: SortKey,
  options?: FetchBoardJobsOptions
) {
  // Priority jobs live on their own tab — don't pin them on All.
  const pinSpecial = !options?.excludeSpecial && !options?.specialOnly;
  const withSpecial = pinSpecial
    ? query.order('is_special', { ascending: false })
    : query;

  switch (sort) {
    case 'salary_high':
      return withSpecial
        .order('salary_max_annual', { ascending: false, nullsFirst: false })
        .order('salary_min_annual', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
    case 'salary_low':
      return withSpecial
        .order('salary_min_annual', { ascending: true, nullsFirst: false })
        .order('salary_max_annual', { ascending: true, nullsFirst: false })
        .order('id', { ascending: false });
    case 'date_asc':
      return withSpecial
        .order('posted_at', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true });
    default:
      return withSpecial
        .order('posted_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
  }
}

async function fetchScrapedJobsPage(
  sort: SortKey,
  offset: number,
  limit: number,
  filters?: JobFilters,
  excludeJobIds?: Set<number>,
  q?: string,
  categoryIds?: string[],
  options?: FetchBoardJobsOptions
): Promise<{ jobs: JobListRow[]; total: number }> {
  if (limit <= 0) {
    const total = await countActiveJobs(filters, excludeJobIds, q, categoryIds, options);
    return { jobs: [], total };
  }

  let query = buildActiveJobsQuery(filters, excludeJobIds, q, categoryIds, options);
  query = applyBoardSort(query, sort, options);

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;

  return {
    jobs: dedupeJobsById((data ?? []) as unknown as JobListRow[]),
    total: count ?? 0,
  };
}

async function getVisibleManualJobs(
  subscriberId: string,
  excludeManualJobIds?: Set<string>
): Promise<JobView[]> {
  const manual = await fetchManualJobsForSubscriber(subscriberId);
  if (!excludeManualJobIds?.size) return manual;
  return manual.filter(
    (j) => !j.manual_job_id || !excludeManualJobIds.has(j.manual_job_id)
  );
}

async function getAllJobsMemoryScan(
  sort: SortKey,
  page: number,
  q?: string,
  filters?: JobFilters,
  excludeJobIds?: Set<number>,
  subscriberId?: string,
  excludeManualJobIds?: Set<string>,
  options?: FetchBoardJobsOptions
): Promise<PaginatedJobs> {
  const includeDescription = !!q?.trim() || !!filters?.categories?.length;
  let jobs: JobView[] = (await fetchActiveJobs(
    filters,
    BOARD_SCAN_LIMIT,
    includeDescription,
    options
  )) as JobView[];

  // Manual jobs only belong on All / Preferred, not Priority.
  if (subscriberId && !options?.specialOnly) {
    const manualJobs = await getVisibleManualJobs(subscriberId, excludeManualJobIds);
    jobs = [...manualJobs, ...jobs];
  }
  if (excludeJobIds?.size) {
    jobs = jobs.filter((j) => !j.isManual && !excludeJobIds.has(j.id));
  }
  if (excludeManualJobIds?.size) {
    jobs = jobs.filter(
      (j) => !j.isManual || !j.manual_job_id || !excludeManualJobIds.has(j.manual_job_id)
    );
  }

  jobs = filterBySearch(jobs, q);
  if (filters) {
    jobs =
      filters.workType === 'onsite' || filters.locations.length
        ? await applyJobFiltersAsync(jobs, filters)
        : applyJobFiltersSync(jobs, filters);
    if (filters.categories.length) {
      jobs = filterByCategories(jobs, filters.categories);
    }
  }

  let organizations: string[] | undefined;
  let locations: string[] | undefined;
  if (options?.specialOnly) {
    organizations = uniqueSortedLabels(jobs.map(jobOrganization));
    locations = uniqueSortedLabels(jobs.map(jobPlace));
    if (filters?.priorityOrg) {
      jobs = jobs.filter((job) => jobOrganization(job) === filters.priorityOrg);
    }
    if (filters?.priorityPlace) {
      jobs = jobs.filter((job) => jobPlace(job) === filters.priorityPlace);
    }
  }

  jobs = sortJobs(jobs, sort, { pinSpecial: false });
  const paginated = toPaginated(jobs, page);
  if (!includeDescription) {
    paginated.jobs = await hydrateDescriptions(paginated.jobs);
  }
  if (subscriberId) {
    paginated.jobs = await hydrateFitLevels(subscriberId, paginated.jobs);
  }
  return { ...paginated, organizations, locations };
}

/** Active jobs on the board (status=active, within 6-week retention window). */
export async function getAllJobs(
  sort: SortKey,
  page: number,
  q?: string,
  filters?: JobFilters,
  excludeJobIds?: Set<number>,
  subscriberId?: string,
  excludeManualJobIds?: Set<string>,
  options?: FetchBoardJobsOptions
): Promise<PaginatedJobs> {
  if (needsMemoryBoardScan(filters) || options?.specialOnly) {
    return getAllJobsMemoryScan(
      sort,
      page,
      q,
      filters,
      excludeJobIds,
      subscriberId,
      excludeManualJobIds,
      options
    );
  }

  const categoryIds = filters?.categories ?? [];
  const manualVisible =
    subscriberId && !options?.specialOnly
      ? await getVisibleManualJobs(subscriberId, excludeManualJobIds)
      : [];
  const manualOnPage = page === 1 ? manualVisible : [];
  const manualTotal = manualVisible.length;

  const scrapedOffset = page === 1 ? 0 : Math.max(0, (page - 1) * PAGE_SIZE - manualTotal);
  const scrapedLimit = page === 1 ? Math.max(0, PAGE_SIZE - manualOnPage.length) : PAGE_SIZE;

  const { jobs: scraped, total: scrapedTotal } = await fetchScrapedJobsPage(
    sort,
    scrapedOffset,
    scrapedLimit,
    filters,
    excludeJobIds,
    q,
    categoryIds,
    options
  );

  let jobs: JobView[] = [...manualOnPage, ...(scraped as JobView[])];
  if (categoryIds.length) {
    jobs = filterByCategories(jobs, categoryIds);
  }

  jobs = await hydrateDescriptions(jobs);
  if (subscriberId) {
    jobs = await hydrateFitLevels(subscriberId, jobs);
  }

  const total = manualTotal + scrapedTotal;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    jobs,
    total,
    page: Math.min(Math.max(1, page), totalPages),
    totalPages,
  };
}

export async function getPriorityJobIds(): Promise<number[]> {
  const ids: number[] = [];
  const batchSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await getDb()
      .from('jobs')
      .select('id')
      .eq('status', 'active')
      .eq('is_special', true)
      .order('id', { ascending: false })
      .range(offset, offset + batchSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) ids.push(row.id as number);
    offset += data.length;
    if (data.length < batchSize) break;
  }
  return ids;
}

export async function getJobsForSubscriber(
  subscriberId: string,
  view: 'matches' | 'emailed' | 'pending',
  sort: SortKey,
  page: number,
  q?: string,
  filters?: JobFilters
): Promise<PaginatedJobs> {
  const profiles = await getProfiles(subscriberId);
  const profileIds = profiles.map((p) => p.id);
  if (!profileIds.length) return { jobs: [], total: 0, page: 1, totalPages: 1 };

  let jobs = await fetchSubscriberJobViews(profileIds, view);

  jobs = filterBySearch(jobs, q);
  if (filters) jobs = await applyJobFiltersAsync(jobs, filters);
  jobs = sortJobs(jobs, sort);
  return toPaginated(jobs, page);
}
