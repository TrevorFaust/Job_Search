import { isJunkDescription, stripHtml, truncateDescription } from './utils.js';
import {
  enrichJobsFromDetailPages,
  launchBrowser,
  newPage,
  parseRelativePosted,
  scrapeDiceSearch,
} from './playwright/helpers.js';

export const name = 'dice';

async function fetchDiceDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(500);

    const raw = await page.evaluate(() => {
      const scripts = [
        ...document.querySelectorAll('script[type="application/ld+json"]'),
        ...document.querySelectorAll('script[data-testid="jobDetailStructuredData"]'),
      ];

      let posting = null;
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          const items = Array.isArray(data) ? data : [data];
          posting = items.find((item) => item?.['@type'] === 'JobPosting') ?? posting;
        } catch {
          /* ignore malformed JSON-LD */
        }
      }

      const headerCompany =
        document.querySelector('a[href*="company-profile"] p')?.textContent?.trim() ??
        document.querySelector('[data-testid="job-detail-header-card"]')?.innerText
          ?.split('\n')
          .map((l) => l.trim())
          .find(Boolean) ??
        null;

      if (!posting) {
        return { company: headerCompany, description: '' };
      }

      let location = null;
      const jobLocation = posting.jobLocation;
      const locations = jobLocation ? (Array.isArray(jobLocation) ? jobLocation : [jobLocation]) : [];
      for (const loc of locations) {
        const address = loc?.address;
        if (address) {
          location =
            [address.addressLocality, address.addressRegion].filter(Boolean).join(', ') ||
            address.addressCountry ||
            null;
        } else if (loc?.name) {
          location = loc.name;
        }
        if (location) break;
      }

      let salary = null;
      const comp = posting.baseSalary ?? posting.estimatedSalary;
      const value = comp?.value;
      if (value) {
        const min = value.minValue ?? value.value;
        const max = value.maxValue ?? value.value;
        const unit = (value.unitText ?? comp.currency ?? '').replace(/_/g, ' ');
        if (min != null && max != null && min !== max) {
          salary = `$${Number(min).toLocaleString()} - $${Number(max).toLocaleString()} ${unit}`.trim();
        } else if (min != null) {
          salary = `$${Number(min).toLocaleString()} ${unit}`.trim();
        }
      }

      return {
        title: posting.title ?? document.querySelector('h1')?.textContent?.trim() ?? null,
        company: posting.hiringOrganization?.name ?? headerCompany,
        location,
        salary,
        postedAt: posting.datePosted ?? null,
        description: posting.description ?? '',
      };
    });

    return {
      ...raw,
      description: truncateDescription(stripHtml(raw.description ?? '')),
    };
  } catch {
    return {};
  }
}

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

    await enrichJobsFromDetailPages(page, jobs, fetchDiceDetail, {
      maxFetch: mode === 'full' ? 100 : 50,
      needsEnrichment: (job) => !job.company || isJunkDescription(job),
      overwriteFields: ['company'],
    });

    for (const job of jobs) {
      if (job.postedAt && typeof job.postedAt === 'string' && !job.postedAt.includes('T')) {
        job.postedAt = new Date(job.postedAt).toISOString();
      }
    }

    return jobs;
  } finally {
    await browser.close();
  }
}
