import { parseFitLevel, parseFitScore, type FitLevel } from './fit-level';
import { getDb } from './supabase';
import type { JobView } from './queries';

type FitMeta = { fit_level?: FitLevel; fit_score?: number };

/** Attach fit_level / fit_score from the latest tailoring session gap analysis for each job. */
export async function hydrateFitLevels(subscriberId: string, jobs: JobView[]): Promise<JobView[]> {
  const missingScrapedIds = [
    ...new Set(
      jobs
        .filter((j) => (!j.fit_level || j.fit_score == null) && !j.isManual)
        .map((j) => j.id)
    ),
  ];
  const missingManualIds = [
    ...new Set(
      jobs
        .filter(
          (j) => (!j.fit_level || j.fit_score == null) && j.isManual && j.manual_job_id
        )
        .map((j) => j.manual_job_id!)
    ),
  ];

  if (!missingScrapedIds.length && !missingManualIds.length) return jobs;

  const fitByScrapedId = new Map<number, FitMeta>();
  const fitByManualId = new Map<string, FitMeta>();

  if (missingScrapedIds.length) {
    const { data, error } = await getDb()
      .from('tailoring_sessions')
      .select('job_id, gap_analysis, created_at')
      .eq('subscriber_id', subscriberId)
      .in('job_id', missingScrapedIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    for (const row of data ?? []) {
      const jobId = row.job_id as number;
      if (fitByScrapedId.has(jobId)) continue;
      const fitLevel = parseFitLevel(row.gap_analysis);
      const fitScore = parseFitScore(row.gap_analysis);
      if (fitLevel || fitScore != null) {
        fitByScrapedId.set(jobId, { fit_level: fitLevel, fit_score: fitScore });
      }
    }
  }

  if (missingManualIds.length) {
    const { data, error } = await getDb()
      .from('tailoring_sessions')
      .select('manual_job_id, gap_analysis, created_at')
      .eq('subscriber_id', subscriberId)
      .in('manual_job_id', missingManualIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    for (const row of data ?? []) {
      const manualJobId = row.manual_job_id as string;
      if (fitByManualId.has(manualJobId)) continue;
      const fitLevel = parseFitLevel(row.gap_analysis);
      const fitScore = parseFitScore(row.gap_analysis);
      if (fitLevel || fitScore != null) {
        fitByManualId.set(manualJobId, { fit_level: fitLevel, fit_score: fitScore });
      }
    }
  }

  return jobs.map((job) => {
    if (job.fit_level && job.fit_score != null) return job;
    const meta = job.isManual
      ? job.manual_job_id
        ? fitByManualId.get(job.manual_job_id)
        : undefined
      : fitByScrapedId.get(job.id);
    if (!meta) return job;
    return {
      ...job,
      fit_level: job.fit_level ?? meta.fit_level,
      fit_score: job.fit_score ?? meta.fit_score,
    };
  });
}
