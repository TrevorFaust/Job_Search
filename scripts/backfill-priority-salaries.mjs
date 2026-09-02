import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { fetchJobPostingFromUrl } from '../src/scrapers/job-page.js';
import { withExtractedSalary } from '../lib/salary.js';

loadEnv({ path: '.env' });
loadEnv({ path: 'web/.env.local', override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

const db = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await db
  .from('jobs')
  .select('id, url, salary, description, salary_min_annual, salary_max_annual')
  .eq('status', 'active')
  .eq('is_special', true)
  .is('salary_min_annual', null)
  .is('salary_max_annual', null)
  .not('url', 'is', null);

if (error) throw new Error(error.message);

const jobs = data ?? [];
console.log(`priority jobs missing salary: ${jobs.length}`);

let updated = 0;
const concurrency = 5;
let next = 0;

async function worker() {
  while (next < jobs.length) {
    const i = next++;
    const job = jobs[i];
    try {
      const posting = await fetchJobPostingFromUrl(job.url);
      const merged = {
        ...job,
        description:
          posting.description.length > (job.description?.length ?? 0)
            ? posting.description
            : job.description,
        salary: job.salary || posting.salary,
      };
      const resolved = withExtractedSalary(merged);
      const descChanged = (resolved.description ?? '') !== (job.description ?? '');
      const salaryChanged =
        resolved.salary_min_annual != null || resolved.salary_max_annual != null;
      if (!descChanged && !salaryChanged) continue;

      const payload = {};
      if (descChanged) payload.description = resolved.description;
      if (salaryChanged) {
        payload.salary = resolved.salary;
        payload.salary_raw = resolved.salary;
        payload.salary_min_annual = resolved.salary_min_annual;
        payload.salary_max_annual = resolved.salary_max_annual;
      }
      const { error: updateError } = await db.from('jobs').update(payload).eq('id', job.id);
      if (updateError) throw new Error(updateError.message);
      updated++;
      if (salaryChanged) {
        console.log(`pay ${job.id} ${resolved.salary_min_annual}-${resolved.salary_max_annual}`);
      }
    } catch (err) {
      console.warn(`skip ${job.id}: ${err.message}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
console.log(`updated ${updated} of ${jobs.length} priority jobs`);
