import Parser from 'rss-parser';
import { stripHtml, truncateDescription } from './utils.js';

export const name = 'weworkremotely';

const parser = new Parser();

// Official category feeds — much more coverage than the single main feed.
const FEEDS = [
  'https://weworkremotely.com/remote-jobs.rss',
  'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss',
  'https://weworkremotely.com/categories/remote-product-jobs.rss',
  'https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss',
  'https://weworkremotely.com/categories/remote-customer-support-jobs.rss',
  'https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss',
  'https://weworkremotely.com/categories/all-other-remote-jobs.rss',
];

function mapItem(item) {
  const [company, ...titleParts] = (item.title ?? '').split(': ');
  const title = titleParts.length ? titleParts.join(': ') : item.title;
  return {
    source: name,
    externalId: item.guid || item.link,
    title,
    company: titleParts.length ? company : null,
    location: item.region || 'Remote',
    url: item.link,
    salary: null,
    description: truncateDescription(stripHtml(item.content ?? item.contentSnippet ?? '')),
    postedAt: item.isoDate ?? null,
  };
}

export async function scrape() {
  const map = new Map();

  for (const feedUrl of FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of feed.items ?? []) {
        const job = mapItem(item);
        map.set(job.externalId, job);
      }
    } catch (err) {
      console.warn(`  [${name}] feed failed ${feedUrl}: ${err.message}`);
    }
  }

  return [...map.values()];
}
