import { fetchJson, stripHtml, truncate } from './utils.js';

export const name = 'arbeitnow';

export async function scrape() {
  const data = await fetchJson('https://www.arbeitnow.com/api/job-board-api');
  return (data.data ?? []).map((item) => ({
    source: name,
    externalId: item.slug,
    title: item.title,
    company: item.company_name || null,
    location: item.location || (item.remote ? 'Remote' : null),
    url: item.url,
    salary: null,
    description: truncate(stripHtml(item.description)),
    postedAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : null,
  }));
}
