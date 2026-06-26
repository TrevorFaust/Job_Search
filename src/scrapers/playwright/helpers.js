import { USER_AGENT, truncateDescription } from '../utils.js';

const JOB_DETAIL_SELECTORS = [
  '#jobdescSec',
  '[data-cy="jobDescription"]',
  '[data-testid="jobDescription"]',
  '.job-description',
  '.job_description',
  '#job_description',
  '.single_job_listing .entry-content',
  '.single_job_listing .job_description',
  '.post-content',
  '.job-overview',
  '[class*="job-description"]',
  'article .prose',
  'main article',
];

/** Fetch full posting text from a job detail page when list cards only have snippets. */
export async function fetchJobDetailDescription(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(400);
    return await page.evaluate((selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const text = el?.innerText?.trim() ?? '';
        if (text.length > 80) return text;
      }
      const main = document.querySelector('main');
      const text = main?.innerText?.trim() ?? '';
      return text.length > 120 ? text : '';
    }, JOB_DETAIL_SELECTORS);
  } catch {
    return '';
  }
}

/** Visit detail pages for jobs that only have short or empty descriptions. */
export async function enrichShortDescriptions(page, jobs, { minLength = 120, maxFetch } = {}) {
  const limit = maxFetch ?? (jobs.length > 200 ? 40 : 80);
  let fetched = 0;

  for (const job of jobs) {
    if ((job.description?.length ?? 0) >= minLength || !job.url) continue;
    if (fetched >= limit) break;

    const desc = await fetchJobDetailDescription(page, job.url);
    if (desc.length > (job.description?.length ?? 0)) {
      job.description = truncateDescription(desc);
    }
    fetched++;
    await page.waitForTimeout(250);
  }

  return jobs;
}

/** Shared Playwright browser for site scrapers. */
export async function launchBrowser() {
  const { chromium } = await import('playwright');
  return chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--disable-http2'],
  });
}

export async function newPage(browser) {
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
  });
  return context.newPage();
}

/** Parse Dice-style relative posted strings into ISO dates. */
export function parseRelativePosted(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  const now = new Date();

  if (/\btoday\b/.test(t)) return now.toISOString();
  if (/\byesterday\b/.test(t)) {
    now.setDate(now.getDate() - 1);
    return now.toISOString();
  }

  const days = t.match(/(\d+)\s*\+?\s*days?\s*ago/);
  if (days) {
    now.setDate(now.getDate() - Number(days[1]));
    return now.toISOString();
  }

  const weeks = t.match(/(\d+)\s*\+?\s*weeks?\s*ago/);
  if (weeks) {
    now.setDate(now.getDate() - Number(weeks[1]) * 7);
    return now.toISOString();
  }

  if (/\bmonth/.test(t)) {
    now.setDate(now.getDate() - 30);
    return now.toISOString();
  }

  return null;
}

/**
 * Paginate a Dice search until no new jobs appear (Dice caps ~500 unique per query).
 */
export async function scrapeDiceSearch(
  page,
  { query = '', postedDate = 7, maxPages = 25, location = '' },
  map
) {
  let noNewStreak = 0;

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const params = new URLSearchParams({
      countryCode: 'US',
      radius: '30',
      radiusUnit: 'mi',
      pageSize: '20',
      page: String(pageNum),
      postedDate: String(postedDate),
      language: 'en',
    });
    if (query) params.set('q', query);
    if (location) params.set('location', location);

    await page.goto(`https://www.dice.com/jobs?${params}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    const found = await page
      .waitForSelector('[data-testid="job-card"]', { timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    if (!found) break;

    const cards = await page.$$eval('[data-testid="job-card"]', (els) =>
      els.map((el) => {
        const link = el.querySelector('a[data-testid="job-search-job-detail-link"]');
        const meta = [...el.querySelectorAll('p')]
          .map((p) => p.textContent.trim())
          .filter((t) => t && t !== '•');
        return {
          title: link?.textContent?.trim() ?? null,
          url: link?.href ?? null,
          company:
            el.querySelector('a[href*="company-profile"] p')?.textContent?.trim() ??
            el.querySelector('a[href*="company-profile"] img')?.alt ??
            null,
          location: meta.find((t) => /,|remote|hybrid/i.test(t)) ?? null,
          salary: el.querySelector('#salary-label')?.textContent?.trim() ?? null,
          description: el.querySelector('p.line-clamp-2')?.textContent?.trim() ?? '',
          posted: meta.find((t) => /today|yesterday|day|week|month/i.test(t)) ?? null,
        };
      })
    );

    if (!cards.length) break;

    let newOnPage = 0;
    for (const card of cards) {
      if (!card.title || !card.url) continue;
      const key = card.url.split('?')[0];
      if (map.has(key)) continue;
      newOnPage++;
      map.set(key, card);
    }

    if (newOnPage === 0) {
      noNewStreak++;
      if (noNewStreak >= 2) break;
    } else {
      noNewStreak = 0;
    }
  }
}
