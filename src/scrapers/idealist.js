import { enrichShortDescriptions, launchBrowser, newPage } from './playwright/helpers.js';

export const name = 'idealist';

export async function scrape({ mode = 'daily' } = {}) {
  const browser = await launchBrowser();
  const map = new Map();
  const maxPages = mode === 'full' ? 50 : 10;
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const queries = mode === 'full' ? ['', ...ALPHABET] : [''];

  try {
    const page = await newPage(browser);

    for (const query of queries.length ? queries : ['']) {
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (pageNum > 1) params.set('page', String(pageNum));
        const qs = params.toString();
        const url = `https://www.idealist.org/en/jobs${qs ? `?${qs}` : ''}`;

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(2500);

        const listings = await page.$$eval('h3', (headings) =>
          headings
            .map((h3) => {
              const card = h3.closest('a') ?? h3.parentElement?.closest('a');
              const container = h3.closest('div');
              const org = container?.querySelector('p, span')?.textContent?.trim() ?? null;
              return {
                title: h3.textContent?.trim() ?? '',
                href: card?.href ?? null,
                company: org,
              };
            })
            .filter((x) => x.href && x.title && x.href.includes('-job/'))
        );

        if (!listings.length) break;

        for (const item of listings) {
          const id = item.href.split('/').pop();
          map.set(id, {
            source: name,
            externalId: id,
            title: item.title,
            company: item.company,
            location: null,
            url: item.href,
            salary: null,
            description: '',
            postedAt: null,
          });
        }
      }
    }

    const jobs = [...map.values()];
    await enrichShortDescriptions(page, jobs, {
      maxFetch: mode === 'full' ? 60 : 25,
    });
    return jobs;
  } finally {
    await browser.close();
  }
}
