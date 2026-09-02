/**
 * Resolve the daily digester module graph without running main().
 * Catches missing files / bad relative imports before Playwright / scrape.
 */
const modules = [
  '../lib/matching.js',
  '../lib/salary.js',
  '../src/db/supabase.js',
  '../src/email/digest.js',
  '../src/email/priority-alert.js',
  '../src/scrapers/remoteok.js',
  '../src/scrapers/remotive.js',
  '../src/scrapers/themuse.js',
  '../src/scrapers/weworkremotely.js',
  '../src/scrapers/hackernews.js',
  '../src/scrapers/usajobs.js',
  '../src/scrapers/dice.js',
  '../src/scrapers/jobspresso.js',
  '../src/scrapers/authenticjobs.js',
  '../src/scrapers/idealist.js',
  '../src/scrapers/workatastartup.js',
  '../src/scrapers/powertofly.js',
  '../src/scrapers/bdge.js',
  '../src/scrapers/nfl-priority.js',
  '../src/scrapers/priority/platforms.js',
  '../src/scrapers/job-page.js',
];

for (const spec of modules) {
  await import(spec);
  console.log(`ok ${spec}`);
}

console.log(`Smoke imports passed (${modules.length} modules)`);
