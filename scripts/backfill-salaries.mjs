import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import { withExtractedSalary } from '../lib/salary.js';

loadEnv({ path: '.env' });
loadEnv({ path: 'web/.env.local', override: false });

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const db = createClient(url, key, { auth: { persistSession: false } });
const PAGE = 500;

let lastId = 0;
let updated = 0;
let scanned = 0;

while (true) {
  const { data, error } = await db
    .from('jobs')
    .select('id, salary, description, salary_min_annual, salary_max_annual')
    .eq('status', 'active')
    .is('salary_min_annual', null)
    .is('salary_max_annual', null)
    .gt('id', lastId)
    .order('id', { ascending: true })
    .limit(PAGE);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) break;
  lastId = rows[rows.length - 1].id;
  scanned += rows.length;

  const patches = [];
  for (const row of rows) {
    const next = withExtractedSalary(row);
    if (next.salary_min_annual == null && next.salary_max_annual == null) continue;
    patches.push({
      id: row.id,
      payload: {
        salary: next.salary,
        salary_raw: next.salary,
        salary_min_annual: next.salary_min_annual,
        salary_max_annual: next.salary_max_annual,
      },
    });
  }

  for (let i = 0; i < patches.length; i += 25) {
    const chunk = patches.slice(i, i + 25);
    const results = await Promise.all(
      chunk.map((patch) => db.from('jobs').update(patch.payload).eq('id', patch.id))
    );
    for (const result of results) {
      if (result.error) throw new Error(result.error.message);
    }
    updated += chunk.length;
  }

  console.log(`scanned ${scanned}, updated ${updated}, lastId ${lastId}`);
}

console.log(`done. scanned ${scanned} jobs missing annual salary, updated ${updated}`);
