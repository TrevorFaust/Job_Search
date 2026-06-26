import { getDb } from './supabase';
import { analyzeKeywords, type KeywordAnalysis } from './resume-keywords';
import type { GapAnalysis, TailorAnswer, TailorQuestion } from './llm';
import type { Job } from './queries';
import type { ManualJob, ManualJobWithSession, TailorJobView } from './manual-jobs';
import { manualJobToView } from './manual-jobs';

import type { ResumeFormatMeta } from './resume-structure';

export type Resume = {
  id: string;
  subscriber_id: string;
  label: string;
  content_text: string;
  source_filename: string | null;
  format_meta: ResumeFormatMeta;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TailoringSession = {
  id: string;
  subscriber_id: string;
  job_id: number | null;
  manual_job_id: string | null;
  resume_id: string;
  status: 'draft' | 'analyzing' | 'questioning' | 'generating' | 'done' | 'failed';
  keyword_analysis: KeywordAnalysis;
  gap_analysis: GapAnalysis | Record<string, never>;
  questions: TailorQuestion[];
  answers: TailorAnswer[];
  extra_context: string;
  page_preference: 'one' | 'two';
  output_text: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function scrapedJobToView(job: Job): TailorJobView {
  return {
    id: String(job.id),
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    salary: job.salary,
    description: job.description ?? '',
    source: job.source,
    isManual: false,
    created_at: job.created_at,
  };
}

export async function getActiveResume(subscriberId: string): Promise<Resume | null> {
  const { data, error } = await getDb()
    .from('resumes')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as Resume | null;
}

export async function getJobById(jobId: number): Promise<Job | null> {
  const { data, error } = await getDb()
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data as Job | null;
}

export async function getManualJobById(
  jobId: string,
  subscriberId: string
): Promise<ManualJob | null> {
  const { data, error } = await getDb()
    .from('manual_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('subscriber_id', subscriberId)
    .maybeSingle();
  if (error) throw error;
  return data as ManualJob | null;
}

export async function resolveJobForSession(
  session: TailoringSession,
  subscriberId: string
): Promise<TailorJobView | null> {
  if (session.manual_job_id) {
    const manual = await getManualJobById(session.manual_job_id, subscriberId);
    return manual ? manualJobToView(manual) : null;
  }
  if (session.job_id) {
    const job = await getJobById(session.job_id);
    return job?.description ? scrapedJobToView(job) : null;
  }
  return null;
}

export async function getTailoringSession(
  sessionId: string,
  subscriberId: string
): Promise<TailoringSession | null> {
  const { data, error } = await getDb()
    .from('tailoring_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('subscriber_id', subscriberId)
    .maybeSingle();
  if (error) throw error;
  return data as TailoringSession | null;
}

async function getLatestSessionForScrapedJob(
  subscriberId: string,
  jobId: number
): Promise<TailoringSession | null> {
  const { data, error } = await getDb()
    .from('tailoring_sessions')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as TailoringSession | null;
}

async function getLatestSessionForManualJob(
  subscriberId: string,
  manualJobId: string
): Promise<TailoringSession | null> {
  const { data, error } = await getDb()
    .from('tailoring_sessions')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .eq('manual_job_id', manualJobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as TailoringSession | null;
}

export async function upsertResume(
  subscriberId: string,
  contentText: string,
  sourceFilename?: string | null,
  label = 'Master resume',
  formatMeta: ResumeFormatMeta = {
    sections: [],
    sectionOrder: [],
    bulletStyle: 'none',
    lineCount: 0,
    sampleHeaders: [],
  }
): Promise<Resume> {
  const db = getDb();
  await db.from('resumes').update({ is_active: false }).eq('subscriber_id', subscriberId);

  const { data, error } = await db
    .from('resumes')
    .insert({
      subscriber_id: subscriberId,
      content_text: contentText,
      source_filename: sourceFilename ?? null,
      format_meta: formatMeta,
      label,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Resume;
}

export async function createManualJob(
  subscriberId: string,
  input: {
    title: string;
    company?: string;
    location?: string;
    url?: string;
    salary?: string;
    description: string;
  }
): Promise<ManualJob> {
  const { data, error } = await getDb()
    .from('manual_jobs')
    .insert({
      subscriber_id: subscriberId,
      title: input.title.trim(),
      company: input.company?.trim() || null,
      location: input.location?.trim() || null,
      url: input.url?.trim() || null,
      salary: input.salary?.trim() || null,
      description: input.description.trim(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ManualJob;
}

export async function listManualJobs(subscriberId: string): Promise<ManualJobWithSession[]> {
  const { data: jobs, error } = await getDb()
    .from('manual_jobs')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: sessions, error: sessionError } = await getDb()
    .from('tailoring_sessions')
    .select('id, manual_job_id, status, output_text, created_at')
    .eq('subscriber_id', subscriberId)
    .not('manual_job_id', 'is', null)
    .order('created_at', { ascending: false });
  if (sessionError) throw sessionError;

  const latestByJob = new Map<string, { id: string; status: string; output_text: string | null }>();
  for (const s of sessions ?? []) {
    const key = s.manual_job_id as string;
    if (!latestByJob.has(key)) {
      latestByJob.set(key, {
        id: s.id,
        status: s.status,
        output_text: s.output_text,
      });
    }
  }

  return (jobs ?? []).map((job) => {
    const session = latestByJob.get(job.id);
    return {
      ...(job as ManualJob),
      session_id: session?.id ?? null,
      session_status: session?.status ?? null,
      has_output: !!session?.output_text,
    };
  });
}

export async function getOrCreateTailoringSession(
  subscriberId: string,
  jobId: number,
  resume: Resume,
  jobDescription: string
): Promise<TailoringSession> {
  const existing = await getLatestSessionForScrapedJob(subscriberId, jobId);
  if (existing && existing.resume_id === resume.id && existing.status !== 'failed') {
    return existing;
  }

  const keyword_analysis = analyzeKeywords(jobDescription, resume.content_text);
  const { data, error } = await getDb()
    .from('tailoring_sessions')
    .insert({
      subscriber_id: subscriberId,
      job_id: jobId,
      manual_job_id: null,
      resume_id: resume.id,
      status: 'draft',
      keyword_analysis,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as TailoringSession;
}

export async function getOrCreateManualTailoringSession(
  subscriberId: string,
  manualJobId: string,
  resume: Resume,
  jobDescription: string
): Promise<TailoringSession> {
  const existing = await getLatestSessionForManualJob(subscriberId, manualJobId);
  if (existing && existing.resume_id === resume.id && existing.status !== 'failed') {
    return existing;
  }

  const keyword_analysis = analyzeKeywords(jobDescription, resume.content_text);
  const { data, error } = await getDb()
    .from('tailoring_sessions')
    .insert({
      subscriber_id: subscriberId,
      job_id: null,
      manual_job_id: manualJobId,
      resume_id: resume.id,
      status: 'draft',
      keyword_analysis,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as TailoringSession;
}

export async function updateSession(
  sessionId: string,
  subscriberId: string,
  patch: Partial<
    Pick<
      TailoringSession,
      | 'status'
      | 'keyword_analysis'
      | 'gap_analysis'
      | 'questions'
      | 'answers'
      | 'extra_context'
      | 'page_preference'
      | 'output_text'
      | 'error_message'
    >
  >
) {
  const { error } = await getDb()
    .from('tailoring_sessions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('subscriber_id', subscriberId);
  if (error) throw error;
}
