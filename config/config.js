// The one file you'll touch regularly. Change keywords to switch job-hunt modes.
export default {
  // A job matches if ANY keyword appears in its title, company, or description.
  // Matching is case-insensitive and respects word boundaries
  // (so "sports" will NOT match "esports").
  keywords: ['sports analyst', 'sports media', 'sports'],

  // Drop a job if ANY of these appear in the title (useful for filtering
  // seniority or roles you don't want). Leave empty to keep everything.
  excludeKeywords: [],

  // Ignore jobs posted more than this many days ago.
  maxJobAgeDays: 14,

  // Flip sources on/off here. Each one is a file in src/scrapers/.
  sources: {
    remoteok: true,
    remotive: true,
    themuse: true,
    arbeitnow: true,
    weworkremotely: true,
    hackernews: true,
    usajobs: true, // needs USAJOBS_API_KEY in .env
    dice: true, // uses Playwright (a real browser) - slowest, most fragile
  },

  email: {
    subjectPrefix: 'Job Hunt Digest',
  },
};
