import { chromium } from 'playwright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ userAgent: USER_AGENT, viewport: { width: 1366, height: 900 } });

await page.goto('https://www.dice.com/jobs?countryCode=US&radius=30&radiusUnit=mi&pageSize=20&page=1&postedDate=3', {
  waitUntil: 'domcontentloaded',
  timeout: 45000,
});
await page.waitForSelector('[data-testid="job-card"]', { timeout: 15000 });

const cards = await page.$$eval('[data-testid="job-card"]', (els) =>
  els.slice(0, 5).map((el) => {
    const ps = [...el.querySelectorAll('p')].map((p) => ({
      classes: p.className,
      text: p.textContent.trim(),
    }));
    return {
      title: el.querySelector('a[data-testid="job-search-job-detail-link"]')?.textContent?.trim(),
      company:
        el.querySelector('a[href*="company-profile"] p')?.textContent?.trim() ??
        el.querySelector('a[href*="company-profile"] img')?.alt,
      lineClamp: el.querySelector('p.line-clamp-2')?.textContent?.trim(),
      allPs: ps,
    };
  })
);

console.log(JSON.stringify(cards, null, 2));

await browser.close();
