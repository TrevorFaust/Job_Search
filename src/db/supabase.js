import { createClient } from '@supabase/supabase-js';
import { withExtractedSalary } from '../../lib/salary.js';
import { mergeJobRecords, isJunkTitle } from '../scrapers/utils.js';

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

const JOB_RETENTION_DAYS = 42; // 6 weeks on the board, then expired
export const BOARD_MAX_JOBS = 100_000;

/** When the scraper last wrote jobs (any source). Used to size the daily catch-up window. */
export async function getLastScrapeAt() {
  const db = getDb();

  const { data: state, error: stateErr } = await db
    .from('scraper_state')
    .select('value')
    .eq('key', 'last_scrape_at')
    .maybeSingle();
  if (!stateErr && state?.value) {
    return new Date(state.value);
  }
  if (stateErr) {
    console.warn(`Load last scrape time from scraper_state failed: ${stateErr.message}`);
  }

  // Fallback: newest row by PK (indexed). Avoids a full-table sort on created_at.
  const { data, error } = await db
    .from('jobs')
    .select('created_at')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`Load last scrape time failed: ${error.message} — using default window`);
    return null;
  }
  return data?.created_at ? new Date(data.created_at) : null;
}

/** Record a successful scrape so getLastScrapeAt stays O(1) as the jobs table grows. */
export async function recordScrapeAt(at = new Date()) {
  const iso = at.toISOString();
  const { error } = await getDb()
    .from('scraper_state')
    .upsert({ key: 'last_scrape_at', value: iso, updated_at: iso }, { onConflict: 'key' });
  if (error) console.warn(`Record last scrape time failed: ${error.message}`);
}

function applySalaryFields(row) {
  const next = withExtractedSalary(row);
  if (next.salary_min_annual == null && next.salary_max_annual == null) return;
  row.salary = next.salary;
  row.salary_raw = next.salary;
  row.salary_min_annual = next.salary_min_annual;
  row.salary_max_annual = next.salary_max_annual;
}

function jobRow(j) {
  const postedAt = j.postedAt ? new Date(j.postedAt) : new Date();
  const expiresAt = new Date(postedAt);
  expiresAt.setDate(expiresAt.getDate() + JOB_RETENTION_DAYS);

  const row = {
    source: j.source,
    external_id: j.externalId,
    title: j.title,
    company: j.company,
    location: j.location,
    url: j.url,
    salary: j.salary,
    salary_raw: j.salary,
    salary_min_annual: null,
    salary_max_annual: null,
    description: j.description,
    posted_at: j.postedAt,
    expires_at: expiresAt.toISOString(),
    status: 'active',
    is_special: Boolean(j.isSpecial),
  };
  applySalaryFields(row);
  return row;
}

/** Upsert scraped jobs. Returns map of "source:external_id" → db id. */
export async function saveJobs(jobs) {
  if (!jobs.length) return new Map();
  // Dedupe within a batch (e.g. USAJobs returns the same job for multiple keyword searches)
  const seen = new Map();
  for (const job of jobs) {
    const key = `${job.source}:${job.externalId}`;
    const prev = seen.get(key);
    seen.set(key, prev ? mergeJobRecords(prev, job) : job);
  }
  const rows = [...seen.values()].map(jobRow);

  const bySource = new Map();
  for (const row of rows) {
    if (!bySource.has(row.source)) bySource.set(row.source, []);
    bySource.get(row.source).push(row.external_id);
  }

  const existingRows = new Map();
  const CHUNK = 100;
  for (const [source, externalIds] of bySource) {
    for (let i = 0; i < externalIds.length; i += CHUNK) {
      const chunk = externalIds.slice(i, i + CHUNK);
      const { data, error } = await getDb()
        .from('jobs')
        .select('source, external_id, title, company, location, salary, salary_min_annual, salary_max_annual, posted_at, description')
        .eq('source', source)
        .in('external_id', chunk);
      if (error) throw new Error(`Load existing jobs failed: ${error.message}`);
      for (const row of data ?? []) {
        existingRows.set(`${row.source}:${row.external_id}`, row);
      }
    }
  }

  for (const row of rows) {
    const key = `${row.source}:${row.external_id}`;
    const existing = existingRows.get(key);
    if (!existing) continue;

    const existingDesc = existing.description ?? '';
    const incomingDesc = row.description ?? '';
    if (existingDesc.length > incomingDesc.length) row.description = existingDesc;

    if (isJunkTitle(row.title) && existing.title && !isJunkTitle(existing.title)) {
      row.title = existing.title;
    }
    if (!row.company && existing.company) row.company = existing.company;
    if (!row.location && existing.location) row.location = existing.location;
    if (!row.salary && existing.salary) row.salary = existing.salary;
    if (!row.posted_at && existing.posted_at) row.posted_at = existing.posted_at;
    applySalaryFields(row);
    if (row.salary_min_annual == null && existing.salary_min_annual != null) {
      row.salary_min_annual = existing.salary_min_annual;
      row.salary_max_annual = existing.salary_max_annual;
    }
  }

  const idMap = new Map();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await getDb()
      .from('jobs')
      .upsert(chunk, { onConflict: 'source,external_id' })
      .select('id, source, external_id');
    if (error) throw new Error(`Supabase insert failed: ${error.message}`);
    for (const row of data ?? []) {
      idMap.set(`${row.source}:${row.external_id}`, row.id);
    }
  }
  return idMap;
}

export async function expireOldJobs() {
  const now = new Date().toISOString();
  const db = getDb();
  const CHUNK = 500;

  while (true) {
    const { data, error } = await db
      .from('jobs')
      .select('id')
      .eq('status', 'active')
      .lt('expires_at', now)
      .limit(CHUNK);
    if (error) throw new Error(`Expire jobs failed: ${error.message}`);

    const ids = (data ?? []).map((r) => r.id);
    if (!ids.length) break;

    const { error: updErr } = await db.from('jobs').update({ status: 'expired' }).in('id', ids);
    if (updErr) throw new Error(`Expire jobs failed: ${updErr.message}`);
  }
}

/**
 * If the board exceeds BOARD_MAX_JOBS, expire oldest listings first —
 * 6-week bucket, then 5-week, and so on down to the newest week.
 */
export async function pruneBoardIfOverCapacity(maxJobs = BOARD_MAX_JOBS) {
  const db = getDb();

  const { count, error: countErr } = await db
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');
  if (countErr) throw new Error(`Count jobs failed: ${countErr.message}`);

  let excess = (count ?? 0) - maxJobs;
  if (excess <= 0) return;

  console.log(`Board has ${count} active jobs (cap ${maxJobs}); pruning ${excess} oldest…`);

  const weekBuckets = [
    { minDays: 35, maxDays: 42 },
    { minDays: 28, maxDays: 35 },
    { minDays: 21, maxDays: 28 },
    { minDays: 14, maxDays: 21 },
    { minDays: 7, maxDays: 14 },
    { minDays: 0, maxDays: 7 },
  ];

  for (const { minDays, maxDays } of weekBuckets) {
    if (excess <= 0) break;

    const now = Date.now();
    const olderThan = new Date(now - minDays * 86400000).toISOString();
    const youngerThan = new Date(now - maxDays * 86400000).toISOString();

    const { data, error } = await db
      .from('jobs')
      .select('id')
      .eq('status', 'active')
      .gte('posted_at', youngerThan)
      .lt('posted_at', olderThan)
      .order('posted_at', { ascending: true })
      .limit(excess);

    if (error) throw new Error(`Prune bucket failed: ${error.message}`);

    const ids = (data ?? []).map((r) => r.id);
    if (!ids.length) continue;

    const { error: updErr } = await db.from('jobs').update({ status: 'expired' }).in('id', ids);
    if (updErr) throw new Error(`Prune update failed: ${updErr.message}`);

    excess -= ids.length;
    console.log(`  Pruned ${ids.length} jobs (${maxDays}–${minDays} days old)`);
  }

  if (excess > 0) {
    const { data, error } = await db
      .from('jobs')
      .select('id')
      .eq('status', 'active')
      .is('posted_at', null)
      .order('created_at', { ascending: true })
      .limit(excess);

    if (error) throw new Error(`Prune null-dated failed: ${error.message}`);

    const ids = (data ?? []).map((r) => r.id);
    if (ids.length) {
      await db.from('jobs').update({ status: 'expired' }).in('id', ids);
      console.log(`  Pruned ${ids.length} undated jobs by created_at`);
    }
  }
}

export async function getActiveProfiles() {
  const { data, error } = await getDb()
    .from('search_profiles')
    .select('*, subscribers!inner(id, email, timezone)')
    .eq('active', true);
  if (error) throw new Error(`Load profiles failed: ${error.message}`);
  return data ?? [];
}

export async function upsertProfileMatch(profileId, jobId, matchedKeywords) {
  const { error } = await getDb()
    .from('profile_job_matches')
    .upsert(
      { profile_id: profileId, job_id: jobId, matched_keywords: matchedKeywords },
      { onConflict: 'profile_id,job_id', ignoreDuplicates: true }
    );
  if (error) throw new Error(`Match insert failed: ${error.message}`);
}

export async function getUnsentMatchesForProfiles(profileIds) {
  if (!profileIds.length) return [];
  const { data, error } = await getDb()
    .from('profile_job_matches')
    .select('*, jobs(*), search_profiles(id, name, subscriber_id)')
    .in('profile_id', profileIds)
    .is('emailed_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Load unsent matches failed: ${error.message}`);
  return data ?? [];
}

export async function markMatchesEmailed(matchIds) {
  if (!matchIds.length) return;
  const { error } = await getDb()
    .from('profile_job_matches')
    .update({ emailed_at: new Date().toISOString() })
    .in('id', matchIds);
  if (error) throw new Error(`Mark emailed failed: ${error.message}`);
}

export async function updateProfileLastSent(profileIds) {
  if (!profileIds.length) return;
  const { error } = await getDb()
    .from('search_profiles')
    .update({ last_sent_at: new Date().toISOString() })
    .in('id', profileIds);
  if (error) throw new Error(`Update last_sent failed: ${error.message}`);
}

/** Bootstrap a subscriber + default profile from env/config for first run. */
export async function ensureDefaultSubscriber({ email, keywords, excludeKeywords }) {
  const { data: existing } = await getDb()
    .from('subscribers')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: sub, error: subErr } = await getDb()
    .from('subscribers')
    .insert({ email })
    .select('id, edit_token')
    .single();
  if (subErr) throw new Error(`Create subscriber failed: ${subErr.message}`);

  const { error: profErr } = await getDb().from('search_profiles').insert({
    subscriber_id: sub.id,
    name: 'Default',
    keywords,
    exclude_keywords: excludeKeywords,
    frequency: 'daily',
  });
  if (profErr) throw new Error(`Create profile failed: ${profErr.message}`);

  console.log(`Created subscriber. Settings URL token: ${sub.edit_token}`);
  return sub.id;
}

export async function getUnnotifiedSpecialJobs() {
  const { data, error } = await getDb()
    .from('jobs')
    .select('id, source, title, url')
    .eq('is_special', true)
    .eq('status', 'active')
    .is('special_notified_at', null);
  if (error) throw new Error(`Load unnotified special jobs failed: ${error.message}`);
  return data ?? [];
}

export async function markSpecialJobsNotified(jobIds) {
  if (!jobIds.length) return;
  const { error } = await getDb()
    .from('jobs')
    .update({ special_notified_at: new Date().toISOString() })
    .in('id', jobIds);
  if (error) throw new Error(`Mark special jobs notified failed: ${error.message}`);
}
