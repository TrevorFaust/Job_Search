import { enrichDescriptionsFromPages } from './job-page.js';
import { enrichShortDescriptions, launchBrowser, newPage } from './playwright/helpers.js';

export const name = 'jobspresso';

async function scrapeListings(page, url, loadMoreClicks) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('li.job_listing', { timeout: 15000 }).catch(() => {});

  for (let i = 0; i < loadMoreClicks; i++) {
    const btn = page.locator('a:has-text("Load more")').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1200);
    }
  }

  return page.$$eval('li.job_listing', (els) =>
    els
      .map((el) => {
        const link = el.querySelector('a.job_listing-clickbox, a[href*="/job/"]');
        const title =
          el.querySelector('h3, h2, .position h3')?.textContent?.trim() ??
          el.querySelector('strong')?.textContent?.trim();
        const company =
          el.querySelector('.company strong')?.textContent?.trim() ??
          el.querySelector('img.company_logo')?.getAttribute('alt')?.trim() ??
          null;
        const location = el.querySelector('.location')?.textContent?.trim() ?? 'Remote';
        return { href: link?.href ?? null, title, company, location };
      })
      .filter((x) => x.href && x.title)
  );
}

export async function scrape({ mode = 'daily' } = {}) {
  const browser = await launchBrowser();
  const map = new Map();
  const loadMoreClicks = mode === 'full' ? 30 : 5;

  try {
    const page = await newPage(browser);
    const listings = await scrapeListings(page, 'https://jobspresso.co/remote-work/', loadMoreClicks);

    for (const item of listings) {
      const slug = item.href.split('/').filter(Boolean).pop();
      map.set(slug, {
        source: name,
        externalId: slug,
        title: item.title,
        company: item.company,
        location: item.location || 'Remote',
        url: item.href,
        salary: null,
        description: '',
        postedAt: null,
      });
    }

    const jobs = [...map.values()];
    await enrichDescriptionsFromPages(jobs, {
      maxFetch: mode === 'full' ? 200 : 80,
      concurrency: 5,
    });
    await enrichShortDescriptions(page, jobs, {
      maxFetch: mode === 'full' ? 80 : 30,
    });
    return jobs;
  } finally {
    await browser.close();
  }
}
