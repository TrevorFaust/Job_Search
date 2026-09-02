import { isJunkDescription, isPublishableJob } from './utils.js';
import { enrichDescriptionsFromPages } from './job-page.js';
import { enrichShortDescriptions, launchBrowser, newPage } from './playwright/helpers.js';
import { alertMeta, getEnabledWatches } from './priority/config.js';
import { isApiPlatform, scrapeWatch } from './priority/platforms.js';

export { alertMeta };

export const name = 'nfl-priority';

async function fillDescriptions(scraped, page) {
  await enrichDescriptionsFromPages(scraped, { concurrency: 5 });
  if (page && scraped.some((job) => isJunkDescription(job))) {
    await enrichShortDescriptions(page, scraped, { maxFetch: 40 });
  }
}

export async function scrape() {
  const watches = getEnabledWatches();
  const jobs = [];

  const apiWatches = watches.filter((w) => isApiPlatform(w.platform));
  const browserWatches = watches.filter((w) => !isApiPlatform(w.platform));

  for (const watch of apiWatches) {
    try {
      const scraped = await scrapeWatch(null, watch);
      await fillDescriptions(scraped, null);
      const publishable = scraped.filter(isPublishableJob);
      const withDesc = publishable.filter((j) => !isJunkDescription(j)).length;
      console.log(
        `  [${watch.id}] ${publishable.length} priority listing(s)${withDesc ? `, ${withDesc} with descriptions` : ''}`
      );
      jobs.push(...publishable);
    } catch (err) {
      console.error(`  [${watch.id}] FAILED: ${err.message}`);
    }
  }

  if (browserWatches.length) {
    const browser = await launchBrowser();
    try {
      const page = await newPage(browser);
      for (const watch of browserWatches) {
        try {
          const scraped = await scrapeWatch(page, watch);
          await fillDescriptions(scraped, page);
          const publishable = scraped.filter(isPublishableJob);
          const withDesc = publishable.filter((j) => !isJunkDescription(j)).length;
          console.log(
            `  [${watch.id}] ${publishable.length} priority listing(s)${withDesc ? `, ${withDesc} with descriptions` : ''}`
          );
          jobs.push(...publishable);
        } catch (err) {
          console.error(`  [${watch.id}] FAILED: ${err.message}`);
        }
      }
    } finally {
      await browser.close();
    }
  }

  return jobs;
}
