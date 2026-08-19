import { getDb } from './supabase';
import {
  applyJobFiltersAsync,
  applyJobFiltersSync,
  paginate,
  sortJobs,
  BOARD_MAX_JOBS,
  hasActiveFilters,
  type JobFilters,
} from './filters';
import { filterByCategories } from './categories';
import type { ApplicationStage } from './applications';
import type { FitLevel } from './fit-level';
import type { ManualJob } from './manual-jobs';
import { hydrateFitLevels } from './job-fit';
import { manualJobToBoardView } from './manual-jobs';

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
  fit_level?: FitLevel;
  fit_score?: number;
  isManual?: boolean;
  manual_job_id?: string;
};

export type PaginatedJobs = {
  jobs: JobView[];
  total: number;
  page: number;
  totalPages: number;
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
  max = BOARD_MAX_JOBS,
  includeDescription = false
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
  max = BOARD_MAX_JOBS
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

/** Active jobs on the board (status=active, within 6-week retention window). */
export async function getAllJobs(
  sort: SortKey,
  page: number,
  q?: string,
  filters?: JobFilters,
  excludeJobIds?: Set<number>,
  subscriberId?: string,
  excludeManualJobIds?: Set<string>
): Promise<PaginatedJobs> {
  const includeDescription = !!q?.trim() || !!filters?.categories?.length;
  let jobs: JobView[] = (await fetchActiveJobs(
    filters,
    BOARD_MAX_JOBS,
    includeDescription
  )) as JobView[];
  if (subscriberId) {
    const manualJobs = await fetchManualJobsForSubscriber(subscriberId);
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
    // DB already handles salary/recency/remote/hybrid; finish work-type + location in memory.
    jobs = filters.workType === 'onsite' || filters.locations.length
      ? await applyJobFiltersAsync(jobs, filters)
      : applyJobFiltersSync(jobs, filters);
    if (filters.categories.length) {
      jobs = filterByCategories(jobs, filters.categories);
    }
  }
  jobs = sortJobs(jobs, sort);
  const paginated = toPaginated(jobs, page);
  if (!includeDescription) {
    paginated.jobs = await hydrateDescriptions(paginated.jobs);
  }
  if (subscriberId) {
    paginated.jobs = await hydrateFitLevels(subscriberId, paginated.jobs);
  }
  return paginated;
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
