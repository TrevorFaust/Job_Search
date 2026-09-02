export function prioritySourceMeta(_source: string, company?: string | null) {
  const label = company?.trim() || _source;
  return { label, externalCta: 'View careers page →' };
}

export function priorityBannerText(source: string, company?: string | null) {
  const { label } = prioritySourceMeta(source, company);
  return `${label} posted an open role — open it from the Priority tab.`;
}

export function jobOrganization(job: { company?: string | null; source: string }) {
  return (job.company?.trim() || job.source || 'Unknown').trim();
}

export function jobPlace(job: { location?: string | null }) {
  const loc = job.location?.trim();
  return loc && loc.length ? loc : 'Location n/a';
}

export function uniqueSortedLabels(values: string[]) {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}
