import 'dotenv/config';
import config from '../config/config.js';
import { matchKeywords, isExcluded, isTooOld } from './scrapers/utils.js';
import { saveJobs, getUnsentJobs, markJobsSent } from './db/supabase.js';
import { sendDigest } from './email/digest.js';

import * as remoteok from './scrapers/remoteok.js';
import * as remotive from './scrapers/remotive.js';
import * as themuse from './scrapers/themuse.js';
import * as arbeitnow from './scrapers/arbeitnow.js';
import * as weworkremotely from './scrapers/weworkremotely.js';
import * as hackernews from './scrapers/hackernews.js';
import * as usajobs from './scrapers/usajobs.js';
import * as dice from './scrapers/dice.js';

const ALL_SCRAPERS = [
  remoteok,
  remotive,
  themuse,
  arbeitnow,
  weworkremotely,
  hackernews,
  usajobs,
  dice,
];

const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  const scrapers = ALL_SCRAPERS.filter((s) => config.sources[s.name]);
  console.log(`Running ${scrapers.length} scrapers for keywords: ${config.keywords.join(', ')}\n`);

  // 1. Scrape everything (one source failing shouldn't kill the run)
  const matched = [];
  for (const scraper of scrapers) {
    try {
      const jobs = await scraper.scrape({ keywords: config.keywords });
      const kept = [];
      for (const job of jobs) {
        if (isTooOld(job, config.maxJobAgeDays)) continue;
        if (isExcluded(job, config.excludeKeywords)) continue;
        const hits = matchKeywords(job, config.keywords);
        if (!hits.length) continue;
        kept.push({ ...job, matchedKeywords: hits });
      }
      console.log(`  [${scraper.name}] ${jobs.length} jobs scraped, ${kept.length} matched`);
      matched.push(...kept);
    } catch (err) {
      console.error(`  [${scraper.name}] FAILED: ${err.message}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\nDRY RUN - would save ${matched.length} matched jobs:`);
    for (const j of matched) {
      console.log(`  - [${j.source}] ${j.title} @ ${j.company ?? '?'} (${j.url})`);
    }
    return;
  }

  // 2. Save to Supabase (dedupes against everything we've seen before)
  const newCount = await saveJobs(matched);
  console.log(`\n${matched.length} matched jobs, ${newCount} new (rest already seen)`);

  // 3. Email everything that hasn't been sent yet
  const unsent = await getUnsentJobs();
  if (!unsent.length) {
    console.log('Nothing new to send today.');
    return;
  }

  await sendDigest(unsent);
  await markJobsSent(unsent.map((j) => j.id));
  console.log(`Digest sent to ${process.env.EMAIL_TO} with ${unsent.length} jobs.`);
}

main().catch((err) => {
  console.error('Run failed:', err);
  process.exit(1);
});
