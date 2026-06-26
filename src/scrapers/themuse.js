import { fetchJson, stripHtml, truncateDescription } from './utils.js';

export const name = 'themuse';

export async function scrape({ mode = 'daily' } = {}) {
  const jobs = [];
  const maxPages = mode === 'full' ? 25 : 3;

  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchJson(
      `https://www.themuse.com/api/public/jobs?page=${page}&descending=true`
    );
    for (const item of data.results ?? []) {
      jobs.push({
        source: name,
        externalId: String(item.id),
        title: item.name,
        company: item.company?.name || null,
        location: (item.locations ?? []).map((l) => l.name).join('; ') || null,
        url: item.refs?.landing_page,
        salary: null,
        description: truncateDescription(stripHtml(item.contents)),
        postedAt: item.publication_date ? new Date(item.publication_date).toISOString() : null,
      });
    }
    if (page >= (data.page_count ?? 1)) break;
  }
  return jobs.filter((j) => j.url);
}
