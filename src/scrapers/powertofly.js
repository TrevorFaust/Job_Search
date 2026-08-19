import {
  enrichJobsFromDetailPages,
  launchBrowser,
  newPage,
  parseRelativePosted,
} from './playwright/helpers.js';
import { isJunkDescription, isJunkTitle, stripHtml, truncateDescription } from './utils.js';

export const name = 'powertofly';

const DETAIL_PATH_RE = /\/jobs\/detail\/(\d+)/;

function pickListing(prev, next) {
  if (!prev) return next;
  if (isJunkTitle(next.title) && !isJunkTitle(prev.title)) return prev;
  if (isJunkTitle(prev.title) && !isJunkTitle(next.title)) return next;
  if (!next.title) return prev;
  if (!prev.title) return next;
  return next.title.length >= prev.title.length ? next : prev;
}

async function fetchPowerToFlyDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(600);

    const raw = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
      let posting = null;
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          const items = Array.isArray(data) ? data : [data];
          posting = items.find((item) => item?.['@type'] === 'JobPosting') ?? posting;
        } catch {
          /* ignore malformed JSON-LD */
        }
      }

      const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.trim() ?? '';
      const h1 = document.querySelector('h1')?.textContent?.trim() ?? '';
      const lines = document.body.innerText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const openingsIdx = lines.findIndex((l) => /\d+\s+jobs?\s+openings?/i.test(l));
      const headerCompany =
        openingsIdx > 0 ? lines[openingsIdx - 2] ?? lines[openingsIdx - 1] ?? null : null;

      const workTypeIdx = lines.findIndex((l) => /^(Onsite|Remote|Hybrid)$/i.test(l));
      const headerLocation =
        workTypeIdx >= 0 && lines[workTypeIdx + 1] && !/^full time$/i.test(lines[workTypeIdx + 1])
          ? lines[workTypeIdx + 1]
          : null;

      const postedLine = lines.find((l) => /^posted\b/i.test(l)) ?? null;

      let sectionDescription = '';
      const jobDetailsH3 = [...document.querySelectorAll('h3')].find((h) =>
        /^job details$/i.test(h.textContent?.trim() ?? '')
      );
      if (jobDetailsH3) {
        const parts = [];
        let node = jobDetailsH3.nextElementSibling;
        while (node && !(node.tagName === 'H3' && /^skills$/i.test(node.textContent?.trim() ?? ''))) {
          const text = node.innerText?.trim();
          if (text) parts.push(text);
          node = node.nextElementSibling;
        }
        sectionDescription = parts.join('\n\n');
      }

      let salary =
        document.body.innerText.match(
          /(?:Salary\s*)?(\$[\d,]+(?:\.\d{2})?\s*[-–]\s*\$?[\d,]+(?:\.\d{2})?(?:\s*(?:USD|yr|yearly))?)/i
        )?.[1]?.trim() ?? null;

      if (!salary) {
        const plain = document.body.innerText.match(
          /(?:Salary\s*)?(\d[\d,]*\s*[-–]\s*\d[\d,]*\s*USD\s*Yearly)/i
        )?.[1]?.trim();
        if (plain) salary = plain.replace(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/, '$$$1 - $$$2');
      }

      let title = h1 || null;
      let company = headerCompany;
      let location = headerLocation;
      let description = sectionDescription;
      let postedAt = null;

      const ogMatch = ogTitle.match(/^(.+?) at (.+?) in (.+)$/);
      if (ogMatch) {
        title = title || ogMatch[1].trim();
        company = company || ogMatch[2].trim();
        location = location || ogMatch[3].trim();
      }

      if (posting) {
        title = posting.title || title;
        company = posting.hiringOrganization?.name || company;

        const jobLocation = posting.jobLocation;
        const locations = jobLocation ? (Array.isArray(jobLocation) ? jobLocation : [jobLocation]) : [];
        for (const loc of locations) {
          const address = loc?.address;
          if (address) {
            const parsed =
              [address.addressLocality, address.addressRegion].filter(Boolean).join(', ') ||
              address.addressCountry;
            if (parsed) location = parsed;
          } else if (loc?.name) {
            location = loc.name;
          }
        }

        const comp = posting.baseSalary ?? posting.estimatedSalary;
        const value = comp?.value;
        if (value) {
          const min = value.minValue ?? value.value;
          const max = value.maxValue ?? value.value;
          const unit = (value.unitText ?? comp.currency ?? '').replace(/_/g, ' ');
          if (min != null && max != null && min !== max) {
            salary = `$${Number(min).toLocaleString()} - $${Number(max).toLocaleString()} ${unit}`.trim();
          } else if (min != null) {
            salary = `$${Number(min).toLocaleString()} ${unit}`.trim();
          }
        }

        if (posting.datePosted) postedAt = posting.datePosted;
        if (posting.description) description = posting.description;
      }

      return { title, company, location, salary, postedAt, postedLine, description };
    });

    return {
      title: raw.title || null,
      company: raw.company || null,
      location: raw.location || null,
      salary: raw.salary || null,
      postedAt: raw.postedAt
        ? new Date(raw.postedAt).toISOString()
        : parseRelativePosted(raw.postedLine),
      description: truncateDescription(stripHtml(raw.description ?? '')),
    };
  } catch {
    return {};
  }
}

export async function scrape({ mode = 'daily' } = {}) {
  const browser = await launchBrowser();
  const map = new Map();

  try {
    const page = await newPage(browser);
    const params = new URLSearchParams({ location: 'United States' });

    await page.goto(`https://powertofly.com/jobs/?${params}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const scrollRounds = mode === 'full' ? 12 : 4;
    for (let i = 0; i < scrollRounds; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    const listings = await page.$$eval('a[href*="/jobs/detail/"]', (els) => {
      const byId = new Map();
      const junkTitles = /^(copy link|saved jobs|clear all|apply now|save job|job details|share)$/i;

      for (const a of els) {
        const match = a.href.match(/\/jobs\/detail\/(\d+)/);
        if (!match) continue;

        const externalId = match[1];
        const text = a.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const isCopyLink = a.classList.contains('copy-job-url') || junkTitles.test(text);
        const url = a.href.split('?')[0];
        const prev = byId.get(externalId);

        if (isCopyLink) {
          if (!prev) byId.set(externalId, { externalId, title: '', url });
          continue;
        }

        if (!prev || !prev.title || text.length > prev.title.length) {
          byId.set(externalId, { externalId, title: text, url });
        }
      }

      return [...byId.values()];
    });

    for (const item of listings) {
      const prev = map.get(item.externalId);
      map.set(item.externalId, pickListing(prev, item));
    }

    const jobs = [...map.values()].map((job) => ({
      source: name,
      externalId: job.externalId,
      title: job.title,
      company: null,
      location: 'United States',
      url: job.url,
      salary: null,
      description: '',
      postedAt: null,
    }));

    jobs.sort((a, b) => {
      const aPriority =
        (isJunkTitle(a.title) ? 4 : 0) + (!a.company ? 2 : 0) + (isJunkDescription(a) ? 1 : 0);
      const bPriority =
        (isJunkTitle(b.title) ? 4 : 0) + (!b.company ? 2 : 0) + (isJunkDescription(b) ? 1 : 0);
      return bPriority - aPriority;
    });

    await enrichJobsFromDetailPages(page, jobs, fetchPowerToFlyDetail, {
      maxFetch: jobs.length,
      needsEnrichment: (job) =>
        isJunkTitle(job.title) || !job.company || isJunkDescription(job),
      overwriteFields: ['company'],
    });

    return jobs.filter(isPublishableJob);
  } finally {
    await browser.close();
  }
}
