import { getDb } from './supabase';
import { applyJobFiltersAsync, paginate, sortJobs, BOARD_SCAN_LIMIT, type JobFilters } from './filters';
import { filterByCategories } from './categories';
import { parseFitLevel, parseFitScore } from './fit-level';
import { hydrateFitLevels } from './job-fit';
import type { Job, JobView, PaginatedJobs, SortKey } from './queries';
import { manualJobToBoardView } from './manual-jobs';
import type { ManualJob } from './manual-jobs';

export const APPLICATION_STAGES = ['applied', 'interviewing', 'rejected', 'offered'] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export type JobApplication = {
  id: string;
  subscriber_id: string;
  job_id: number | null;
  manual_job_id: string | null;
  stage: ApplicationStage;
  tailoring_session_id: string | null;
  notes: string;
  interview_prep: Record<string, unknown>;
  follow_up_contacts?: Record<string, unknown>;
  applied_at: string;
  updated_at: string;
};

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: 'Applied',
  interviewing: 'Interviewing',
  rejected: 'Rejected',
  offered: 'Offered',
};

export function normalizeApplicationStage(value: string | undefined): ApplicationStage | undefined {
  if (value && APPLICATION_STAGES.includes(value as ApplicationStage)) {
    return value as ApplicationStage;
  }
  return undefined;
}

export type JobBoardExclusions = {
  scrapedIds: Set<number>;
  manualIds: Set<string>;
};

export type AppliedJobExclusions = JobBoardExclusions;

export function mergeJobBoardExclusions(...sets: JobBoardExclusions[]): JobBoardExclusions {
  const scrapedIds = new Set<number>();
  const manualIds = new Set<string>();
  for (const set of sets) {
    for (const id of set.scrapedIds) scrapedIds.add(id);
    for (const id of set.manualIds) manualIds.add(id);
  }
  return { scrapedIds, manualIds };
}

export async function getAppliedJobExclusions(subscriberId: string): Promise<AppliedJobExclusions> {
  const { data, error } = await getDb()
    .from('job_applications')
    .select('job_id, manual_job_id')
    .eq('subscriber_id', subscriberId);

  if (error) throw error;

  const scrapedIds = new Set<number>();
  const manualIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.job_id != null) scrapedIds.add(row.job_id as number);
    if (row.manual_job_id) manualIds.add(row.manual_job_id as string);
  }
  return { scrapedIds, manualIds };
}

export async function getDismissedJobExclusions(subscriberId: string): Promise<JobBoardExclusions> {
  const { data, error } = await getDb()
    .from('dismissed_jobs')
    .select('job_id, manual_job_id')
    .eq('subscriber_id', subscriberId);

  if (error) throw error;

  const scrapedIds = new Set<number>();
  const manualIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.job_id != null) scrapedIds.add(row.job_id as number);
    if (row.manual_job_id) manualIds.add(row.manual_job_id as string);
  }
  return { scrapedIds, manualIds };
}

/** @deprecated Use getAppliedJobExclusions */
export async function getAppliedJobIds(subscriberId: string): Promise<Set<number>> {
  const { scrapedIds } = await getAppliedJobExclusions(subscriberId);
  return scrapedIds;
}

function filterBySearch(jobs: JobView[], q?: string) {
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

export async function getAppliedJobs(
  subscriberId: string,
  sort: SortKey,
  page: number,
  q?: string,
  filters?: JobFilters,
  stage?: ApplicationStage
): Promise<PaginatedJobs> {
  const jobs: JobView[] = [];
  const batchSize = 1000;
  const max = Math.min(BOARD_SCAN_LIMIT, 2_000);

  while (jobs.length < max) {
    const from = jobs.length;
    const to = Math.min(from + batchSize - 1, max - 1);

    let query = getDb()
      .from('job_applications')
      .select('stage, applied_at, interview_prep, tailoring_sessions(gap_analysis), jobs(*), manual_jobs(*)')
      .eq('subscriber_id', subscriberId)
      .order('applied_at', { ascending: false });

    if (stage) query = query.eq('stage', stage);

    const { data, error } = await query.range(from, to);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data as Record<string, unknown>[]) {
      const interviewPrep = (row.interview_prep as Record<string, unknown>) ?? {};
      const tailoringSession = row.tailoring_sessions as { gap_analysis?: unknown } | null;
      const fitLevel = parseFitLevel(tailoringSession?.gap_analysis);
      const fitScore = parseFitScore(tailoringSession?.gap_analysis);
      const manualJob = row.manual_jobs as ManualJob | null;
      if (manualJob) {
        jobs.push({
          ...manualJobToBoardView(manualJob),
          application_stage: row.stage as ApplicationStage,
          applied_at: row.applied_at as string,
          interview_prep: interviewPrep,
          fit_level: fitLevel,
          fit_score: fitScore,
        });
        continue;
      }

      const job = row.jobs as Job | null;
      if (!job || job.status !== 'active') continue;
      jobs.push({
        ...job,
        application_stage: row.stage as ApplicationStage,
        applied_at: row.applied_at as string,
        interview_prep: interviewPrep,
        fit_level: fitLevel,
        fit_score: fitScore,
      });
    }

    if (data.length < batchSize) break;
  }

  let filtered = filterBySearch(jobs, q);
  if (filters) filtered = await applyJobFiltersAsync(filtered, filters);
  if (filters?.categories.length) filtered = filterByCategories(filtered, filters.categories);
  filtered = sortJobs(filtered, sort, { pinSpecial: false });
  const paginated = toPaginated(filtered, page);
  paginated.jobs = await hydrateFitLevels(subscriberId, paginated.jobs);
  return paginated;
}

export async function getApplicationForJob(subscriberId: string, jobId: number) {
  const { data, error } = await getDb()
    .from('job_applications')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .eq('job_id', jobId)
    .maybeSingle();

  if (error) throw error;
  return data as JobApplication | null;
}

export async function getApplicationForManualJob(subscriberId: string, manualJobId: string) {
  const { data, error } = await getDb()
    .from('job_applications')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .eq('manual_job_id', manualJobId)
    .maybeSingle();

  if (error) throw error;
  return data as JobApplication | null;
}
