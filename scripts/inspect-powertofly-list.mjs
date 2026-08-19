import { chromium } from 'playwright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ userAgent: USER_AGENT, viewport: { width: 1366, height: 900 } });

await page.goto('https://powertofly.com/jobs/?location=United%20States', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
}

const cards = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a[href*="/jobs/detail/"]')];
  const samples = links.slice(0, 8).map((a) => {
    const card = a.closest('article, li, [class*="card"], [class*="job"], div');
    return {
      href: a.href,
      text: a.textContent?.replace(/\s+/g, ' ').trim(),
      classes: a.className,
      cardTag: card?.tagName,
      cardClass: card?.className?.slice(0, 120),
      cardText: card?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180),
    };
  });
  return samples;
});

console.log(JSON.stringify(cards, null, 2));
await browser.close();
