// The one file you'll touch regularly.
export default {
  // Default keywords for new digest profiles only — NOT used when scraping.
  // Scraping pulls full job catalogs; profiles filter what goes in your email.
  keywords: ['sports analyst', 'sports media', 'sports'],

  // Drop a job if ANY of these appear in the title (useful for filtering
  // seniority or roles you don't want). Leave empty to keep everything.
  excludeKeywords: [],

  // How far back to keep jobs when scraping.
  // Full backfill (npm run scrape:full): up to 42 days — matches board retention.
  // Daily run (npm start): auto-sizes to days since last scrape (+1 buffer), min 2, max 42.
  // Board display cap: 100,000 jobs (see BOARD_MAX_JOBS in src/db/supabase.js).
  maxJobAgeDays: 42,
  dailyMaxJobAgeDays: 2,

  // Flip sources on/off here. Each one is a file in src/scrapers/.
  sources: {
    remoteok: true,
    remotive: true,
    themuse: true,
    weworkremotely: true,
    hackernews: true,
    usajobs: true, // needs USAJOBS_API_KEY in .env
    dice: true,
    jobspresso: true,
    authenticjobs: true,
    idealist: true,
    workatastartup: true,
    powertofly: true,
    bdge: true,
    'nfl-priority': true, // NFL team career pages — pinned + alert email per team
    // Blocked or needs more work: remote.co (HTTP2), wellfound (403), welcometothejungle
  },

  email: {
    subjectPrefix: 'Job Hunt Digest',
  },
};
