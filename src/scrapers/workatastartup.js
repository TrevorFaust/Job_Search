import { enrichDescriptionsFromPages } from './job-page.js';
import { enrichShortDescriptions, launchBrowser, newPage } from './playwright/helpers.js';

export const name = 'workatastartup';

const CATEGORIES = [
  'software-engineer',
  'designer',
  'recruiting',
  'science',
  'product-manager',
  'operations',
  'sales-manager',
  'marketing',
  'legal',
  'finance',
];

export async function scrape({ mode = 'daily' } = {}) {
  const browser = await launchBrowser();
  const map = new Map();

  const paths = ['', ...CATEGORIES.map((c) => `l/${c}`)];

  try {
    const page = await newPage(browser);

    for (const path of paths) {
      const url = path
        ? `https://www.workatastartup.com/jobs/${path}`
        : 'https://www.workatastartup.com/jobs';

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2500);

      const listings = await page.$$eval('a[href*="/jobs/"]', (els) =>
        els
          .map((a) => ({
            href: a.href,
            title: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          }))
          .filter((x) => /\/jobs\/\d+/.test(x.href) && x.title.length > 3)
      );

      for (const item of listings) {
        const id = item.href.match(/\/jobs\/(\d+)/)?.[1];
        if (!id) continue;
        map.set(id, {
          externalId: id,
          title: item.title,
          url: item.href,
        });
      }
    }

    const jobs = [...map.values()].map((job) => ({
      source: name,
      externalId: job.externalId,
      title: job.title,
      company: null,
      location: 'Remote / US startups',
      url: job.url,
      salary: null,
      description: '',
      postedAt: null,
    }));

    await enrichDescriptionsFromPages(jobs, {
      maxFetch: mode === 'full' ? 200 : 80,
      concurrency: 5,
    });
    await enrichShortDescriptions(page, jobs, {
      maxFetch: mode === 'full' ? 60 : 25,
    });
    return jobs;
  } finally {
    await browser.close();
  }
}
