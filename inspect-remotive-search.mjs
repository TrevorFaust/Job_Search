import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
for (const q of ['sport', 'fanatics', '']) {
  const url = q
    ? `https://remotive.com/remote-jobs?query=${encodeURIComponent(q)}`
    : 'https://remotive.com/remote-jobs';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  const jobs = await page.$$eval('a[href*="/remote/jobs/"]', (els) =>
    els
      .map((a) => ({ href: a.href, title: a.textContent?.replace(/\s+/g, ' ').trim() }))
      .filter((x) => /\/remote\/jobs\/.+-\d+$/.test(x.href))
  );
  const uniq = [...new Map(jobs.map((j) => [j.href, j])).values()];
  console.log(q || '(all)', uniq.length, uniq.slice(0, 2).map((j) => j.title.slice(0, 50)));
}
await browser.close();
