import Parser from 'rss-parser';
import { enrichDescriptionsFromPages } from './job-page.js';
import { fetchJson, mergeJobRecords, stripHtml, truncateDescription } from './utils.js';

export const name = 'remotive';

const parser = new Parser();

const CATEGORIES = [
  'software-development',
  'customer-service',
  'marketing',
  'finance',
  'design',
  'data',
  'product',
  'operations',
  'human-resources',
  'project-management',
  'information-technology',
  'artificial-intelligence',
  'education',
  'medical',
  'all-others',
];

const JOB_LINK_RE = /\/remote\/jobs\/.+-\d+$/;

function mapRemotiveJob({ externalId, title, company, location, url, description, postedAt, salary }) {
  return {
    source: name,
    externalId: String(externalId),
    title,
    company: company || null,
    location: location || 'Remote',
    url,
    salary: salary || null,
    description: truncateDescription(description ?? ''),
    postedAt: postedAt ?? null,
  };
}

function parseCardText(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const parts = clean.split('•').map((p) => p.trim());
  const title = parts[0] ?? clean;
  const company = parts[1]?.split(/\s{2,}/)[0]?.trim() || null;
  return { title, company };
}

async function scrapeApi() {
  const data = await fetchJson('https://remotive.com/api/remote-jobs');
  return (data.jobs ?? []).map((item) =>
    mapRemotiveJob({
      externalId: item.id,
      title: item.title,
      company: item.company_name,
      location: item.candidate_required_location,
      url: item.url,
      salary: item.salary,
      description: stripHtml(item.description),
      postedAt: item.publication_date ? new Date(item.publication_date).toISOString() : null,
    })
  );
}

async function scrapeRss() {
  const feed = await parser.parseURL('https://remotive.com/remote-jobs/feed');
  return (feed.items ?? []).map((item) => {
    const id = item.link?.match(/-(\d+)$/)?.[1] ?? item.guid ?? item.link;
    return mapRemotiveJob({
      externalId: id,
      title: item.title ?? 'Untitled',
      company: item.creator || item.author,
      location: 'Remote',
      url: item.link,
      salary: null,
      description: stripHtml(item.contentSnippet ?? item.content ?? ''),
      postedAt: item.isoDate ?? null,
    });
  });
}

async function scrapeSearchPages(page, queries) {
  const jobs = [];

  for (const query of queries) {
    await page.goto(`https://remotive.com/remote-jobs?query=${encodeURIComponent(query)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(2000);

    const cards = await page.$$eval('a[href*="/remote/jobs/"]', (els) =>
      els
        .map((a) => ({
          href: a.href,
          text: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        }))
        .filter((x) => /\/remote\/jobs\/.+-\d+$/.test(x.href))
    );

    for (const card of cards) {
      const id = card.href.match(/-(\d+)$/)?.[1];
      if (!id) continue;
      const { title, company } = parseCardText(card.text);
      jobs.push(
        mapRemotiveJob({
          externalId: id,
          title: title || 'Untitled',
          company,
          location: 'Remote',
          url: card.href,
          salary: null,
          description: '',
          postedAt: null,
        })
      );
    }
  }

  return jobs;
}

async function scrapeCategoryPages(page) {
  const jobs = [];

  for (const cat of CATEGORIES) {
    await page.goto(`https://remotive.com/remote-jobs/${cat}`, {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });
    await page.waitForTimeout(1200);

    const cards = await page.$$eval('a[href*="/remote/jobs/"], a[href*="/remote-jobs/"]', (els) =>
      els
        .map((a) => ({
          href: a.href,
          text: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        }))
        .filter(
          (x) =>
            /\/remote\/jobs\/.+-\d+$/.test(x.href) ||
            /\/remote-jobs\/[^/]+\/.+-\d+$/.test(x.href)
        )
    );

    for (const card of cards) {
      const id = card.href.match(/-(\d+)$/)?.[1];
      if (!id) continue;
      const { title, company } = parseCardText(card.text);
      jobs.push(
        mapRemotiveJob({
          externalId: id,
          title: title || 'Untitled',
          company,
          location: 'Remote',
          url: card.href,
          salary: null,
          description: '',
          postedAt: null,
        })
      );
    }
  }

  return jobs;
}

/**
 * Remotive's public API/RSS only expose ~30 jobs (24h delay per their terms).
 * Keyword search via Playwright finds company-specific roles (e.g. Fanatics) that
 * the API misses. Most listings are paywalled — only ~3 full links per search.
 */
async function scrapeBrowser() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    return await scrapeCategoryPages(page);
  } finally {
    await browser.close();
  }
}

function dedupe(jobs) {
  const map = new Map();
  for (const job of jobs) {
    const prev = map.get(job.externalId);
    map.set(job.externalId, prev ? mergeJobRecords(prev, job) : job);
  }
  return [...map.values()];
}

export async function scrape(opts = {}) {
  const [api, rss, browser] = await Promise.all([
    scrapeApi().catch(() => []),
    scrapeRss().catch(() => []),
    scrapeBrowser(opts).catch((err) => {
      console.warn(`  [${name}] browser scrape failed: ${err.message}`);
      return [];
    }),
  ]);
  const jobs = dedupe([...api, ...rss, ...browser]);
  await enrichDescriptionsFromPages(jobs, { maxFetch: 80, concurrency: 5 });
  return jobs;
}
