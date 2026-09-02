import type { FollowUpContact, FollowUpContactRole } from './llm';
import type { WebSearchResponse, WebSearchResult } from './web-search';
import {
  textShowsEmploymentAtCompany,
  linkedInHitMentionsCompany,
  extractPrimaryTeamKeywords,
  contactTitleRelevanceScore,
  resolveContactDisplayTitle,
  inferContactRoleType,
  parseTitleFromLinkedInEvidence,
  parseLinkedInSearchLine,
  personNamesMatch,
  titleLooksLikePersonName,
  looksLikeJobTitle,
  looksLikePersonName,
} from './follow-up-utils';

function inferRoleType(title: string, primaryKeywords: string[]): FollowUpContactRole {
  const fromTitle = inferContactRoleType(title);
  if (fromTitle !== 'other') return fromTitle;

  const t = title.toLowerCase();
  const titleMatchesJob = primaryKeywords.some((keyword) => t.includes(keyword));
  if (/manager|director|head of|vp|vice president/.test(t) && titleMatchesJob) {
    return 'hiring_manager';
  }
  if (/analyst|engineer|developer|designer|strategist|scientist|lead/.test(t) && titleMatchesJob) {
    return 'team_lead';
  }
  return 'other';
}

function normalizeLinkedInUrl(link: string): string {
  const trimmed = link.trim().split('?')[0]!;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

function findLinkedInProfileUrl(blob: string, link: string): string | undefined {
  if (/linkedin\.com\/in\//i.test(link)) return normalizeLinkedInUrl(link);
  const embedded = blob.match(/https?:\/\/[^\s"'<>]*linkedin\.com\/in\/[^\s"'?)<>]+/i)?.[0];
  return embedded ? normalizeLinkedInUrl(embedded) : undefined;
}

function pickBestEvidence(name: string, result: WebSearchResult, company: string): string {
  if (parseTitleFromLinkedInEvidence(name, result.title, company)) return result.title;
  if (parseTitleFromLinkedInEvidence(name, result.snippet, company)) return result.snippet;
  if (personNamesMatch(parseLinkedInSearchLine(result.title, name, company).name, name)) {
    return result.title;
  }
  return result.title || result.snippet;
}

function resolveTitleFromSearchResult(
  name: string,
  result: WebSearchResult,
  company: string
): string {
  const parsed = parseLinkedInSearchLine(result.title, name, company);

  if (
    parsed.title &&
    personNamesMatch(parsed.name, name) &&
    !titleLooksLikePersonName(parsed.title, name)
  ) {
    return parsed.title;
  }

  const fromTitle = parseTitleFromLinkedInEvidence(name, result.title, company);
  if (fromTitle) return fromTitle;

  const fromSnippet = parseTitleFromLinkedInEvidence(name, result.snippet, company);
  if (fromSnippet) return fromSnippet;

  return resolveContactDisplayTitle(
    name,
    titleLooksLikePersonName(parsed.title, name) ? undefined : parsed.title,
    pickBestEvidence(name, result, company),
    company
  );
}

function scoreSearchHitForName(result: WebSearchResult, name: string, company: string): number {
  let score = 0;
  const blob = `${result.title}\n${result.snippet}\n${result.link}`;
  const parsed = parseLinkedInSearchLine(result.title, name, company);

  if (/linkedin\.com\/in\//i.test(result.link)) score += 12;
  if (personNamesMatch(parsed.name, name) && parsed.title && looksLikeJobTitle(parsed.title, company)) {
    score += 14;
  }
  if (parseTitleFromLinkedInEvidence(name, result.title, company)) score += 10;
  if (parseTitleFromLinkedInEvidence(name, result.snippet, company)) score += 6;
  if (/recruiter|manager|director|analyst|engineer|vp|head of/i.test(parsed.title || result.title)) {
    score += 4;
  }
  if (textShowsEmploymentAtCompany(result.title, company)) score += 3;
  if (titleLooksLikePersonName(parsed.title || result.snippet.slice(0, 80), name)) score -= 8;
  if (textShowsEmploymentAtCompany(blob, company)) score += 2;
  return score;
}

function buildContactFromSearchHit(
  name: string,
  title: string,
  evidence: string,
  linkedinUrl: string | undefined,
  company: string,
  primaryKeywords: string[],
  rationale: string,
  confidence: FollowUpContact['confidence'] = 'medium'
): FollowUpContact {
  const resolvedTitle = resolveContactDisplayTitle(name, title, evidence, company);
  const draft: FollowUpContact = {
    id: crypto.randomUUID(),
    name,
    title: resolvedTitle,
    linkedin_url: linkedinUrl,
    role_type: inferRoleType(resolvedTitle, primaryKeywords),
    rationale,
    confidence,
    company_evidence: evidence.slice(0, 220),
    source: 'search',
  };

  if (
    /vp|vice president|director|head of/i.test(resolvedTitle) &&
    contactTitleRelevanceScore(draft, primaryKeywords) >= 1
  ) {
    draft.role_type = 'hiring_manager';
  }

  return draft;
}

/** Pull people named in the LLM overview out of raw search hits (e.g. hiring manager cited but not in /in/ list). */
export function extractContactsForNamesFromSearches(
  searches: WebSearchResponse[],
  names: string[],
  company: string,
  job: { title: string; description: string }
): FollowUpContact[] {
  if (!names.length || !company.trim()) return [];

  const primaryKeywords = extractPrimaryTeamKeywords(job.title);
  const seen = new Set<string>();
  const contacts: FollowUpContact[] = [];

  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const nameParts = key.split(/\s+/).filter((p) => p.length > 1);

    let bestResult: WebSearchResult | null = null;
    let bestScore = -Infinity;

    for (const search of searches) {
      for (const result of search.results) {
        const blob = `${result.title}\n${result.snippet}\n${result.link}`;
        const blobLower = blob.toLowerCase();
        if (!nameParts.every((part) => blobLower.includes(part))) continue;
        if (!linkedInHitMentionsCompany(result.title, result.snippet, result.link, company)) continue;

        const score = scoreSearchHitForName(result, name, company);
        if (score > bestScore) {
          bestScore = score;
          bestResult = result;
        }
      }
    }

    if (!bestResult) continue;

    const title = resolveTitleFromSearchResult(name, bestResult, company);
    const linkedinUrl = findLinkedInProfileUrl(
      `${bestResult.title}\n${bestResult.snippet}\n${bestResult.link}`,
      bestResult.link
    );
    const evidence = pickBestEvidence(name, bestResult, company);

    const draft = buildContactFromSearchHit(
      name,
      title,
      evidence,
      linkedinUrl,
      company,
      primaryKeywords,
      `Identified in search results as a key contact for this role.`,
      linkedinUrl ? 'high' : 'medium'
    );

    if (
      primaryKeywords.length >= 1 &&
      contactTitleRelevanceScore(draft, primaryKeywords) < 1 &&
      draft.role_type !== 'recruiter' &&
      !/vp|vice president|director|head of|manager/i.test(title)
    ) {
      continue;
    }

    contacts.push(draft);
    seen.add(key);
  }

  return contacts;
}

/** Pull verified employees directly from Serper LinkedIn profile hits. */
export function extractLinkedInContactsFromSearches(
  searches: WebSearchResponse[],
  company: string | null,
  job?: { title: string; description: string }
): FollowUpContact[] {
  if (!company?.trim()) return [];

  const primaryKeywords = job ? extractPrimaryTeamKeywords(job.title) : [];
  const seen = new Set<string>();
  const contacts: FollowUpContact[] = [];

  for (const search of searches) {
    for (const result of search.results) {
      if (!/linkedin\.com\/in\//i.test(result.link)) continue;

      const blob = `${result.title}\n${result.snippet}`;
      if (!linkedInHitMentionsCompany(result.title, result.snippet, result.link, company)) continue;

      const parsed = parseLinkedInSearchLine(result.title, undefined, company);
      const name = parsed.name || result.title.split(/\s[-–—|]/)[0]?.trim() || '';
      if (!name || name.length < 3 || /linkedin|profile|see more/i.test(name)) continue;
      if (!looksLikePersonName(name) && !parsed.title) continue;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;

      const title = resolveContactDisplayTitle(
        name,
        titleLooksLikePersonName(parsed.title, name) ? undefined : parsed.title,
        pickBestEvidence(name, result, company),
        company
      );
      const draft = buildContactFromSearchHit(
        name,
        title,
        pickBestEvidence(name, result, company),
        normalizeLinkedInUrl(result.link),
        company,
        primaryKeywords,
        `Found via LinkedIn search for ${company}.`
      );

      if (job && primaryKeywords.length >= 1 && contactTitleRelevanceScore(draft, primaryKeywords) < 1) {
        if (
          draft.role_type !== 'recruiter' &&
          draft.role_type !== 'hiring_manager' &&
          draft.role_type !== 'team_lead'
        ) {
          continue;
        }
      }

      seen.add(key);
      contacts.push(draft);
    }
  }

  return contacts.slice(0, 15);
}
