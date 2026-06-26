import { enrichShortDescriptions, launchBrowser, newPage } from './playwright/helpers.js';

export const name = 'powertofly';

export async function scrape({ mode = 'daily' } = {}) {
  const browser = await launchBrowser();
  const map = new Map();

  try {
    const page = await newPage(browser);
    const params = new URLSearchParams({ location: 'United States' });

    await page.goto(`https://powertofly.com/jobs/?${params}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const scrollRounds = mode === 'full' ? 12 : 4;
    for (let i = 0; i < scrollRounds; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    const listings = await page.$$eval('a[href]', (els) =>
      els
        .map((a) => ({
          href: a.href,
          title: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        }))
        .filter(
          (x) =>
            /powertofly\.com\/jobs\/[^/?#]+/.test(x.href) &&
            !x.href.includes('/jobs/?') &&
            !x.href.endsWith('/jobs/') &&
            x.title.length > 4
        )
    );

    for (const item of listings) {
      const slug = item.href.split('/jobs/')[1]?.split(/[?#]/)[0];
      if (!slug || slug.length < 3) continue;
      map.set(slug, item);
    }

    const jobs = [...map.values()].map((job) => ({
      source: name,
      externalId: job.href.split('/jobs/')[1]?.split(/[?#]/)[0] ?? job.href,
      title: job.title,
      company: null,
      location: 'United States',
      url: job.href,
      salary: null,
      description: '',
      postedAt: null,
    }));

    await enrichShortDescriptions(page, jobs, {
      maxFetch: mode === 'full' ? 60 : 25,
    });
    return jobs;
  } finally {
    await browser.close();
  }
}
