import { fetchJson, truncate } from './utils.js';

export const name = 'usajobs';

/**
 * Official federal jobs API. Unlike the other sources we pass keywords to the
 * API directly since USAJobs has tens of thousands of postings.
 * Requires USAJOBS_API_KEY + USAJOBS_USER_AGENT (your email) in .env.
 */
export async function scrape({ keywords }) {
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

  const jobs = [];
  for (const keyword of keywords) {
    const data = await fetchJson(
      `https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(keyword)}&ResultsPerPage=50&SortField=opendate&SortDirection=desc`,
      { headers }
    );
    for (const result of data.SearchResult?.SearchResultItems ?? []) {
      const d = result.MatchedObjectDescriptor;
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
        description: truncate(d.UserArea?.Details?.JobSummary ?? d.QualificationSummary ?? ''),
        postedAt: d.PublicationStartDate ? new Date(d.PublicationStartDate).toISOString() : null,
      });
    }
  }
  return jobs;
}
