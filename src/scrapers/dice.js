import { truncate } from './utils.js';

export const name = 'dice';

/**
 * Dice has no public API, so this drives a real (headless) browser with
 * Playwright and reads the search result cards. We search Dice for each
 * keyword directly since it's a huge general-purpose board.
 *
 * NOTE: site redesigns will break this scraper. If it starts failing,
 * set `dice: false` in config/config.js until it's fixed.
 */
export async function scrape({ keywords }) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const jobs = [];

  try {
    const page = await browser.newPage();
    for (const keyword of keywords) {
      const url = `https://www.dice.com/jobs?q=${encodeURIComponent(keyword)}&countryCode=US&radius=30&radiusUnit=mi&pageSize=20&language=en`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Wait for job cards; if none appear the search had no results
      const found = await page
        .waitForSelector('a[data-testid="job-search-job-detail-link"], [data-testid="job-card"]', {
          timeout: 15000,
        })
        .then(() => true)
        .catch(() => false);
      if (!found) continue;

      const cards = await page.$$eval('[data-testid="job-card"]', (els) =>
        els.map((el) => {
          const link = el.querySelector('a[data-testid="job-search-job-detail-link"]');
          // Metadata row reads: "Location • Posted date"
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
          };
        })
      );

      for (const card of cards) {
        if (!card.title || !card.url) continue;
        jobs.push({
          source: name,
          externalId: card.url.split('?')[0],
          title: card.title,
          company: card.company,
          location: card.location,
          url: card.url,
          salary: card.salary,
          description: truncate(card.description),
          postedAt: null,
        });
      }
    }
  } finally {
    await browser.close();
  }

  return jobs;
}
