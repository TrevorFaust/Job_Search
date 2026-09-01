import 'dotenv/config';
import config from '../config/config.js';
import { isTooOld, truncate, isPublishableJob } from './scrapers/utils.js';
import { profileMatchesJob, isDueForDigest } from '../lib/matching.js';
import { parseSalary, passesSalaryFilter } from '../lib/salary.js';
import {
  saveJobs,
  expireOldJobs,
  pruneBoardIfOverCapacity,
  getActiveProfiles,
  getLastScrapeAt,
  recordScrapeAt,
  upsertProfileMatch,
  getUnsentMatchesForProfiles,
  markMatchesEmailed,
  updateProfileLastSent,
  ensureDefaultSubscriber,
  getUnnotifiedSpecialJobs,
  markSpecialJobsNotified,
} from './db/supabase.js';
import { sendDigest } from './email/digest.js';
import { sendPriorityAlert } from './email/priority-alert.js';

import * as remoteok from './scrapers/remoteok.js';
import * as remotive from './scrapers/remotive.js';
import * as themuse from './scrapers/themuse.js';
import * as weworkremotely from './scrapers/weworkremotely.js';
import * as hackernews from './scrapers/hackernews.js';
import * as usajobs from './scrapers/usajobs.js';
import * as dice from './scrapers/dice.js';
import * as jobspresso from './scrapers/jobspresso.js';
import * as authenticjobs from './scrapers/authenticjobs.js';
import * as idealist from './scrapers/idealist.js';
import * as workatastartup from './scrapers/workatastartup.js';
import * as powertofly from './scrapers/powertofly.js';
import * as bdge from './scrapers/bdge.js';
import * as nflPriority from './scrapers/nfl-priority.js';

const PRIORITY_ALERT_META = {
  [bdge.name]: { alertLabel: bdge.alertLabel, alertUrl: bdge.alertUrl },
  ...nflPriority.alertMeta,
};

const ALL_SCRAPERS = [
  remoteok,
  remotive,
  themuse,
  weworkremotely,
  hackernews,
  usajobs,
  dice,
  jobspresso,
  authenticjobs,
  idealist,
  workatastartup,
  powertofly,
  bdge,
  nflPriority,
];

const DRY_RUN = process.env.DRY_RUN === '1';
const SCRAPE_MODE = process.env.SCRAPE_MODE === 'full' ? 'full' : 'daily';

async function resolveMaxJobAgeDays() {
  if (process.env.MAX_JOB_AGE_DAYS) {
    return { days: Number(process.env.MAX_JOB_AGE_DAYS), reason: 'MAX_JOB_AGE_DAYS override' };
  }
  if (SCRAPE_MODE === 'full') {
    return { days: config.maxJobAgeDays, reason: 'full backfill' };
  }

  const lastScrape = await getLastScrapeAt();
  if (!lastScrape) {
    return { days: config.dailyMaxJobAgeDays, reason: 'first run' };
  }

  const daysSince = (Date.now() - lastScrape.getTime()) / (24 * 60 * 60 * 1000);
  const days = Math.min(
    config.maxJobAgeDays,
    Math.max(config.dailyMaxJobAgeDays, Math.ceil(daysSince) + 1)
  );
  const lastLabel = lastScrape.toISOString().slice(0, 10);
  return { days, reason: `${Math.floor(daysSince)} days since last scrape (${lastLabel})` };
}

async function scrapeAll(maxJobAgeDays) {
  const scrapers = ALL_SCRAPERS.filter((s) => config.sources[s.name]);
  const allJobs = [];

  for (const scraper of scrapers) {
    try {
      const jobs = await scraper.scrape({ mode: SCRAPE_MODE });
      const publishable = jobs.filter(isPublishableJob);
      const fresh = publishable.filter((j) => !isTooOld(j, maxJobAgeDays));
      const dropped = jobs.length - fresh.length;
      const junk = jobs.length - publishable.length;
      const suffix = [
        dropped ? `${dropped} older than ${maxJobAgeDays}d` : '',
        junk ? `${junk} incomplete` : '',
      ]
        .filter(Boolean)
        .join(', ');
      console.log(
        `  [${scraper.name}] ${jobs.length} scraped → ${fresh.length} kept${suffix ? `, ${suffix}` : ''}`
      );
      allJobs.push(...fresh);
    } catch (err) {
      console.error(`  [${scraper.name}] FAILED: ${err.message}`);
    }
  }
  return allJobs;
}

async function main() {
  await expireOldJobs();

  let profiles = await getActiveProfiles();
  if (!profiles.length && process.env.EMAIL_TO) {
    await ensureDefaultSubscriber({
      email: process.env.EMAIL_TO,
      keywords: config.keywords,
      excludeKeywords: config.excludeKeywords,
    });
    profiles = await getActiveProfiles();
  }

  const { days: maxJobAgeDays, reason: ageReason } = await resolveMaxJobAgeDays();
  console.log(`Mode: ${SCRAPE_MODE} · keeping jobs posted within ${maxJobAgeDays} days (${ageReason})`);
  console.log(`Running ${ALL_SCRAPERS.filter((s) => config.sources[s.name]).length} scrapers`);
  console.log('Sources return mixed-age catalogs — only the age window is saved. Filter on the board.\n');

  const scraped = await scrapeAll(maxJobAgeDays);
  console.log(`\n${scraped.length} total jobs scraped`);

  if (DRY_RUN) {
    for (const p of profiles) {
      let count = 0;
      for (const job of scraped) {
        const hits = profileMatchesJob(job, p);
        if (hits && passesSalaryFilter({ ...job, salary_min_annual: null, salary_max_annual: null }, p)) count++;
      }
      console.log(`  [${p.name}] would match ~${count} jobs`);
    }
    return;
  }

  const idMap = await saveJobs(scraped);
  console.log(`Saved/updated ${idMap.size} jobs in database`);
  await recordScrapeAt();

  const unnotifiedSpecial = await getUnnotifiedSpecialJobs();
  if (unnotifiedSpecial.length) {
    const alertTo = process.env.EMAIL_TO;
    if (alertTo) {
      const bySource = new Map();
      for (const job of unnotifiedSpecial) {
        if (!bySource.has(job.source)) bySource.set(job.source, []);
        bySource.get(job.source).push(job);
      }

      for (const [source, jobs] of bySource) {
        const meta = PRIORITY_ALERT_META[source];
        await sendPriorityAlert({
          to: alertTo,
          label: meta?.alertLabel ?? jobs[0].company ?? source,
          url: meta?.alertUrl ?? jobs[0].url,
          roleCount: jobs.length,
        });
        await markSpecialJobsNotified(jobs.map((j) => j.id));
        console.log(
          `Priority alert sent to ${alertTo} for ${source} (${jobs.length} new listing(s))`
        );
      }
    } else {
      console.log(
        `${unnotifiedSpecial.length} new priority listing(s) — EMAIL_TO not set, skipping alert`
      );
    }
  }

  await pruneBoardIfOverCapacity();

  for (const profile of profiles) {
    let matched = 0;
    for (const job of scraped) {
      const hits = profileMatchesJob(job, profile);
      if (!hits) continue;

      const sal = parseSalary(job.salary);
      const jobWithSalary = {
        ...job,
        salary_min_annual: sal?.min ?? null,
        salary_max_annual: sal?.max ?? null,
      };
      if (!passesSalaryFilter(jobWithSalary, profile)) continue;

      const jobId = idMap.get(`${job.source}:${job.externalId}`);
      if (!jobId) continue;

      await upsertProfileMatch(profile.id, jobId, hits);
      matched++;
    }
    console.log(`  [${profile.name}] ${matched} profile matches`);
  }

  // Group due profiles by subscriber and send one email per subscriber
  const bySubscriber = new Map();
  for (const profile of profiles) {
    if (!isDueForDigest(profile)) continue;
    const subId = profile.subscribers.id;
    if (!bySubscriber.has(subId)) {
      bySubscriber.set(subId, { email: profile.subscribers.email, profileIds: [] });
    }
    bySubscriber.get(subId).profileIds.push(profile.id);
  }

  for (const [, { email, profileIds }] of bySubscriber) {
    const matches = await getUnsentMatchesForProfiles(profileIds);
    if (!matches.length) {
      console.log(`Nothing new to send to ${email}`);
      continue;
    }

    const jobs = matches.map((m) => ({
      ...m.jobs,
      matched_keywords: m.matched_keywords,
      profile_name: m.search_profiles.name,
      match_id: m.id,
    }));

    await sendDigest(jobs, { to: email });
    await markMatchesEmailed(matches.map((m) => m.id));
    await updateProfileLastSent(profileIds);
    console.log(`Digest sent to ${email} with ${matches.length} jobs`);
  }

  if (!bySubscriber.size) {
    console.log('No profiles due for digest today.');
  }
}

main().catch((err) => {
  console.error('Run failed:', err);
  process.exit(1);
});
