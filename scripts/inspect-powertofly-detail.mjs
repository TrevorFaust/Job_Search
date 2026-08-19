import { chromium } from 'playwright';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ userAgent: USER_AGENT, viewport: { width: 1366, height: 900 } });

await page.goto('https://powertofly.com/jobs/detail/2543672', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2000);

const data = await page.evaluate(() => {
  const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
  let posting = null;
  for (const s of scripts) {
    try {
      const parsed = JSON.parse(s.textContent);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      posting = items.find((x) => x?.['@type'] === 'JobPosting') ?? posting;
    } catch {}
  }

  const h3s = [...document.querySelectorAll('h3')];
  const jobDetailsH3 = h3s.find((h) => /^job details$/i.test(h.textContent?.trim() ?? ''));
  let sectionText = '';
  if (jobDetailsH3) {
    const parts = [];
    let node = jobDetailsH3.nextElementSibling;
    while (node && !(node.tagName === 'H3' && /^skills$/i.test(node.textContent?.trim() ?? ''))) {
      parts.push(node.innerText?.trim() ?? '');
      node = node.nextElementSibling;
    }
    sectionText = parts.filter(Boolean).join('\n\n');
  }

  const main = document.querySelector('main')?.innerText?.trim() ?? '';

  return {
    postingKeys: posting ? Object.keys(posting) : null,
    postingTitle: posting?.title,
    postingCompany: posting?.hiringOrganization?.name,
    postingDescLen: posting?.description?.length,
    postingDescPreview: posting?.description?.slice(0, 300),
    sectionTextLen: sectionText.length,
    sectionPreview: sectionText.slice(0, 300),
    mainLen: main.length,
    mainPreview: main.slice(0, 300),
  };
});

console.log(JSON.stringify(data, null, 2));

await page.goto('https://powertofly.com/jobs/?location=United%20States', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 8; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
}

const links = await page.$$eval('a[href*="/jobs/detail/"]', (els) => {
  const byId = new Map();
  for (const a of els) {
    const id = a.href.match(/\/jobs\/detail\/(\d+)/)?.[1];
    if (!id) continue;
    const entry = {
      text: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      classes: a.className,
      isCopyLink: a.classList.contains('copy-job-url'),
    };
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(entry);
  }
  return Object.fromEntries([...byId.entries()].slice(0, 3));
});

console.log('\nSample list links per job:', JSON.stringify(links, null, 2));

await browser.close();
