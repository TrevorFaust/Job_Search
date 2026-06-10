import Parser from 'rss-parser';
import { stripHtml, truncate } from './utils.js';

export const name = 'weworkremotely';

const parser = new Parser();

export async function scrape() {
  const feed = await parser.parseURL('https://weworkremotely.com/remote-jobs.rss');
  return (feed.items ?? []).map((item) => {
    // WWR titles look like "Company: Job Title"
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
      description: truncate(stripHtml(item.content ?? item.contentSnippet ?? '')),
      postedAt: item.isoDate ?? null,
    };
  });
}
