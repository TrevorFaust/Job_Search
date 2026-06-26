function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchKeywords(job, keywords) {
  const haystack = `${job.title} ${job.company ?? ''} ${job.description ?? ''}`.toLowerCase();
  return keywords.filter((kw) =>
    new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`).test(haystack)
  );
}

export function isExcluded(job, excludeKeywords) {
  if (!excludeKeywords?.length) return false;
  const title = job.title.toLowerCase();
  return excludeKeywords.some((kw) =>
    new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`).test(title)
  );
}

export function matchesLocation(job, profile) {
  const loc = (job.location ?? '').toLowerCase();
  if (profile.remote_only) {
    return /\bremote\b/i.test(loc) || loc === '' || loc === 'anywhere';
  }
  if (!profile.locations?.length) return true;
  return profile.locations.some((l) => loc.includes(l.toLowerCase()));
}

export function profileMatchesJob(job, profile) {
  if (isExcluded(job, profile.exclude_keywords ?? [])) return null;
  const hits = matchKeywords(job, profile.keywords ?? []);
  if (!hits.length) return null;
  if (!matchesLocation(job, profile)) return null;
  return hits;
}

export const FREQUENCY_HOURS = {
  daily: 24,
  every_3_days: 72,
  weekly: 168,
};

export function isDueForDigest(profile, now = new Date()) {
  if (!profile.last_sent_at) return true;
  const hours = FREQUENCY_HOURS[profile.frequency] ?? 24;
  const elapsed = now - new Date(profile.last_sent_at);
  return elapsed >= hours * 60 * 60 * 1000;
}
