import type { Job, SortKey } from './queries';
import { geocodeUS, geocodeJobLocationLocal, milesBetween } from './geo';
import { parseCategoryIds } from './categories';

export function sortJobs<T extends Job>(jobs: T[], sort: SortKey): T[] {
  const copy = [...jobs];
  switch (sort) {
    case 'salary_high':
      return copy.sort(
        (a, b) =>
          (b.salary_max_annual ?? b.salary_min_annual ?? 0) -
          (a.salary_max_annual ?? a.salary_min_annual ?? 0)
      );
    case 'salary_low':
      return copy.sort(
        (a, b) =>
          (a.salary_min_annual ?? a.salary_max_annual ?? Infinity) -
          (b.salary_min_annual ?? b.salary_max_annual ?? Infinity)
      );
    case 'date_asc':
      return copy.sort((a, b) => {
        const da = new Date(a.posted_at ?? a.created_at).getTime();
        const db = new Date(b.posted_at ?? b.created_at).getTime();
        return da - db;
      });
    default:
      return copy.sort((a, b) => {
        const da = new Date(a.posted_at ?? a.created_at).getTime();
        const db = new Date(b.posted_at ?? b.created_at).getTime();
        return db - da;
      });
  }
}

export const PAGE_SIZE = 50;

/** Max jobs loaded on the public board (Supabase fetches in 1k batches). */
export const BOARD_MAX_JOBS = 100_000;

export const RECENCY_OPTIONS = [
  { id: '', label: 'Any time', days: null },
  { id: '1', label: 'Last 24 hours', days: 1 },
  { id: '3', label: 'Last 3 days', days: 3 },
  { id: '7', label: 'Last week', days: 7 },
  { id: '14', label: 'Last 2 weeks', days: 14 },
  { id: '21', label: 'Last 3 weeks', days: 21 },
  { id: '28', label: 'Last 4 weeks', days: 28 },
  { id: '35', label: 'Last 5 weeks', days: 35 },
  { id: '42', label: 'Last 6 weeks', days: 42 },
] as const;

export const WORK_TYPE_OPTIONS = [
  { id: '', label: 'Any work type' },
  { id: 'remote', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'onsite', label: 'On-site' },
] as const;

export type WorkType = 'remote' | 'hybrid' | 'onsite';

export type JobFilters = {
  minSalary?: number;
  excludeNoSalary: boolean;
  locations: string[];
  locationRadius?: number;
  workType?: WorkType;
  recencyDays?: number;
  categories: string[];
};

export function parseJobFilters(params: Record<string, string | string[] | undefined>): JobFilters {
  const str = (k: string) => {
    const v = params[k];
    return typeof v === 'string' ? v : undefined;
  };

  const rawLocations = params.location;
  const locations = (
    Array.isArray(rawLocations)
      ? rawLocations
      : rawLocations
        ? [rawLocations]
        : []
  )
    .map((l) => l.trim())
    .filter(Boolean);

  const recencyId = str('recency') ?? '';
  const recencyOption = RECENCY_OPTIONS.find((o) => o.id === recencyId);

  const workTypeRaw = str('work_type');
  const workType =
    workTypeRaw === 'remote' || workTypeRaw === 'hybrid' || workTypeRaw === 'onsite'
      ? workTypeRaw
      : undefined;

  return {
    minSalary: str('min_salary') ? Number(str('min_salary')) : undefined,
    excludeNoSalary: str('exclude_no_salary') === '1',
    locations,
    locationRadius: str('radius') ? Number(str('radius')) : undefined,
    workType,
    recencyDays: recencyOption?.days ?? undefined,
    categories: parseCategoryIds(params),
  };
}

function matchesWorkType(loc: string, workType?: WorkType): boolean {
  if (!workType) return true;

  const trimmed = loc.trim();
  const isRemoteOnly = /^\s*remote\b/i.test(trimmed);
  const isRemote = /\bremote\b/i.test(loc);
  const isHybrid = /\bhybrid\b/i.test(loc);
  const isOnsite = trimmed.length > 0 && !isRemoteOnly && (!isRemote || isHybrid);

  if (workType === 'remote') return isRemote;
  if (workType === 'hybrid') return isHybrid;
  if (workType === 'onsite') return isOnsite;
  return true;
}

function matchesSalary(job: Job, filters: JobFilters): boolean {
  const hasSalary = job.salary_min_annual != null || job.salary_max_annual != null;
  const jobMax = job.salary_max_annual ?? job.salary_min_annual;

  if (filters.excludeNoSalary && !hasSalary) return false;

  if (filters.minSalary) {
    if (!hasSalary) return !filters.excludeNoSalary;
    if (jobMax != null && jobMax < filters.minSalary) return false;
  }

  return true;
}

function matchesRecency(job: Job, recencyDays?: number): boolean {
  if (!recencyDays) return true;

  const posted = new Date(job.posted_at ?? job.created_at);
  if (Number.isNaN(posted.getTime())) return false;

  const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;
  return posted.getTime() >= cutoff;
}

const GEO_BATCH_SIZE = 4;

async function geocodeBatch<T>(
  items: T[],
  fn: (item: T) => Promise<unknown>
): Promise<void> {
  for (let i = 0; i < items.length; i += GEO_BATCH_SIZE) {
    await Promise.all(items.slice(i, i + GEO_BATCH_SIZE).map(fn));
  }
}

function matchesLocationRadiusSync(
  job: Job,
  location: string,
  radius: number,
  searchPoint: Awaited<ReturnType<typeof geocodeUS>>,
  jobPoint: ReturnType<typeof geocodeJobLocationLocal>
): boolean {
  const loc = (job.location ?? '').toLowerCase();
  const searchLower = location.toLowerCase();
  const cityNeedle = searchLower.split(',')[0].trim();

  if (cityNeedle && loc.includes(cityNeedle)) return true;
  if (!searchPoint) return loc.includes(searchLower);
  if (jobPoint) return milesBetween(searchPoint, jobPoint) <= radius;
  return false;
}

/** Sync filters that don't need geocoding. */
export function applyJobFiltersSync<T extends Job>(jobs: T[], filters: JobFilters): T[] {
  return jobs.filter((job) => {
    if (!matchesWorkType(job.location ?? '', filters.workType)) return false;
    if (!matchesSalary(job, filters)) return false;
    if (!matchesRecency(job, filters.recencyDays)) return false;
    return true;
  });
}

/** Applies location radius via OpenStreetMap geocoding (Kent OH, Kent WA, etc.). */
export async function applyJobFiltersAsync<T extends Job>(
  jobs: T[],
  filters: JobFilters
): Promise<T[]> {
  let result = applyJobFiltersSync(jobs, filters);
  if (!filters.locations.length) return result;

  const radius = filters.locationRadius ?? 50;

  const searchPoints = new Map<string, Awaited<ReturnType<typeof geocodeUS>>>();
  await geocodeBatch(filters.locations, async (location) => {
    searchPoints.set(location, await geocodeUS(location));
  });

  const jobPoints = new Map<string, ReturnType<typeof geocodeJobLocationLocal>>();
  for (const job of result) {
    const jobLoc = (job.location ?? '').trim();
    if (!jobLoc || jobPoints.has(jobLoc)) continue;
    jobPoints.set(jobLoc, geocodeJobLocationLocal(jobLoc));
  }

  return result.filter((job) => {
    const jobLoc = (job.location ?? '').trim();
    const jobPoint = jobLoc ? jobPoints.get(jobLoc) ?? null : null;
    return filters.locations.some((location) =>
      matchesLocationRadiusSync(job, location, radius, searchPoints.get(location) ?? null, jobPoint)
    );
  });
}

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  return {
    items: items.slice((p - 1) * pageSize, p * pageSize),
    total,
    page: p,
    totalPages,
    pageSize,
  };
}

export function formatPostedDate(postedAt: string | null, createdAt: string) {
  const d = new Date(postedAt ?? createdAt);
  if (Number.isNaN(d.getTime())) return 'Date unknown';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function hasActiveFilters(filters: JobFilters): boolean {
  return (
    !!filters.minSalary ||
    filters.excludeNoSalary ||
    filters.locations.length > 0 ||
    !!filters.workType ||
    !!filters.recencyDays
  );
}

export function buildBoardHref(
  filters: JobFilters,
  opts: { view?: string; stage?: string; sort?: string; q?: string; page?: number } = {}
): string {
  const params = buildFilterParams(
    {
      view: opts.view && opts.view !== 'all' ? opts.view : undefined,
      stage: opts.view === 'applied' && opts.stage ? opts.stage : undefined,
      sort: opts.sort && opts.sort !== 'date' ? opts.sort : undefined,
      q: opts.q || undefined,
    },
    filters,
    opts.page
  );
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

export function buildFilterParams(
  base: Record<string, string | undefined>,
  filters: JobFilters,
  page?: number
): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v) p.set(k, v);
  }
  if (filters.minSalary) p.set('min_salary', String(filters.minSalary));
  if (filters.excludeNoSalary) p.set('exclude_no_salary', '1');
  for (const location of filters.locations) p.append('location', location);
  if (filters.locationRadius) p.set('radius', String(filters.locationRadius));
  if (filters.workType) p.set('work_type', filters.workType);
  if (filters.recencyDays) {
    const recency = RECENCY_OPTIONS.find((o) => o.days === filters.recencyDays);
    if (recency?.id) p.set('recency', recency.id);
  }
  for (const cat of filters.categories) p.append('cat', cat);
  if (page && page > 1) p.set('page', String(page));
  return p;
}