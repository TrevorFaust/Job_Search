import { chromium } from 'playwright';

const URLS = [
  'https://www.dice.com/job-detail/e90f5d56-0b18-4fd6-ab4a-3a53bf85671d',
  'https://www.dice.com/job-detail/041b9ff8-de16-4843-aa2d-d401d6790394',
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ userAgent: USER_AGENT, viewport: { width: 1366, height: 900 } });

for (const url of URLS) {
  console.log('\n===', url, '===\n');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const selectors = [
      '#jobdescSec',
      '[data-cy="jobDescription"]',
      '[data-testid="jobDescription"]',
      '[data-testid="jobDescriptionContainer"]',
      '[data-testid="job-description"]',
      '.job-description',
      '.job_description',
      '#job_description',
      '[class*="job-description"]',
      '[class*="JobDescription"]',
      'main article',
      'main',
    ];

    const hits = selectors.map((sel) => {
      const el = document.querySelector(sel);
      const text = el?.innerText?.trim() ?? '';
      return { sel, len: text.length, preview: text.slice(0, 200) };
    });

    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
      try {
        return JSON.parse(s.textContent);
      } catch {
        return null;
      }
    });

    const companySelectors = [
      'a[href*="company-profile"] p',
      'a[href*="company-profile"] img',
      '[data-testid="companyName"]',
      '[data-testid="company-name"]',
      'h2 + a',
    ].map((sel) => {
      const el = document.querySelector(sel);
      return { sel, text: el?.textContent?.trim() ?? el?.alt ?? null };
    });

    const h1 = document.querySelector('h1')?.textContent?.trim();
    const allTestIds = [...document.querySelectorAll('[data-testid]')]
      .slice(0, 40)
      .map((el) => ({ testid: el.getAttribute('data-testid'), tag: el.tagName, len: el.innerText?.length ?? 0 }));

    return { h1, hits, companySelectors, jsonLd, allTestIds };
  });

  console.log('H1:', result.h1);
  console.log('\nCompany selectors:');
  console.log(JSON.stringify(result.companySelectors, null, 2));
  console.log('\nDescription selector hits:');
  for (const h of result.hits) {
    if (h.len > 0) console.log(h);
  }
  console.log('\nJSON-LD keys:', result.jsonLd.map((j) => (Array.isArray(j) ? j.map((x) => x['@type']) : j?.['@type'])));
  if (result.jsonLd[0]) {
    const job = Array.isArray(result.jsonLd[0]) ? result.jsonLd[0].find((x) => x['@type'] === 'JobPosting') : result.jsonLd[0];
    if (job) {
      console.log('JobPosting company:', job.hiringOrganization?.name);
      console.log('JobPosting desc len:', job.description?.length);
      console.log('JobPosting desc preview:', job.description?.slice(0, 300));
    }
  }
  console.log('\nSample data-testids:', result.allTestIds.filter((x) => x.len > 50).slice(0, 15));
}

await browser.close();
