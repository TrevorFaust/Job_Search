import { fetchJson, stripHtml, truncateDescription } from './utils.js';

export const name = 'remoteok';

export async function scrape() {
  const data = await fetchJson('https://remoteok.com/api');
  // First element is a legal notice, not a job
  return data
    .filter((item) => item.id && item.position)
    .map((item) => ({
      source: name,
      externalId: String(item.id),
      title: item.position,
      company: item.company || null,
      location: item.location || 'Remote',
      url: item.url || `https://remoteok.com/l/${item.id}`,
      salary:
        item.salary_min && item.salary_max
          ? `$${item.salary_min.toLocaleString()} - $${item.salary_max.toLocaleString()}`
          : null,
      description: truncateDescription(stripHtml(item.description)),
      postedAt: item.date ? new Date(item.date).toISOString() : null,
    }));
}
