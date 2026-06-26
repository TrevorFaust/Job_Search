import { truncateDescription } from './utils.js';
import {
  enrichShortDescriptions,
  launchBrowser,
  newPage,
  parseRelativePosted,
  scrapeDiceSearch,
} from './playwright/helpers.js';

export const name = 'dice';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** All US states + DC — one Dice search each so onsite jobs aren't metro-only. */
const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'District of Columbia',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
];

/** Dice caps ~500 unique jobs per query — rotate keyword prefixes for coverage. */
function nationalSearches(postedDate) {
  return [
    { q: '', postedDate, location: '' },
    ...ALPHABET.map((q) => ({ q, postedDate, location: '' })),
  ];
}

/** One recent-jobs search per state (Connecticut, Florida, Tennessee, etc.). */
function stateSearches(postedDate, deep = false) {
  const splitLetters = deep ? ['a', 'e', 'i', 'o', 's', 't'] : [];

  return US_STATES.flatMap((location) => [
    { q: '', postedDate, location },
    ...splitLetters.map((q) => ({ q, postedDate, location })),
  ]);
}

const FULL_SEARCHES = [...nationalSearches(7), ...stateSearches(30, true)];

const DAILY_SEARCHES = [...nationalSearches(3), ...stateSearches(3, false)];

export async function scrape({ mode = 'daily' } = {}) {
  const browser = await launchBrowser();
  const map = new Map();
  const searches = mode === 'full' ? FULL_SEARCHES : DAILY_SEARCHES;
  const maxPages = mode === 'full' ? 25 : 10;

  try {
    const page = await newPage(browser);

    for (const search of searches) {
      const label = [search.location || 'US-wide', search.q || '(all)'].join(' · ');
      await scrapeDiceSearch(page, { ...search, maxPages }, map);
      if (mode === 'full' || search.location) {
        console.log(`  [${name}] ${label} → ${map.size} unique so far`);
      }
    }

    const jobs = [...map.values()].map((card) => {
      const key = card.url.split('?')[0];
      return {
        source: name,
        externalId: key,
        title: card.title,
        company: card.company,
        location: card.location,
        url: card.url,
        salary: card.salary,
        description: truncateDescription(card.description),
        postedAt: parseRelativePosted(card.posted),
      };
    });

    await enrichShortDescriptions(page, jobs, {
      maxFetch: mode === 'full' ? 100 : 50,
    });

    return jobs;
  } finally {
    await browser.close();
  }
}
