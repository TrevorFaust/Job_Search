import type { FollowUpContact, FollowUpContactRole, FollowUpContactsResult } from './llm';

export type StoredFollowUpContacts = FollowUpContactsResult & {
  generated_at: string;
  search_queries?: string[];
  /** Set when "Find more" did not add anyone new. */
  no_new_contacts?: boolean;
  /** Ranked contacts discovered but not yet shown — revealed via Find more. */
  contact_pool?: FollowUpContact[];
  /** Shown when contacts were reused from another application at the same company. */
  inherited_from_company?: boolean;
};

/** How many auto-discovered contacts to show on first generate / regenerate. */
export const INITIAL_FOLLOW_UP_VISIBLE = 5;
/** How many additional contacts each Find more click reveals. */
export const FOLLOW_UP_FIND_MORE_BATCH = 5;
/** Max visible contacts (manual adds count toward this). */
export const MAX_FOLLOW_UP_CONTACTS = 12;
/** Cap on hidden pool size so storage stays bounded. */
export const MAX_FOLLOW_UP_POOL = 15;

function parseContacts(value: unknown): FollowUpContact[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is FollowUpContact =>
      !!c && typeof c === 'object' && typeof (c as FollowUpContact).name === 'string'
  );
}

export function isStoredFollowUpContacts(value: unknown): value is StoredFollowUpContacts {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.overview === 'string' &&
    Array.isArray(v.contacts) &&
    typeof v.connection_note === 'string' &&
    typeof v.follow_up_message === 'string' &&
    typeof v.generated_at === 'string'
  );
}

export function applyGlobalOutreachToContacts(
  stored: StoredFollowUpContacts
): StoredFollowUpContacts {
  const globalNote = stored.connection_note?.trim();
  const globalMessage = stored.follow_up_message?.trim();
  if (!globalNote && !globalMessage) {
    const needsRepair = stored.contacts.some(
      (c) => !c.connection_note?.trim() && c.follow_up_message?.trim()
    );
    if (!needsRepair && !stored.contact_pool?.some(
      (c) => !c.connection_note?.trim() && c.follow_up_message?.trim()
    )) {
      return stored;
    }
  }

  const merge = (contact: FollowUpContact): FollowUpContact => ({
    ...contact,
    connection_note:
      contact.connection_note?.trim() ||
      (globalNote && !outreachAddressesSomeoneElse(globalNote, contact.name)
        ? globalNote
        : undefined) ||
      deriveConnectionNoteFromFollowUp(contact),
    // Do not copy global follow-up — it is often addressed to one person
    follow_up_message:
      contact.follow_up_message?.trim() ||
      (globalMessage &&
      !contact.follow_up_message?.trim() &&
      !outreachAddressesSomeoneElse(globalMessage, contact.name)
        ? globalMessage
        : undefined),
  });

  return {
    ...stored,
    contacts: stored.contacts.map(merge),
    contact_pool: stored.contact_pool?.map(merge),
  };
}

/** Build a short LinkedIn connection note when only the follow-up was saved. */
function deriveConnectionNoteFromFollowUp(contact: FollowUpContact): string | undefined {
  if (contact.connection_note?.trim()) return undefined;
  const followUp = contact.follow_up_message?.trim();
  if (!followUp) return undefined;

  const firstName = contact.name.split(/\s+/)[0] ?? 'there';
  const firstSentence = followUp.split(/(?<=[.!?])\s+/)[0]?.trim();
  if (
    firstSentence &&
    firstSentence.length >= 20 &&
    firstSentence.length <= 280 &&
    !outreachAddressesSomeoneElse(firstSentence, contact.name)
  ) {
    return firstSentence;
  }

  return `Hi ${firstName}, I applied for this role and would love to connect.`;
}

export function normalizeStoredFollowUp(value: StoredFollowUpContacts): StoredFollowUpContacts {
  const contacts = normalizeFollowUpContactIds(parseContacts(value.contacts));
  const pool = value.contact_pool?.length
    ? normalizeFollowUpContactIds(parseContacts(value.contact_pool))
    : undefined;

  let normalized: StoredFollowUpContacts = applyGlobalOutreachToContacts({
    ...value,
    contacts,
    contact_pool: pool,
    company_email_domain: sanitizeFollowUpEmailField(value.company_email_domain),
    email_pattern: sanitizeFollowUpEmailField(value.email_pattern),
  });

  normalized = {
    ...normalized,
    contacts: normalized.contacts.map((c) => sanitizeContactOutreachCopy(c)),
    contact_pool: normalized.contact_pool?.map((c) => sanitizeContactOutreachCopy(c)),
  };

  return tierOversizedStoredContacts(normalized);
}

/** One-time reshape: if an older run saved 8+ contacts with no pool, hold extras back. */
function tierOversizedStoredContacts(value: StoredFollowUpContacts): StoredFollowUpContacts {
  if (value.contact_pool?.length) return value;

  const manual = value.contacts.filter((c) => c.source === 'manual');
  const auto = sortFollowUpContacts(value.contacts.filter((c) => c.source !== 'manual'));
  if (auto.length <= INITIAL_FOLLOW_UP_VISIBLE) return value;

  const { visible, pool } = tierAutoDiscoveredContacts(auto, INITIAL_FOLLOW_UP_VISIBLE);
  return {
    ...value,
    contacts: sortFollowUpContacts([...manual, ...visible]),
    contact_pool: pool.length ? pool : undefined,
  };
}

export function parseStoredFollowUpContacts(value: unknown): StoredFollowUpContacts | null {
  if (!isStoredFollowUpContacts(value)) return null;
  return normalizeStoredFollowUp(value);
}

const SENIOR_TITLE_PATTERN =
  /\b(svp|senior vice president|evp|executive vice president|vice president|\bvp\b|ceo|coo|cfo|chief|president|partner)\b/i;

const ROLE_PRIORITY: Record<FollowUpContactRole, number> = {
  recruiter: 0,
  hiring_manager: 1,
  team_lead: 2,
  other: 3,
};

export function isSeniorTitle(title: string): boolean {
  return SENIOR_TITLE_PATTERN.test(title);
}

const JOB_KEYWORD_STOP = new Set([
  'manager',
  'senior',
  'junior',
  'lead',
  'director',
  'associate',
  'assistant',
  'specialist',
  'coordinator',
  'position',
  'role',
  'team',
  'work',
  'remote',
  'hybrid',
  'full',
  'time',
  'year',
  'years',
  'experience',
  'required',
  'preferred',
  'ability',
  'strong',
  'including',
  'support',
  'across',
  'within',
  'using',
  'other',
  'chicago',
  'bulls',
]);

/** High-signal keywords from the job title — used to filter/rank contacts by team fit. */
export function extractPrimaryTeamKeywords(jobTitle: string): string[] {
  const seen = new Set<string>();
  for (const word of jobTitle.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []) {
    if (!JOB_KEYWORD_STOP.has(word)) seen.add(word);
  }
  return [...seen];
}

/** Keywords from the job used to rank contacts by team fit. */
export function extractJobMatchKeywords(job: { title: string; description: string }): string[] {
  const seen = new Set(extractPrimaryTeamKeywords(job.title));
  const add = (text: string) => {
    for (const word of text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []) {
      if (!JOB_KEYWORD_STOP.has(word)) seen.add(word);
    }
  };
  add(job.description.slice(0, 1200));
  return [...seen].slice(0, 24);
}

export function contactJobRelevanceScore(
  contact: { title: string; rationale?: string; company_evidence?: string },
  keywords: string[]
): number {
  if (!keywords.length) return 0;
  const blob = `${contact.title} ${contact.rationale ?? ''} ${contact.company_evidence ?? ''}`.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (blob.includes(keyword)) score++;
  }
  return score;
}

/** Match only on title/evidence — avoids false positives from broad JD keywords like "sales" or "digital". */
export function contactTitleRelevanceScore(
  contact: { title: string; company_evidence?: string },
  keywords: string[]
): number {
  if (!keywords.length) return 0;
  const blob = `${contact.title} ${contact.company_evidence ?? ''}`.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (blob.includes(keyword)) score++;
  }
  return score;
}

export function filterContactsByJobRelevance(
  contacts: FollowUpContact[],
  job: { title: string; description: string }
): FollowUpContact[] {
  const primaryKeywords = extractPrimaryTeamKeywords(job.title);
  if (primaryKeywords.length < 1) return contacts;

  return contacts.filter((contact) => {
    if (contact.source === 'manual') return true;
    if (
      contact.role_type === 'recruiter' ||
      contact.role_type === 'hiring_manager' ||
      contact.role_type === 'team_lead'
    ) {
      return true;
    }
    return contactTitleRelevanceScore(contact, primaryKeywords) >= 1;
  });
}

const OVERVIEW_NAME_STOP = new Set([
  'business strategy',
  'data analytics',
  'chicago bulls',
  'linkedin post',
  'talent acquisition',
  'human resources',
  'hiring manager',
  'vice president',
  'follow up',
  'best path',
  'corporate partnerships',
  'manager data',
  'analytics solutions',
]);

/** Parse person names (First Last) referenced in LLM overview prose. */
export function parsePersonNamesFromOverview(text: string): string[] {
  const matches = text.match(/\b([A-Z][a-z]{2,} [A-Z][a-z]{2,})\b/g) ?? [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of matches) {
    const lower = match.toLowerCase();
    if (OVERVIEW_NAME_STOP.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    names.push(match);
  }
  return names;
}

/** Rewrite overview when it names people who are not on the contact list. */
export function alignOverviewWithContacts(
  overview: string,
  contacts: FollowUpContact[],
  company: string | null
): string {
  if (!contacts.length) return overview.trim();

  const listed = new Set(contacts.map((c) => c.name.toLowerCase()));
  const mentioned = parsePersonNamesFromOverview(overview);
  const missing = mentioned.filter((name) => !listed.has(name.toLowerCase()));
  if (missing.length === 0) return overview.trim();

  const primary = contacts[0]!;
  const backups = contacts.slice(1, 3);
  const companySuffix = company ? ` at ${company}` : '';
  let aligned = `Start with ${primary.name} (${primary.title})${companySuffix}.`;
  if (backups.length) {
    const first = primary.name.split(/\s+/)[0];
    aligned += ` If ${first} doesn't respond, consider ${backups.map((c) => c.name).join(' or ')}.`;
  }
  return aligned;
}

const JOB_TITLE_SIGNAL =
  /\b(recruiter|manager|director|analyst|engineer|developer|designer|vp|president|head of|lead|coordinator|specialist|strategist|consultant|associate|senior|junior|talent|operations|strategy|engineering|product|scientist|architect|officer|founder|creator|partner)\b/i;

function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fuzzy match for "Courtney West" vs "Courtney M. West". */
export function personNamesMatch(a: string, b: string): boolean {
  const partsA = normalizeNameKey(a).split(/\s+/).filter((p) => p.length > 1);
  const partsB = normalizeNameKey(b).split(/\s+/).filter((p) => p.length > 1);
  if (partsA.length < 2 || partsB.length < 2) return normalizeNameKey(a) === normalizeNameKey(b);
  const firstMatch = partsA[0] === partsB[0];
  const lastMatch = partsA[partsA.length - 1] === partsB[partsB.length - 1];
  return firstMatch && lastMatch;
}

/** True when text looks like a person name (First Last), not a job title. */
export function looksLikePersonName(text: string): boolean {
  const t = text.trim().replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
  if (!t || t.length > 70) return false;
  if (/\b(at|@)\s+\S/.test(t)) return false;
  if (JOB_TITLE_SIGNAL.test(t)) return false;
  if (/linkedin|profile|experience|education|connections/i.test(t)) return false;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;

  const nameLike = words.filter((w) =>
    /^[A-Z][a-z'.-]+$/.test(w) || /^[A-Z]\.?$/.test(w) || /^[a-z]\.$/.test(w)
  );
  return nameLike.length >= 2 && nameLike.length >= words.length - 1;
}

/** True when text looks like a LinkedIn headline / job title. */
export function looksLikeJobTitle(text: string, company?: string | null): boolean {
  const t = text.trim();
  if (!t || t.length > 140) return false;
  if (looksLikePersonName(t)) return false;
  if (/\b(at|@)\s+[A-Z]/i.test(t)) return true;
  if (JOB_TITLE_SIGNAL.test(t)) return true;
  if (company && t.toLowerCase().includes(company.trim().toLowerCase())) return true;
  return false;
}

/** Title field accidentally set to the contact's name (or another person's name). */
export function titleLooksLikePersonName(title: string, contactName: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (personNamesMatch(t, contactName)) return true;
  if (looksLikePersonName(t) && !looksLikeJobTitle(t)) return true;
  return false;
}

/** Parse "Name - Title" or "Title - Name" Google/LinkedIn result lines. */
export function parseLinkedInSearchLine(
  line: string,
  expectedName?: string,
  company?: string | null
): { name: string; title: string } {
  const cleaned = line.trim().replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
  const parts = cleaned.split(/\s[-–—|]\s/).map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 2) {
    const first = parts[0]!;
    const rest = parts.slice(1).join(' - ');

    if (expectedName) {
      if (personNamesMatch(first, expectedName)) return { name: first, title: rest };
      if (personNamesMatch(rest, expectedName)) return { name: rest, title: first };
    }

    const firstIsName = looksLikePersonName(first);
    const restIsName = looksLikePersonName(rest);
    const firstIsTitle = looksLikeJobTitle(first, company);
    const restIsTitle = looksLikeJobTitle(rest, company);

    if (firstIsName && restIsTitle) return { name: first, title: rest };
    if (restIsName && firstIsTitle) return { name: rest, title: first };
    if (firstIsName && !restIsName) return { name: first, title: rest };
    if (restIsName && !firstIsName) return { name: rest, title: first };

    return { name: first, title: rest };
  }

  if (expectedName && personNamesMatch(cleaned, expectedName)) {
    return { name: cleaned, title: '' };
  }
  if (looksLikePersonName(cleaned)) return { name: cleaned, title: '' };
  return { name: '', title: cleaned };
}

/** True when a string looks like LinkedIn About/snippet text rather than a job title. */
export function looksLikeSnippetTitle(title: string, name: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (titleLooksLikePersonName(t, name)) return true;
  if (t.length > 100) return true;
  if (/^(I |I'm |I am |We |As a |With a )/i.test(t)) return true;
  if (/\.\.\.|…/.test(t)) return true;
  if (/\b(degree|certification|university|passionate about|skills in|experience in)\b/i.test(t)) {
    return true;
  }
  if (/\b(at|@)\s+[A-Z]/i.test(t)) return false;
  if (JOB_TITLE_SIGNAL.test(t)) return false;
  const nameParts = name.split(/\s+/).filter((p) => p.length > 1);
  if (
    nameParts.length > 0 &&
    t.split(/\s+/).length <= 3 &&
    nameParts.every((p) => !t.toLowerCase().includes(p.toLowerCase()))
  ) {
    return true;
  }
  return false;
}

/** Extract job title from Google/LinkedIn search evidence like "Jane Doe - Senior Recruiter at Acme". */
export function parseTitleFromLinkedInEvidence(
  name: string,
  evidence: string,
  company: string | null
): string | null {
  const e = evidence.trim();
  if (!e) return null;

  const fromLine = parseLinkedInSearchLine(e.replace(/\s*\|\s*LinkedIn.*$/i, ''), name, company);
  if (
    fromLine.title &&
    personNamesMatch(fromLine.name, name) &&
    !titleLooksLikePersonName(fromLine.title, name) &&
    !looksLikeSnippetTitle(fromLine.title, name)
  ) {
    return fromLine.title;
  }

  const namePattern = escapeRegex(name.trim());
  const dashMatch = e.match(new RegExp(`${namePattern}\\s*[-–—|]\\s*([^|\\n]+)`, 'i'));
  if (dashMatch?.[1]) {
    const extracted = dashMatch[1].trim().replace(/\s*\|\s*LinkedIn.*$/i, '');
    if (
      extracted.length >= 3 &&
      extracted.length <= 120 &&
      !titleLooksLikePersonName(extracted, name) &&
      !looksLikeSnippetTitle(extracted, name)
    ) {
      return extracted;
    }
  }

  if (company) {
    const companyPattern = escapeRegex(company.trim());
    const atMatch = e.match(
      new RegExp(`([A-Za-z][^.\\n|·]{2,90}\\bat\\s+${companyPattern})`, 'i')
    );
    if (atMatch?.[1]) {
      const extracted = atMatch[1].trim();
      if (!titleLooksLikePersonName(extracted, name) && !looksLikeSnippetTitle(extracted, name)) {
        return extracted;
      }
    }
  }

  // Snippet: "Name. Senior Recruiter at Company. Chicago..."
  const dotMatch = e.match(
    new RegExp(`${namePattern}\\s*[.:]\\s*([^.\\n|·]{3,90}(?:\\bat\\s+\\S+)?)`, 'i')
  );
  if (dotMatch?.[1]) {
    const extracted = dotMatch[1].trim();
    if (!titleLooksLikePersonName(extracted, name) && !looksLikeSnippetTitle(extracted, name)) {
      return extracted;
    }
  }

  return null;
}

/** Prefer structured LinkedIn headline over snippet garbage. */
export function resolveContactDisplayTitle(
  name: string,
  title: string | undefined,
  evidence: string | undefined,
  company: string | null
): string {
  const sources = [evidence, title].filter((s): s is string => !!s?.trim());
  for (const source of sources) {
    const fromEvidence = parseTitleFromLinkedInEvidence(name, source, company);
    if (fromEvidence) return fromEvidence;
  }

  const trimmed = title?.trim() ?? '';
  if (trimmed && !titleLooksLikePersonName(trimmed, name) && !looksLikeSnippetTitle(trimmed, name)) {
    return trimmed;
  }

  return company ? `Team member at ${company}` : 'Team member';
}

/** Infer outreach role from a resolved job title string. */
export function inferContactRoleType(title: string): FollowUpContactRole {
  const t = title.toLowerCase();
  if (/recruit|talent acquisition|people ops|human resources|\bhr\b/.test(t)) return 'recruiter';
  if (/manager|director|head of|vp|vice president/.test(t)) return 'hiring_manager';
  if (/analyst|engineer|developer|designer|strategist|scientist|lead/.test(t)) return 'team_lead';
  return 'other';
}

/** Fix title/role when search extraction or LLM picked snippet text instead of headline. */
export function normalizeContactFromSearchMetadata(
  contact: FollowUpContact,
  company: string | null
): FollowUpContact {
  if (contact.source === 'manual') return contact;

  const evidenceSources = [contact.company_evidence, contact.title].filter(
    (s): s is string => !!s?.trim()
  );
  let resolvedTitle: string | null = null;
  for (const source of evidenceSources) {
    resolvedTitle = parseTitleFromLinkedInEvidence(contact.name, source, company);
    if (resolvedTitle) break;
  }

  if (!resolvedTitle) {
    resolvedTitle = resolveContactDisplayTitle(
      contact.name,
      titleLooksLikePersonName(contact.title, contact.name) ? undefined : contact.title,
      contact.company_evidence,
      company
    );
  }

  const role_type =
    contact.role_type === 'recruiter' || inferContactRoleType(resolvedTitle) !== 'other'
      ? inferContactRoleType(resolvedTitle)
      : contact.role_type;

  return { ...contact, title: resolvedTitle, role_type };
}

/** Extract name + title from a LinkedIn Google result line. */
export function parsePersonFromLinkedInEvidence(
  evidence: string,
  company?: string | null
): { name: string; title: string } | null {
  const cleaned = evidence.trim().replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
  if (!cleaned) return null;

  const parsed = parseLinkedInSearchLine(cleaned, undefined, company);
  if (looksLikePersonName(parsed.name) && parsed.title && !titleLooksLikePersonName(parsed.title, parsed.name)) {
    return { name: parsed.name, title: parsed.title };
  }

  const headline = cleaned.match(
    /^([A-Z][a-z]+(?:\s+(?:[A-Z]\.?|[A-Z][a-z'.-]+))+)\s*[-–—|]\s*(.+)$/
  );
  if (headline?.[1] && headline[2]) {
    const name = headline[1].trim();
    const title = headline[2].trim();
    if (looksLikePersonName(name) && !titleLooksLikePersonName(title, name)) {
      return { name, title };
    }
  }

  return null;
}

/** True when the contact name field looks like a real person (not snippet/title garbage). */
export function contactNameLooksValid(name: string): boolean {
  const n = name.trim();
  if (n.length < 3 || n.length > 70) return false;
  if (!looksLikePersonName(n)) return false;
  if (looksLikeJobTitle(n)) return false;
  if (/^(I |I'm |I am |As a |With a )/i.test(n)) return false;
  if (n.length > 100 || /\.\.\.|…/.test(n)) return false;
  return true;
}

/**
 * Fix contacts where name/title were swapped or parsed from snippet text.
 * Returns null when identity cannot be recovered.
 */
export function repairContactIdentity(
  contact: FollowUpContact,
  company: string | null
): FollowUpContact | null {
  if (contact.source === 'manual') return contact;

  let name = contact.name.trim();
  let title = contact.title.trim();

  if (!contactNameLooksValid(name)) {
    let repaired: { name: string; title: string } | null = null;
    for (const source of [contact.company_evidence, contact.title, contact.name]) {
      if (!source?.trim()) continue;
      repaired = parsePersonFromLinkedInEvidence(source, company);
      if (repaired) break;
    }
    if (repaired) {
      name = repaired.name;
      if (!title || title.includes(repaired.name) || !looksLikeJobTitle(title, company)) {
        title = repaired.title;
      }
    } else if (titleLooksLikePersonName(name, '') || looksLikeSnippetTitle(name, '')) {
      return null;
    }
  }

  if (title.includes(name) && /\s[-–—|]\s/.test(title)) {
    const parsed = parseLinkedInSearchLine(title, name, company);
    if (personNamesMatch(parsed.name, name) && parsed.title) {
      title = parsed.title;
    }
  }

  if (!contactNameLooksValid(name) && name.trim().length < 3) return null;

  return normalizeContactFromSearchMetadata({ ...contact, name, title }, company);
}

export function linkedInProfileSlug(url?: string): string | null {
  return url?.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? null;
}

function contactIdentityKey(contact: FollowUpContact): string | null {
  const slug = linkedInProfileSlug(contact.linkedin_url);
  if (slug) return `li:${slug}`;

  if (contactNameLooksValid(contact.name)) {
    return `name:${normalizeNameKey(contact.name)}`;
  }

  const parsed = parsePersonFromLinkedInEvidence(
    contact.company_evidence ?? contact.title ?? '',
    null
  );
  if (parsed?.name) return `name:${normalizeNameKey(parsed.name)}`;

  // Last resort — keep contact rather than silently drop
  if (contact.name.trim().length >= 3) {
    return `raw:${normalizeNameKey(contact.name)}`;
  }

  return null;
}

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;

function pickPreferredContact(a: FollowUpContact, b: FollowUpContact): FollowUpContact {
  const aValid = contactNameLooksValid(a.name);
  const bValid = contactNameLooksValid(b.name);
  if (aValid && !bValid) return a;
  if (bValid && !aValid) return b;

  const aConf = CONFIDENCE_RANK[a.confidence] ?? 0;
  const bConf = CONFIDENCE_RANK[b.confidence] ?? 0;
  if (aConf !== bConf) return aConf > bConf ? a : b;

  if (a.linkedin_url && !b.linkedin_url) return a;
  if (b.linkedin_url && !a.linkedin_url) return b;

  if (a.title.length > 0 && a.title.length < b.title.length) return a;
  if (b.title.length > 0 && b.title.length < a.title.length) return b;

  return a;
}

/** Merge duplicate contacts (same LinkedIn profile or same person name). */
export function dedupeFollowUpContacts(contacts: FollowUpContact[]): FollowUpContact[] {
  const byKey = new Map<string, FollowUpContact>();

  for (const contact of contacts) {
    const key = contactIdentityKey(contact);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? pickPreferredContact(existing, contact) : contact);
  }

  const merged = [...byKey.values()];

  // Fuzzy name pass for contacts without LinkedIn URLs
  const result: FollowUpContact[] = [];
  for (const contact of merged) {
    const dupeIdx = result.findIndex(
      (r) =>
        personNamesMatch(r.name, contact.name) ||
        (linkedInProfileSlug(r.linkedin_url) &&
          linkedInProfileSlug(r.linkedin_url) === linkedInProfileSlug(contact.linkedin_url))
    );
    if (dupeIdx >= 0) {
      result[dupeIdx] = pickPreferredContact(result[dupeIdx]!, contact);
    } else {
      result.push(contact);
    }
  }

  return result;
}

/** Repair, normalize, and dedupe a contact list. */
export function normalizeFollowUpContactList(
  contacts: FollowUpContact[],
  company: string | null
): FollowUpContact[] {
  return dedupeFollowUpContacts(
    contacts
      .map((c) => repairContactIdentity(c, company))
      .filter((c): c is FollowUpContact => c !== null)
      .map((c) => sanitizeContactOutreachCopy(c))
  );
}

/** Drop outreach copy clearly addressed to a different person (e.g. global draft copied to everyone). */
function outreachAddressesSomeoneElse(text: string | undefined, contactName: string): boolean {
  if (!text?.trim() || !contactName.trim()) return false;
  const match = text.trim().match(/^hi\s+([^,—–\-\n!]+)/i);
  if (!match?.[1]) return false;

  const addressee = match[1].trim().toLowerCase();
  const addresseeFirst = addressee.split(/\s+/)[0] ?? addressee;
  const contactFirst = contactName.split(/\s+/)[0]?.toLowerCase() ?? '';

  const generic = new Set([
    'there',
    'team',
    'all',
    'everyone',
    'recruiter',
    'hiring',
    'manager',
    'hello',
    'dear',
  ]);
  if (generic.has(addresseeFirst)) return false;

  if (!contactFirst || addresseeFirst.length < 2) return false;
  if (addresseeFirst === contactFirst) return false;
  if (addressee.includes(contactFirst) || contactFirst.includes(addresseeFirst)) return false;

  // Only strip when addressee looks like a person's first name, not a role phrase
  if (!/^[a-z'-]+$/.test(addresseeFirst)) return false;
  if (JOB_TITLE_SIGNAL.test(addresseeFirst)) return false;

  return true;
}

export function sanitizeContactOutreachCopy(contact: FollowUpContact): FollowUpContact {
  return {
    ...contact,
    connection_note: contact.connection_note?.trim() || undefined,
    follow_up_message: outreachAddressesSomeoneElse(contact.follow_up_message, contact.name)
      ? undefined
      : contact.follow_up_message?.trim() || undefined,
  };
}

const UNKNOWN_EMAIL_VALUE = /^(unknown|n\/a|not found|none|null)([\s—–-].*)?$/i;

export function sanitizeFollowUpEmailField(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || UNKNOWN_EMAIL_VALUE.test(trimmed)) return undefined;
  return trimmed;
}

/** Keep VP+ when verified with evidence; generic execs without team fit are still deprioritized in sort. */
export function shouldIncludeSeniorContact(contact: FollowUpContact): boolean {
  if (!isSeniorTitle(contact.title)) return true;
  if (!contact.company_evidence?.trim()) return false;
  return (
    contact.role_type === 'recruiter' ||
    contact.role_type === 'hiring_manager' ||
    contact.role_type === 'team_lead'
  );
}

/** Company name variants for matching search snippets (e.g. "BDGE", "bdge"). */
export function companyMatchTokens(company: string | null): string[] {
  if (!company?.trim()) return [];
  const tokens = new Set<string>();
  const raw = company.trim().toLowerCase();
  tokens.add(raw);

  const stripped = raw
    .replace(
      /\b(the|inc|incorporated|llc|l\.l\.c\.|corp|corporation|ltd|limited|co|company|group|holdings)\b\.?/gi,
      ''
    )
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped && stripped !== raw) tokens.add(stripped);

  const words = stripped.split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 1) {
    if (words[0].length >= 3) tokens.add(words[0]);
  } else if (words.length > 1) {
    const sig = words.filter((w) => !/^(and|of|for)$/i.test(w));
    if (sig.length >= 2) {
      tokens.add(sig.join(' '));
      const acronym = sig.map((w) => w[0]).join('');
      if (acronym.length >= 2) tokens.add(acronym);
    }
  }

  for (const alias of companyEmploymentAliases(company)) {
    tokens.add(alias);
  }

  return [...tokens].filter((t) => t.length >= 2);
}

const NFL_TEAM_PATTERN =
  /\b(lions|bears|packers|vikings|bills|dolphins|patriots|jets|giants|eagles|commanders|cowboys|chiefs|raiders|broncos|chargers|rams|seahawks|49ers|cardinals|falcons|panthers|saints|buccaneers|texans|colts|jaguars|titans|bengals|browns|steelers|ravens)\b/i;

/** Extra tokens for employment matching (NFL teams often list "NFL" on LinkedIn). */
function companyEmploymentAliases(company: string | null): string[] {
  if (!company?.trim()) return [];
  const lower = company.trim().toLowerCase();
  const aliases: string[] = [];

  if (NFL_TEAM_PATTERN.test(lower) || /\bnfl\b/i.test(lower)) {
    aliases.push('nfl', 'national football league');
  }

  const compact = lower.replace(/[^a-z0-9]/g, '');
  if (compact.length >= 5 && /\s/.test(company.trim())) {
    aliases.push(compact);
  }

  return aliases;
}

export function isLikelySportsOrganization(company: string | null): boolean {
  if (!company?.trim()) return false;
  const lower = company.trim().toLowerCase();
  return (
    NFL_TEAM_PATTERN.test(lower) ||
    /\b(nfl|nba|mlb|nhl|mls|wnba|football club|fc)\b/i.test(lower)
  );
}

/** Loose check — company name appears as a whole word/phrase in text. */
export function textMentionsCompany(text: string, company: string | null): boolean {
  const tokens = companyMatchTokens(company);
  if (!tokens.length || !text.trim()) return false;
  const lower = text.toLowerCase();
  return tokens.some((token) => new RegExp(`\\b${escapeRegex(token)}\\b`, 'i').test(lower));
}

/** LinkedIn profile search hits: accept employment phrasing OR company name on a /in/ result. */
export function linkedInHitMentionsCompany(
  title: string,
  snippet: string,
  link: string,
  company: string | null
): boolean {
  const blob = `${title}\n${snippet}`;
  if (textShowsEmploymentAtCompany(blob, company)) return true;
  if (!/linkedin\.com\/in\//i.test(link)) return false;
  return textMentionsCompany(blob, company);
}

/** Match company names across applications (handles Inc, LLC, etc.). */
export function companiesMatch(a: string | null, b: string | null): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (na === nb) return true;

  const tokensA = companyMatchTokens(a);
  const tokensB = new Set(companyMatchTokens(b));
  if (tokensA.some((t) => tokensB.has(t))) return true;

  const strippedA = tokensA.find((t) => t.length >= 3 && !/^(the|and|of)$/i.test(t));
  const strippedB = [...tokensB].find((t) => t.length >= 3 && !/^(the|and|of)$/i.test(t));
  return !!(strippedA && strippedB && strippedA === strippedB);
}

function blockMentionsPerson(block: string, name: string): boolean {
  const parts = name.toLowerCase().split(/\s+/).filter((p) => p.length > 1);
  if (!parts.length) return false;
  const lower = block.toLowerCase();
  return parts.every((p) => lower.includes(p));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse individual numbered search hits (excludes the query line). */
function extractPersonSearchResults(searchResultsText: string, name: string): string[] {
  const hits: string[] = [];

  for (const block of searchResultsText.split(/\n---\n/)) {
    const lines = block.split('\n');
    let current: string[] = [];

    for (const line of lines) {
      if (line.startsWith('Query:')) continue;
      if (/^\d+\.\s/.test(line)) {
        if (current.length && blockMentionsPerson(current.join('\n'), name)) {
          hits.push(current.join('\n'));
        }
        current = [line];
      } else if (current.length) {
        current.push(line);
      }
    }

    if (current.length && blockMentionsPerson(current.join('\n'), name)) {
      hits.push(current.join('\n'));
    }
  }

  return hits;
}

/** Require LinkedIn-style employment language, not just the company name in the query. */
export function textShowsEmploymentAtCompany(text: string, company: string | null): boolean {
  const tokens = companyMatchTokens(company);
  if (!tokens.length || !text.trim()) return false;

  const lower = text.toLowerCase();
  for (const token of tokens) {
    const t = escapeRegex(token);
    const patterns = [
      new RegExp(`\\bat\\s+${t}\\b`, 'i'),
      new RegExp(`\\bworks?\\s+at\\s+${t}\\b`, 'i'),
      new RegExp(`\\bemployed\\s+at\\s+${t}\\b`, 'i'),
      new RegExp(`@${t}\\b`, 'i'),
      new RegExp(`\\b${t}\\s*@`, 'i'),
      new RegExp(`\\b${t}\\s*[|\\-–—/]`, 'i'),
      new RegExp(`[|\\-–—/]\\s*${t}\\b`, 'i'),
      new RegExp(`\\b(?:creator|founder|co-founder|cofounder|ceo|cto|owner|employee)\\s+of\\s+${t}\\b`, 'i'),
      new RegExp(`\\b${t}\\b[^\\n]{0,50}\\b(?:recruiter|talent acquisition|people operations|human resources|hiring)\\b`, 'i'),
      new RegExp(`\\b(?:recruiter|talent acquisition|people operations|human resources)[^\\n]{0,50}\\bat\\s+${t}\\b`, 'i'),
      // LinkedIn Google titles: "Jane Doe - Engineer - BDGE | LinkedIn"
      new RegExp(`[-–—]\\s*${t}\\s*(?:\\||$)`, 'i'),
      new RegExp(`\\b${t}\\b\\s*[·•]`, 'i'),
      new RegExp(`\\b${t}\\b[^\\n]{0,30}\\b(?:linkedin|profile)\\b`, 'i'),
      new RegExp(`\\bexperience\\b[^\\n]{0,100}\\b${t}\\b`, 'i'),
      new RegExp(`\\b${t}\\b[^\\n]{0,100}\\bexperience\\b`, 'i'),
    ];
    if (patterns.some((pattern) => pattern.test(lower))) return true;
  }

  // LinkedIn /in/ hits from company-targeted search often list the org without "at Company"
  if (/linkedin\.com\/in\//i.test(text) && textMentionsCompany(text, company)) {
    return true;
  }

  return false;
}

/** Require search evidence linking this person to the target company. */
export function contactHasVerifiedCompanyTie(
  contact: { name: string; title: string; linkedin_url?: string; company_evidence?: string },
  company: string | null,
  searchResultsText: string
): boolean {
  if (!company?.trim()) return false;

  if (contact.linkedin_url) {
    const slug = contact.linkedin_url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1]?.toLowerCase();
    if (slug && searchResultsText.toLowerCase().includes(slug)) {
      for (const line of searchResultsText.split('\n')) {
        if (!line.toLowerCase().includes(slug)) continue;
        const blob = line;
        if (
          textShowsEmploymentAtCompany(blob, company) ||
          (/\/linkedin\.com\/in\//i.test(blob) && textMentionsCompany(blob, company))
        ) {
          return true;
        }
      }
      for (const block of searchResultsText.split(/\n---\n/)) {
        if (!block.toLowerCase().includes(slug)) continue;
        if (textShowsEmploymentAtCompany(block, company)) return true;
        if (textMentionsCompany(block, company) && /linkedin\.com\/in/i.test(block)) {
          return true;
        }
      }
    }
  }

  const personHits = extractPersonSearchResults(searchResultsText, contact.name);
  if (personHits.some((hit) => textShowsEmploymentAtCompany(hit, company))) return true;
  if (textShowsEmploymentAtCompany(contact.title, company)) return true;
  if (contact.company_evidence && textShowsEmploymentAtCompany(contact.company_evidence, company)) {
    return true;
  }
  return false;
}

export function filterContactsByCompanyEvidence(
  contacts: FollowUpContact[],
  company: string | null,
  searchResultsText?: string
): FollowUpContact[] {
  if (!company?.trim()) return contacts;
  return contacts.filter((c) => {
    if (c.source === 'manual') return true;
    if (searchResultsText?.trim()) {
      return contactHasVerifiedCompanyTie(c, company, searchResultsText);
    }
    return contactPassesStoredCompanyCheck(c, company);
  });
}

/** Last-resort filter when strict employment phrasing removes everyone. */
export function filterContactsByLooseCompanyEvidence(
  contacts: FollowUpContact[],
  company: string | null,
  searchResultsText?: string
): FollowUpContact[] {
  if (!company?.trim()) return contacts;
  return contacts.filter((c) => {
    if (c.source === 'manual') return true;
    if (contactHasVerifiedCompanyTie(c, company, searchResultsText ?? '')) return true;
    if (c.linkedin_url && textMentionsCompany(`${c.title} ${c.company_evidence ?? ''}`, company)) {
      return true;
    }
    if (
      c.role_type === 'recruiter' &&
      textMentionsCompany(`${c.title} ${c.company_evidence ?? ''} ${c.rationale}`, company)
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Looser company check for contacts already saved to the DB.
 * Generate-time verification uses live search snippets; on reload those are gone.
 */
export function contactPassesStoredCompanyCheck(
  contact: FollowUpContact,
  company: string | null
): boolean {
  if (contact.source === 'manual') return true;
  if (!company?.trim()) return true;
  if (textShowsEmploymentAtCompany(contact.title, company)) return true;
  if (
    contact.company_evidence &&
    textShowsEmploymentAtCompany(contact.company_evidence, company)
  ) {
    return true;
  }
  // Trust contacts that were discovered and saved — they already passed search-time checks.
  if (contact.linkedin_url?.trim() && contact.rationale?.trim()) return true;
  if (contact.role_type === 'recruiter' && contact.company_evidence?.trim()) return true;
  return false;
}

/** Drop unverified or irrelevant contacts when loading stored follow-up data. */
export function sanitizeStoredFollowUpContacts(
  stored: StoredFollowUpContacts | null,
  company: string | null,
  job?: { title: string; description: string }
): StoredFollowUpContacts | null {
  if (!stored) return null;
  let contacts = stored.contacts.filter((c) =>
    contactPassesStoredCompanyCheck(c, company)
  );
  let contact_pool = stored.contact_pool?.length
    ? stored.contact_pool.filter((c) => contactPassesStoredCompanyCheck(c, company))
    : undefined;
  if (job) {
    contacts = filterContactsByJobRelevance(contacts, job);
    contact_pool = contact_pool?.length ? filterContactsByJobRelevance(contact_pool, job) : undefined;
  }

  const normalized = normalizeStoredFollowUp({
    ...stored,
    contacts,
    contact_pool,
  });

  const changed =
    normalized.contacts.length !== stored.contacts.length ||
    (normalized.contact_pool?.length ?? 0) !== (stored.contact_pool?.length ?? 0) ||
    normalized.contacts.some(
      (c, i) =>
        c.name !== stored.contacts[i]?.name ||
        c.title !== stored.contacts[i]?.title ||
        c.connection_note !== stored.contacts[i]?.connection_note ||
        c.follow_up_message !== stored.contacts[i]?.follow_up_message
    );
  if (!changed) return stored;
  return {
    ...normalized,
    overview: alignOverviewWithContacts(stored.overview, normalized.contacts, company),
  };
}

/** Recruiters and hiring managers first; rank by job/team relevance when job context is provided. */
export function sortFollowUpContacts(
  contacts: FollowUpContact[],
  job?: { title: string; description: string }
): FollowUpContact[] {
  const primaryKeywords = job ? extractPrimaryTeamKeywords(job.title) : [];
  const fullKeywords = job ? extractJobMatchKeywords(job) : [];
  return [...contacts].sort((a, b) => {
    if (primaryKeywords.length) {
      const relA = contactTitleRelevanceScore(a, primaryKeywords);
      const relB = contactTitleRelevanceScore(b, primaryKeywords);
      if (relA !== relB) return relB - relA;
    } else if (fullKeywords.length) {
      const relA = contactJobRelevanceScore(a, fullKeywords);
      const relB = contactJobRelevanceScore(b, fullKeywords);
      if (relA !== relB) return relB - relA;
    }

    const roleA = ROLE_PRIORITY[a.role_type] ?? 99;
    const roleB = ROLE_PRIORITY[b.role_type] ?? 99;
    if (roleA !== roleB) return roleA - roleB;

    const aSenior = isSeniorTitle(a.title) ? 1 : 0;
    const bSenior = isSeniorTitle(b.title) ? 1 : 0;
    if (aSenior !== bSenior) return aSenior - bSenior;

    const confOrder = { high: 0, medium: 1, low: 2 };
    return confOrder[a.confidence] - confOrder[b.confidence];
  });
}

const GENERIC_DOMAINS = new Set([
  'greenhouse.io',
  'myworkdayjobs.com',
  'lever.co',
  'ashbyhq.com',
  'linkedin.com',
  'indeed.com',
  'builtin.com',
]);

/** Guess corporate email domain from job URL or company name. */
export function guessCompanyEmailDomain(
  company: string | null,
  jobUrl?: string | null
): string | null {
  if (jobUrl) {
    try {
      const host = new URL(jobUrl).hostname.replace(/^www\./, '');
      if (!GENERIC_DOMAINS.has(host)) {
        const parts = host.split('.');
        if (parts.length >= 2) {
          return parts.slice(-2).join('.');
        }
      }
      // greenhouse: job-boards.greenhouse.io/nflcareers -> try nfl.com style from board slug
      const greenhouseMatch = jobUrl.match(/greenhouse\.io\/([^/?]+)/i);
      if (greenhouseMatch?.[1]) {
        const slug = greenhouseMatch[1].replace(/careers?$/i, '').replace(/jobs?$/i, '');
        if (slug.length >= 2) return `${slug}.com`;
      }
    } catch {
      // ignore bad URLs
    }
  }

  if (company) {
    const slug = company
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => !/^(the|inc|llc|corp|company|co|ltd)$/i.test(w))[0];
    if (slug && slug.length >= 2) return `${slug}.com`;
  }

  return null;
}

export function normalizeFollowUpContactIds(
  contacts: FollowUpContact[],
  existing?: FollowUpContact[]
): FollowUpContact[] {
  return contacts.map((contact) => {
    const match = existing?.find(
      (e) =>
        (e.id && contact.id && e.id === contact.id) ||
        e.name.toLowerCase() === contact.name.toLowerCase()
    );
    return {
      ...contact,
      id: contact.id ?? match?.id ?? crypto.randomUUID(),
      followed_up_at: match?.followed_up_at ?? contact.followed_up_at,
      follow_up_channel: match?.follow_up_channel ?? contact.follow_up_channel,
      follow_up_notes: match?.follow_up_notes ?? contact.follow_up_notes,
    };
  });
}

export function mergeFollowUpTracking(
  fresh: FollowUpContact[],
  previous: FollowUpContact[]
): FollowUpContact[] {
  return fresh.map((contact) => {
    const prev = previous.find(
      (p) =>
        (p.id && contact.id && p.id === contact.id) ||
        p.name.toLowerCase() === contact.name.toLowerCase()
    );
    if (!prev?.followed_up_at) return contact;
    return {
      ...contact,
      id: prev.id ?? contact.id,
      followed_up_at: prev.followed_up_at,
      follow_up_channel: prev.follow_up_channel,
      follow_up_notes: prev.follow_up_notes,
    };
  });
}

/** Dedupe by identity (LinkedIn URL or person name) and sort by outreach priority. */
export function mergeDiscoveredContacts(
  existing: FollowUpContact[],
  discovered: FollowUpContact[],
  limit?: number
): FollowUpContact[] {
  const merged = dedupeFollowUpContacts([...existing, ...discovered]);
  const sorted = sortFollowUpContacts(merged);
  return limit ? sorted.slice(0, limit) : sorted;
}

function contactNames(contacts: FollowUpContact[]): Set<string> {
  return new Set(contacts.map((c) => c.name.toLowerCase()));
}

/** Split ranked auto-discovered contacts into visible list + held-back pool. */
export function tierAutoDiscoveredContacts(
  ranked: FollowUpContact[],
  visibleCount = INITIAL_FOLLOW_UP_VISIBLE
): { visible: FollowUpContact[]; pool: FollowUpContact[] } {
  const auto = ranked.filter((c) => c.source !== 'manual');
  return {
    visible: auto.slice(0, visibleCount),
    pool: auto.slice(visibleCount, visibleCount + MAX_FOLLOW_UP_POOL),
  };
}

/** Promote the next batch from the hidden pool into the visible list. */
export function promoteContactsFromPool(
  stored: StoredFollowUpContacts,
  batchSize = FOLLOW_UP_FIND_MORE_BATCH
): StoredFollowUpContacts {
  const pool = stored.contact_pool ?? [];
  if (!pool.length) {
    return { ...stored, no_new_contacts: true };
  }

  const promoted = pool.slice(0, batchSize);
  const remainingPool = pool.slice(batchSize);
  const merged = mergeFollowUpTracking(
    sortFollowUpContacts([...stored.contacts, ...promoted]),
    stored.contacts
  );

  return {
    ...stored,
    contacts: merged.slice(0, MAX_FOLLOW_UP_CONTACTS),
    contact_pool: remainingPool,
    no_new_contacts: promoted.length === 0,
    generated_at: new Date().toISOString(),
  };
}

export function normalizeLinkedInUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/linkedin\.com/i.test(trimmed)) return `https://${trimmed.replace(/^\/+/, '')}`;
  return trimmed;
}

export type ManualFollowUpContactInput = {
  name: string;
  title: string;
  linkedin_url?: string;
  email?: string;
  role_type?: FollowUpContactRole;
  notes?: string;
};

export function buildManualFollowUpContact(input: ManualFollowUpContactInput): FollowUpContact {
  const name = input.name.trim();
  const title = input.title.trim();
  return {
    id: crypto.randomUUID(),
    name,
    title,
    linkedin_url: normalizeLinkedInUrl(input.linkedin_url),
    email: input.email?.trim() || undefined,
    role_type: input.role_type ?? 'other',
    rationale: input.notes?.trim() || 'Added manually for outreach.',
    confidence: 'high',
    source: 'manual',
  };
}

export function emptyFollowUpContactsShell(): StoredFollowUpContacts {
  return {
    overview: '',
    contacts: [],
    connection_note: '',
    follow_up_message: '',
    generated_at: new Date().toISOString(),
  };
}
