'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from './supabase';
import { getSubscriberByToken } from './queries';
import {
  APPLICATION_STAGES,
  type ApplicationStage,
  normalizeApplicationStage,
} from './applications';

const COOKIE_NAME = 'jh_token';

async function requireSubscriber() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) throw new Error('Sign in required');
  const sub = await getSubscriberByToken(token);
  if (!sub) throw new Error('Invalid session');
  return sub;
}

function parseApplicationTarget(formData: FormData) {
  const manualJobIdRaw = formData.get('manualJobId');
  const manualJobId =
    typeof manualJobIdRaw === 'string' && manualJobIdRaw.trim() ? manualJobIdRaw.trim() : null;

  const jobIdRaw = formData.get('jobId');
  const hasScrapedJob = typeof jobIdRaw === 'string' && jobIdRaw.trim() !== '';
  const jobId = hasScrapedJob ? Number(jobIdRaw) : null;

  if (hasScrapedJob && !Number.isFinite(jobId)) throw new Error('Invalid job');
  if (manualJobId && hasScrapedJob) throw new Error('Invalid job target');
  if (!manualJobId && !hasScrapedJob) throw new Error('Invalid job');

  return { jobId: hasScrapedJob ? jobId! : null, manualJobId };
}

async function saveJobApplication(row: {
  subscriber_id: string;
  job_id: number | null;
  manual_job_id: string | null;
  stage: ApplicationStage;
  tailoring_session_id: string | null;
  applied_at: string;
  updated_at: string;
}) {
  const db = getDb();
  let lookup = db.from('job_applications').select('id').eq('subscriber_id', row.subscriber_id);

  lookup = row.manual_job_id
    ? lookup.eq('manual_job_id', row.manual_job_id)
    : lookup.eq('job_id', row.job_id!);

  const { data: existing, error: lookupError } = await lookup.maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await db
      .from('job_applications')
      .update({
        stage: row.stage,
        tailoring_session_id: row.tailoring_session_id,
        applied_at: row.applied_at,
        updated_at: row.updated_at,
      })
      .eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await db.from('job_applications').insert(row);
  if (error) throw error;
}

export async function markJobApplied(formData: FormData) {
  const sub = await requireSubscriber();
  const { jobId, manualJobId } = parseApplicationTarget(formData);

  const sessionId = formData.get('sessionId');
  const tailoringSessionId =
    typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;

  const now = new Date().toISOString();
  await saveJobApplication({
    subscriber_id: sub.id,
    job_id: jobId,
    manual_job_id: manualJobId,
    stage: 'applied',
    tailoring_session_id: tailoringSessionId,
    applied_at: now,
    updated_at: now,
  });

  revalidatePath('/');
  revalidatePath('/applications');
  if (jobId) {
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath(`/tailor/${jobId}`);
  }
  if (manualJobId) {
    revalidatePath(`/tailor/manual/${manualJobId}`);
  }

  redirect('/?view=applied');
}

export async function updateApplicationStage(formData: FormData) {
  const sub = await requireSubscriber();
  const { jobId, manualJobId } = parseApplicationTarget(formData);
  const stage = normalizeApplicationStage(String(formData.get('stage') ?? ''));

  if (!stage || !APPLICATION_STAGES.includes(stage)) throw new Error('Invalid stage');

  let query = getDb()
    .from('job_applications')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('subscriber_id', sub.id);

  query = manualJobId ? query.eq('manual_job_id', manualJobId) : query.eq('job_id', jobId!);

  const { error } = await query;
  if (error) throw error;

  revalidatePath('/');
  revalidatePath('/applications');
  if (jobId) revalidatePath(`/jobs/${jobId}`);
  if (manualJobId) revalidatePath(`/tailor/manual/${manualJobId}`);
}

export async function removeJobApplication(formData: FormData) {
  const sub = await requireSubscriber();
  const { jobId, manualJobId } = parseApplicationTarget(formData);

  let query = getDb().from('job_applications').delete().eq('subscriber_id', sub.id);
  query = manualJobId ? query.eq('manual_job_id', manualJobId) : query.eq('job_id', jobId!);

  const { error } = await query;
  if (error) throw error;

  revalidatePath('/');
  revalidatePath('/applications');
  if (jobId) revalidatePath(`/jobs/${jobId}`);
  if (manualJobId) revalidatePath(`/tailor/manual/${manualJobId}`);
}
