export function prioritySourceMeta(_source: string, company?: string | null) {
  const label = company ?? _source;
  return { label, externalCta: 'View careers page →' };
}

export function priorityBannerText(source: string, company?: string | null) {
  const { label } = prioritySourceMeta(source, company);
  return `${label} posted an open role — this listing is pinned to the top of your board.`;
}
