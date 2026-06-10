import { createClient } from '@supabase/supabase-js';

let client;

export function getDb() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

/**
 * Inserts jobs, silently skipping ones we've already seen
 * (the (source, external_id) unique constraint handles dedupe).
 * Returns the number of new rows.
 */
export async function saveJobs(jobs) {
  if (!jobs.length) return 0;
  const rows = jobs.map((j) => ({
    source: j.source,
    external_id: j.externalId,
    title: j.title,
    company: j.company,
    location: j.location,
    url: j.url,
    salary: j.salary,
    description: j.description,
    matched_keywords: j.matchedKeywords,
    posted_at: j.postedAt,
  }));

  const { data, error } = await getDb()
    .from('jobs')
    .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  return data?.length ?? 0;
}

/** Jobs that haven't been included in a digest email yet. */
export async function getUnsentJobs() {
  const { data, error } = await getDb()
    .from('jobs')
    .select('*')
    .is('sent_at', null)
    .order('posted_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return data ?? [];
}

export async function markJobsSent(ids) {
  if (!ids.length) return;
  const { error } = await getDb()
    .from('jobs')
    .update({ sent_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw new Error(`Supabase update failed: ${error.message}`);
}
