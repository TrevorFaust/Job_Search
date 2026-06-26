import { fetchJson, stripHtml, truncateDescription } from './utils.js';

export const name = 'hackernews';

/**
 * Finds the latest "Ask HN: Who is hiring?" thread via the Algolia HN API,
 * then pulls its top-level comments. Each comment is one job posting,
 * usually written by the hiring manager directly.
 */
export async function scrape() {
  const search = await fetchJson(
    'https://hn.algolia.com/api/v1/search_by_date?query=%22who%20is%20hiring%22&tags=story,author_whoishiring&hitsPerPage=5'
  );
  const thread = (search.hits ?? []).find((h) => /who is hiring/i.test(h.title ?? ''));
  if (!thread) return [];

  const item = await fetchJson(`https://hn.algolia.com/api/v1/items/${thread.objectID}`);
  const jobs = [];
  for (const comment of item.children ?? []) {
    if (!comment.text || comment.deleted || comment.dead) continue;
    const text = stripHtml(comment.text);
    // Convention: posts start with "Company | Role | Location | ..."
    const header = text.slice(0, 150);
    const parts = header.split('|').map((p) => p.trim());
    jobs.push({
      source: name,
      externalId: String(comment.id),
      title: parts.length > 1 ? parts[1] : `${header.slice(0, 80)}…`,
      company: parts.length > 1 ? parts[0] : null,
      location: parts.length > 2 ? parts[2] : null,
      url: `https://news.ycombinator.com/item?id=${comment.id}`,
      salary: null,
      description: truncateDescription(text),
      postedAt: comment.created_at ?? null,
    });
  }
  return jobs;
}
