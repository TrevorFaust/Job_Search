import Parser from 'rss-parser';
import { extractSalaryFromText } from '../../lib/salary.js';
import { stripHtml, truncateDescription, USER_AGENT } from './utils.js';

export const name = 'authenticjobs';

const FEED = 'https://authenticjobs.com/?feed=job_feed';

const parser = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
  customFields: {
    item: [
      ['job_listing:company', 'company'],
      ['job_listing:location', 'location'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

function textField(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value._ === 'string') return value._.trim() || null;
  return null;
}

function mapItem(item) {
  const url = item.link;
  const title = item.title?.trim();
  if (!url || !title) return null;
  const description = truncateDescription(
    stripHtml(item.contentEncoded || item.content || item['content:encoded'] || '')
  );
  return {
    source: name,
    externalId: url.split('/').filter(Boolean).pop(),
    title,
    company: textField(item.company),
    location: textField(item.location),
    url,
    salary: extractSalaryFromText(description)?.raw ?? null,
    description,
    postedAt: item.isoDate ?? null,
  };
}

export async function scrape({ mode = 'daily' } = {}) {
  const maxPages = mode === 'full' ? 20 : 6;
  const map = new Map();

  for (let page = 1; page <= maxPages; page++) {
    const feedUrl = page === 1 ? FEED : `${FEED}&paged=${page}`;
    let feed;
    try {
      feed = await parser.parseURL(feedUrl);
    } catch (err) {
      if (page === 1) throw err;
      console.warn(`  [${name}] feed page ${page} failed: ${err.message}`);
      break;
    }

    const before = map.size;
    for (const item of feed.items ?? []) {
      const job = mapItem(item);
      if (job) map.set(job.externalId, job);
    }
    if (!feed.items?.length || map.size === before) break;
  }

  return [...map.values()];
}
