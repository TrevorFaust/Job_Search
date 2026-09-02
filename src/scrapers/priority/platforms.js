import { extractSalaryFromText } from '../../lib/salary.js';
import { stripHtml, truncateDescription, USER_AGENT } from '../utils.js';

function parseRelativePosted(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  const now = new Date();
  const days = t.match(/(\d+)\s*days?\s*ago/);
  if (days) {
    now.setDate(now.getDate() - Number(days[1]));
    return now.toISOString();
  }
  const weeks = t.match(/(\d+)\s*weeks?\s*ago/);
  if (weeks) {
    now.setDate(now.getDate() - Number(weeks[1]) * 7);
    return now.toISOString();
  }
  if (t.includes('today')) return now.toISOString();
  if (t.includes('yesterday')) {
    now.setDate(now.getDate() - 1);
    return now.toISOString();
  }
  return null;
}

export function toPriorityJob(watch, partial) {
  return {
    source: watch.id,
    externalId: String(partial.externalId),
    title: partial.title,
    company: watch.label,
    location: partial.location ?? null,
    url: partial.url,
    salary: partial.salary ?? null,
    description: truncateDescription(partial.description ?? ''),
    postedAt: partial.postedAt ?? null,
    isSpecial: true,
  };
}

export async function scrapeGreenhouse(watch) {
  const { boardToken } = watch.config;
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
    { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
  );
  if (!res.ok) throw new Error(`${watch.label} Greenhouse API ${res.status}`);
  const data = await res.json();
  return (data.jobs ?? []).map((job) => {
    const description = stripHtml(job.content ?? '');
    return toPriorityJob(watch, {
      externalId: job.id,
      title: job.title,
      location: job.location?.name ?? null,
      url: job.absolute_url,
      salary: extractSalaryFromText(description)?.raw ?? null,
      description,
      postedAt: job.first_published ?? job.updated_at ?? null,
    });
  });
}

export async function scrapeWorkday(watch) {
  const { apiUrl, siteUrl } = watch.config;
  const body = { appliedFacets: {}, limit: 20, offset: 0, searchText: '' };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.jobPostings ?? []).map((job) => {
        const reqId = job.bulletFields?.[0] ?? job.externalPath?.split('_').pop() ?? job.externalPath;
        return toPriorityJob(watch, {
          externalId: reqId,
          title: job.title,
          location: job.locationsText ?? null,
          url: `${siteUrl}${job.externalPath}`,
          postedAt: parseRelativePosted(job.postedOn),
        });
      });
    }
    lastErr = `${watch.label} Workday API ${res.status}`;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(lastErr);
}

export async function scrapeAdp(watch) {
  const { cid, ccId, careersUrl } = watch.config;
  const params = new URLSearchParams({
    cid,
    ccId,
    lang: 'en_US',
    locale: 'en_US',
    $top: '100',
    timeStamp: String(Date.now()),
  });
  const res = await fetch(
    `https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?${params}`,
    { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } }
  );
  if (!res.ok) throw new Error(`${watch.label} ADP API ${res.status}`);
  const data = await res.json();
  return (data.jobRequisitions ?? [])
    .filter((req) => req?.clientRequisitionID && req?.requisitionTitle)
    .map((req) => {
      const locations = (req.requisitionLocations ?? [])
        .map((loc) => loc?.nameCode?.shortName?.replace(/ ,/g, ',')?.trim())
        .filter(Boolean);
      const fields = req.customFieldGroup?.dateFields ?? [];
      const posting = fields.find((f) => f?.nameCode?.codeValue === 'PostingDate');
      const postedAt = posting?.dateValue ? new Date(posting.dateValue).toISOString() : req.postDate ?? null;
      return toPriorityJob(watch, {
        externalId: req.clientRequisitionID,
        title: req.requisitionTitle,
        location: locations.join(' · ') || null,
        url: `${careersUrl}&jobId=${encodeURIComponent(req.clientRequisitionID)}`,
        description: stripHtml(req.requisitionDescription ?? ''),
        postedAt,
      });
    });
}

export async function scrapeTeamwork(page, watch) {
  const { listingUrl } = watch.config;
  await page.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);

  const listings = await page.evaluate(() => {
    const results = [];
    for (const a of document.querySelectorAll('a')) {
      if (a.textContent?.trim() !== 'View') continue;
      const href = a.href;
      const idMatch = href.match(/-(\d+)$/);
      if (!idMatch) continue;
      const card = a.closest('div');
      const textNodes =
        card?.innerText
          ?.split('\n')
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      results.push({
        externalId: idMatch[1],
        title: textNodes[0] ?? 'Job opening',
        location: textNodes.find((t) => t.includes('·')) ?? textNodes[2] ?? null,
        url: href,
      });
    }
    return results;
  });

  return listings.map((item) => toPriorityJob(watch, item));
}

export async function scrapeDayforce(page, watch) {
  const { clientNamespace, listingUrl, extraListingUrls = [] } = watch.config;
  const urls = [listingUrl, ...extraListingUrls];
  const seen = new Map();

  for (const url of urls) {
    let payload = null;
    const handler = async (res) => {
      if (!res.url().includes('/jobposting/search') || res.status() !== 200) return;
      try {
        payload = await res.json();
      } catch {
        /* ignore */
      }
    };
    page.on('response', handler);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(8000);
    } finally {
      page.off('response', handler);
    }

    for (const job of payload?.jobPostings ?? []) {
      const key = String(job.jobPostingId ?? job.jobReqId);
      if (!key || seen.has(key)) continue;
      seen.set(
        key,
        toPriorityJob(watch, {
          externalId: key,
          title: job.jobTitle,
          location: job.formattedAddress ?? job.locationName ?? null,
        url:
          job.jobPostingUrl ??
          `${url.replace(/\?.*$/, '').replace(/\/$/, '')}/jobs/${job.jobPostingId}`,
          description: stripHtml(job.jobDescription ?? ''),
          postedAt: job.postingStartDate ?? null,
        })
      );
    }
  }

  return [...seen.values()];
}

export async function scrapeIsolved(page, watch) {
  await page.goto(watch.config.listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);
  const listings = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/jobs/"]')]
      .map((a) => {
        const m = a.href.match(/\/jobs\/(\d+)/);
        const title = a.textContent?.trim();
        if (!m || !title || title.toLowerCase() === 'jobs') return null;
        return { externalId: m[1], title, url: a.href };
      })
      .filter(Boolean)
  );
  return listings.map((item) => toPriorityJob(watch, item));
}

export async function scrapeJazzhr(page, watch) {
  await page.goto(watch.config.listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(3000);
  const listings = await page.evaluate(({ careersUrl }) => {
    const results = [];
    for (const a of document.querySelectorAll('a[href*="/apply/jobs/details/"]')) {
      const title = a.textContent?.trim();
      const m = a.href.match(/\/details\/([^/?]+)/);
      if (!title || !m) continue;
      results.push({ externalId: m[1], title, url: a.href, careersUrl });
    }
    return results;
  }, { careersUrl: watch.config.careersUrl ?? watch.url });
  return listings.map((item) =>
    toPriorityJob(watch, { ...item, url: item.url || watch.url })
  );
}

export async function scrapePaycom(page, watch) {
  await page.goto(watch.config.listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);
  const listings = await page.evaluate(({ portalId }) => {
    const results = [];
    for (const a of document.querySelectorAll(`a[href*="/portal/${portalId}/jobs/"]`)) {
      const m = a.href.match(/\/jobs\/(\d+)/);
      const raw = a.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const title = raw.split('Full Time')[0].split('Part Time')[0].trim();
      if (!m || !title || title.length < 4) continue;
      results.push({ externalId: m[1], title, url: a.href.split('?')[0] });
    }
    return results;
  }, { portalId: watch.config.portalId });
  return listings.map((item) => toPriorityJob(watch, item));
}

export async function scrapeUltipro(page, watch) {
  await page.goto(watch.config.listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(6000);
  const listings = await page.evaluate(() => {
    const results = [];
    for (const a of document.querySelectorAll('a[href*="OpportunityDetail?opportunityId="]')) {
      const title = a.textContent?.trim();
      const m = a.href.match(/opportunityId=([^&]+)/);
      if (!title || !m || title.length < 4) continue;
      results.push({ externalId: m[1], title, url: a.href });
    }
    return results;
  });
  return listings.map((item) => toPriorityJob(watch, item));
}

export async function scrapeEmploymentPage(page, watch) {
  await page.goto(watch.config.listingUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);
  const listings = await page.evaluate((mode) => {
    const results = [];
    if (mode === 'dayforce-link-title') {
      for (const a of document.querySelectorAll('a[href*="jobs.dayforcehcm.com"][href*="/jobs/"]')) {
        const title = a.textContent?.trim();
        const m = a.href.match(/\/jobs\/(\d+)/);
        if (!title || !m || title === 'APPLY NOW') continue;
        results.push({ externalId: m[1], title, url: a.href });
      }
    } else {
      for (const a of document.querySelectorAll('a[href*="jobs.dayforcehcm.com"][href*="/jobs/"]')) {
        if (a.textContent?.trim() !== 'APPLY NOW') continue;
        const m = a.href.match(/\/jobs\/(\d+)/);
        let el = a.parentElement;
        let title = '';
        for (let i = 0; i < 8 && el; i++) {
          const heading = el.querySelector('h2,h3,h4,h5,strong');
          if (heading?.textContent?.trim()) {
            title = heading.textContent.trim();
            break;
          }
          el = el.parentElement;
        }
        if (title && m) results.push({ externalId: m[1], title, url: a.href });
      }
    }
    return results;
  }, watch.config.mode);
  return listings.map((item) => toPriorityJob(watch, item));
}

const API_PLATFORMS = new Set(['greenhouse', 'workday', 'adp']);

export function isApiPlatform(platform) {
  return API_PLATFORMS.has(platform);
}

export async function scrapeWatch(page, watch) {
  switch (watch.platform) {
    case 'greenhouse':
      return scrapeGreenhouse(watch);
    case 'workday':
      return scrapeWorkday(watch);
    case 'adp':
      return scrapeAdp(watch);
    case 'teamwork':
      return scrapeTeamwork(page, watch);
    case 'dayforce':
      return scrapeDayforce(page, watch);
    case 'isolved':
      return scrapeIsolved(page, watch);
    case 'jazzhr':
      return scrapeJazzhr(page, watch);
    case 'paycom':
      return scrapePaycom(page, watch);
    case 'ultipro':
      return scrapeUltipro(page, watch);
    case 'employment-page':
      return scrapeEmploymentPage(page, watch);
    default:
      return [];
  }
}
