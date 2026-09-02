import { cache } from 'react';
import { estimateBoardFit } from './board-fit';
import { getCandidateExperienceCorpus } from './candidate-corpus';
import { getDb } from './supabase';
import type { JobView } from './queries';

const CORPUS_TTL_MS = 60_000;
const corpusBySubscriber = new Map<
  string,
  { expires: number; value: Awaited<ReturnType<typeof getCandidateExperienceCorpus>> }
>();

async function loadCorpus(subscriberId: string) {
  const now = Date.now();
  const hit = corpusBySubscriber.get(subscriberId);
  if (hit && hit.expires > now) return hit.value;
  const value = await getCandidateExperienceCorpus(subscriberId);
  corpusBySubscriber.set(subscriberId, { expires: now + CORPUS_TTL_MS, value });
  return value;
}

/** Request-local dedupe (RSC) plus a short TTL so API board loads don't refetch every tab. */
const getCachedCorpus = cache(loadCorpus);

/**
 * Attach a stable board fit from the candidate experience corpus.
 * Does NOT use tailor gap_analysis — that score is for the wizard only and was
 * causing badges to drop after analysis.
 */
export async function hydrateFitLevels(subscriberId: string, jobs: JobView[]): Promise<JobView[]> {
  if (!jobs.length) return jobs;

  const corpus = await getCachedCorpus(subscriberId);
  if (!corpus) {
    return jobs.map((job) =>
      job.fit_level && job.fit_score != null
        ? { ...job, fit_estimated: job.fit_estimated ?? true }
        : job
    );
  }

  return jobs.map((job) => {
    const estimate = estimateBoardFit(
      {
        title: job.title,
        description: job.description?.slice(0, 5000) ?? null,
      },
      corpus
    );
    return {
      ...job,
      fit_level: estimate.fit_level,
      fit_score: estimate.fit_score,
      fit_estimated: true,
    };
  });
}

/** Optional: read tailor gap fit for UI that wants analysis-only scores (not the board). */
export async function getTailorFitForJob(
  subscriberId: string,
  opts: { jobId?: number; manualJobId?: string }
): Promise<{ fit_level?: string; fit_score?: number } | null> {
  let query = getDb()
    .from('tailoring_sessions')
    .select('gap_analysis, created_at')
    .eq('subscriber_id', subscriberId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (opts.manualJobId) query = query.eq('manual_job_id', opts.manualJobId);
  else if (opts.jobId != null) query = query.eq('job_id', opts.jobId);
  else return null;

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data?.gap_analysis) return null;

  const gap = data.gap_analysis as { fit_level?: string; fit_score?: number };
  return {
    fit_level: gap.fit_level,
    fit_score: gap.fit_score,
  };
}
