import { fetchJson, truncateDescription } from './utils.js';

export const name = 'usajobs';

export async function scrape({ mode = 'daily' } = {}) {
  const apiKey = process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT;
  if (!apiKey || !userAgent) {
    console.warn('  [usajobs] skipped: USAJOBS_API_KEY / USAJOBS_USER_AGENT not set');
    return [];
  }

  const headers = {
    'Authorization-Key': apiKey,
    'User-Agent': userAgent,
    Host: 'data.usajobs.gov',
  };

  const maxPages = mode === 'full' ? 20 : 5;
  const jobs = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      ResultsPerPage: '100',
      Page: String(page),
      SortField: 'opendate',
      SortDirection: 'desc',
    });

    const data = await fetchJson(`https://data.usajobs.gov/api/search?${params}`, { headers });
    const items = data.SearchResult?.SearchResultItems ?? [];
    if (!items.length) break;

    for (const result of items) {
      const d = result.MatchedObjectDescriptor;
      if (seen.has(result.MatchedObjectId)) continue;
      seen.add(result.MatchedObjectId);

      const pay = d.PositionRemuneration?.[0];
      jobs.push({
        source: name,
        externalId: result.MatchedObjectId,
        title: d.PositionTitle,
        company: d.OrganizationName || 'US Federal Government',
        location: d.PositionLocationDisplay || null,
        url: d.PositionURI,
        salary: pay
          ? `$${Number(pay.MinimumRange).toLocaleString()} - $${Number(pay.MaximumRange).toLocaleString()} ${pay.RateIntervalCode === 'PA' ? '/yr' : ''}`.trim()
          : null,
        description: truncateDescription(d.UserArea?.Details?.JobSummary ?? d.QualificationSummary ?? ''),
        postedAt: d.PublicationStartDate ? new Date(d.PublicationStartDate).toISOString() : null,
      });
    }
  }
  return jobs;
}
