import { enrichShortDescriptions, launchBrowser, newPage } from './playwright/helpers.js';

export const name = 'authenticjobs';

export async function scrape({ mode = 'daily' } = {}) {
  const browser = await launchBrowser();
  const map = new Map();
  const loadMoreClicks = mode === 'full' ? 30 : 5;

  try {
    const page = await newPage(browser);
    await page.goto('https://authenticjobs.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('li.job_listing', { timeout: 15000 }).catch(() => {});

    for (let i = 0; i < loadMoreClicks; i++) {
      const btn = page.locator('a:has-text("Load more")').first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1200);
      }
    }

    const listings = await page.$$eval('li.job_listing', (els) =>
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
    await enrichShortDescriptions(page, jobs, {
      maxFetch: mode === 'full' ? 80 : 30,
    });
    return jobs;
  } finally {
    await browser.close();
  }
}
