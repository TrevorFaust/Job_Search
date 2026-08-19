import { fetchJson, truncateDescription, isPublishableJob, USER_AGENT } from './utils.js';

export const name = 'bdge';
export const alertLabel = 'BDGE';
export const alertUrl = 'https://bdge.co/careers';

const LIST_URL = 'https://bdge.co/api/careers/jobs';
const CAREERS_URL = alertUrl;

function formatLocation(job) {
  const parts = [job.location, job.workplaceType, job.employmentType].filter(Boolean);
  return parts.join(' · ') || null;
}

/** Extract plain text from TipTap / ProseMirror JSON stored in BDGE job postings. */
function proseMirrorToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.text === 'string') return node.text;

  const content = node.content;
  if (!Array.isArray(content)) return '';

  const blockBreak = ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'].includes(
    node.type
  );

  return content
    .map((child) => proseMirrorToText(child))
    .join(blockBreak ? '\n' : '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchJobDetail(id) {
  try {
    const res = await fetch(`${LIST_URL}/${id}`, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function toScrapedJob(job, detail) {
  const merged = detail ? { ...job, ...detail } : job;
  let description = merged.summary ?? '';
  const fromJson = proseMirrorToText(merged.descriptionJson);
  if (fromJson.length > description.length) description = fromJson;

  return {
    source: name,
    externalId: merged.id,
    title: merged.title,
    company: 'BDGE',
    location: formatLocation(merged),
    url: `${CAREERS_URL}/${merged.slug}`,
    salary: merged.compensation ?? null,
    description: truncateDescription(description),
    postedAt: merged.postedAt ?? null,
    isSpecial: true,
  };
}

export async function scrape() {
  const listings = await fetchJson(LIST_URL);
  if (!Array.isArray(listings) || !listings.length) return [];

  const jobs = [];
  for (const listing of listings) {
    if (!listing?.id || !listing?.title || !listing?.slug) continue;
    const detail = await fetchJobDetail(listing.id);
    const job = toScrapedJob(listing, detail);
    if (isPublishableJob(job)) jobs.push(job);
  }

  return jobs;
}
