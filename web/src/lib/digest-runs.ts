import { getDb } from './supabase';

export type DigestNotice = {
  status: 'failed' | 'success';
  summary: string;
  finishedAt: string | null;
  runUrl: string | null;
};

/** Latest finished digest, when it failed or a source reported a problem. */
export async function getLatestDigestNotice(): Promise<DigestNotice | null> {
  const { data, error } = await getDb()
    .from('digest_runs')
    .select('status, error_message, notices, github_run_url, finished_at')
    .neq('status', 'running')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const notices = ((data.notices as string[] | null) ?? []).filter(Boolean);
  if (data.status === 'success' && notices.length === 0) return null;

  const summary =
    data.status === 'failed'
      ? data.error_message || 'The digest failed without an error message.'
      : notices.join('\n');

  return {
    status: data.status === 'failed' ? 'failed' : 'success',
    summary: summary.slice(0, 1500),
    finishedAt: data.finished_at,
    runUrl: data.github_run_url,
  };
}
