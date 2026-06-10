import { fetchJson, stripHtml, truncate } from './utils.js';

export const name = 'remotive';

export async function scrape() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs?limit=200');
  return (data.jobs ?? []).map((item) => ({
    source: name,
    externalId: String(item.id),
    title: item.title,
    company: item.company_name || null,
    location: item.candidate_required_location || 'Remote',
    url: item.url,
    salary: item.salary || null,
    description: truncate(stripHtml(item.description)),
    postedAt: item.publication_date ? new Date(item.publication_date).toISOString() : null,
  }));
}
