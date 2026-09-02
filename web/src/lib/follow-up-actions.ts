'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getDb } from './supabase';
import { getSubscriberByToken } from './queries';
import {
  generateFollowUpContacts,
  draftFollowUpContactMessage,
  type FollowUpContact,
  type FollowUpContactChannel,
  type GapAnalysis,
} from './llm';
import { runFollowUpSearches } from './follow-up-search';
import { extractLinkedInContactsFromSearches, extractContactsForNamesFromSearches } from './follow-up-linkedin-extract';
import { formatSearchResultsForLlm } from './web-search';
import {
  mergeFollowUpTracking,
  mergeDiscoveredContacts,
  normalizeFollowUpContactIds,
  normalizeStoredFollowUp,
  isStoredFollowUpContacts,
  filterContactsByCompanyEvidence,
  filterContactsByLooseCompanyEvidence,
  sanitizeStoredFollowUpContacts,
  buildManualFollowUpContact,
  emptyFollowUpContactsShell,
  sortFollowUpContacts,
  filterContactsByJobRelevance,
  sanitizeContactOutreachCopy,
  sanitizeFollowUpEmailField,
  parsePersonNamesFromOverview,
  alignOverviewWithContacts,
  normalizeContactFromSearchMetadata,
  repairContactIdentity,
  dedupeFollowUpContacts,
  normalizeFollowUpContactList,
  linkedInProfileSlug,
  contactNameLooksValid,
  personNamesMatch,
  tierAutoDiscoveredContacts,
  promoteContactsFromPool,
  INITIAL_FOLLOW_UP_VISIBLE,
  FOLLOW_UP_FIND_MORE_BATCH,
  MAX_FOLLOW_UP_CONTACTS,
  MAX_FOLLOW_UP_POOL,
  companiesMatch,
  parseStoredFollowUpContacts,
  type StoredFollowUpContacts,
  type ManualFollowUpContactInput,
} from './follow-up-utils';
import {
  getActiveResume,
  getJobById,
  getManualJobById,
  getTailoringSession,
} from './resume-queries';
import {
  getApplicationForJob,
  getApplicationForManualJob,
  type ApplicationStage,
} from './applications';

const COOKIE_NAME = 'jh_token';

const FOLLOW_UP_STAGES: ApplicationStage[] = ['applied', 'interviewing', 'offered'];

type FollowUpContactsJson = Record<string, unknown>;

async function requireSubscriber() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) throw new Error('Sign in required');
  const sub = await getSubscriberByToken(token);
  if (!sub) throw new Error('Invalid session');
  return sub;
}

async function loadFollowUpJson(
  subscriberId: string,
  jobId?: number,
  manualJobId?: string
): Promise<FollowUpContactsJson> {
  const application = manualJobId
    ? await getApplicationForManualJob(subscriberId, manualJobId)
    : jobId
      ? await getApplicationForJob(subscriberId, jobId)
      : null;

  return ((application?.follow_up_contacts as FollowUpContactsJson) ?? {});
}

async function saveFollowUpJson(
  subscriberId: string,
  json: FollowUpContactsJson,
  jobId?: number,
  manualJobId?: string
) {
  let query = getDb()
    .from('job_applications')
    .update({
      follow_up_contacts: json,
      updated_at: new Date().toISOString(),
    })
    .eq('subscriber_id', subscriberId);

  query = manualJobId ? query.eq('manual_job_id', manualJobId) : query.eq('job_id', jobId!);
  const { error } = await query;
  if (error) throw error;
}

function revalidateFollowUpPaths(jobId?: number, manualJobId?: string) {
  revalidatePath('/');
  if (jobId) revalidatePath(`/jobs/${jobId}`);
  if (manualJobId) revalidatePath(`/jobs/manual/${manualJobId}`);
}

type FollowUpJobContext = {
  title: string;
  company: string | null;
  description: string;
};

/** Find follow-up contacts saved on another application at the same company. */
async function findCompanyFollowUpContacts(
  subscriberId: string,
  company: string | null,
  excludeJobId?: number,
  excludeManualJobId?: string
): Promise<StoredFollowUpContacts | null> {
  if (!company?.trim()) return null;

  const { data, error } = await getDb()
    .from('job_applications')
    .select('follow_up_contacts, job_id, manual_job_id, jobs(company), manual_jobs(company)')
    .eq('subscriber_id', subscriberId);

  if (error) throw error;

  let best: StoredFollowUpContacts | null = null;
  let bestScore = -1;

  for (const row of data ?? []) {
    if (excludeJobId && row.job_id === excludeJobId) continue;
    if (excludeManualJobId && row.manual_job_id === excludeManualJobId) continue;

    const rowCompany =
      (row.jobs as { company?: string | null } | null)?.company ??
      (row.manual_jobs as { company?: string | null } | null)?.company ??
      null;
    if (!companiesMatch(company, rowCompany)) continue;

    const parsed = parseStoredFollowUpContacts(row.follow_up_contacts);
    if (!parsed?.contacts.length) continue;

    const score =
      parsed.contacts.length * 10 +
      new Date(parsed.generated_at || 0).getTime() / 1_000_000_000;
    if (score > bestScore) {
      bestScore = score;
      best = parsed;
    }
  }

  return best;
}

/** Own contacts first; otherwise reuse from another application at the same company. */
export async function resolveFollowUpContactsForApplication(
  subscriberId: string,
  job: FollowUpJobContext,
  jobId?: number,
  manualJobId?: string
): Promise<StoredFollowUpContacts | null> {
  const json = await loadFollowUpJson(subscriberId, jobId, manualJobId);
  const own = parseStoredFollowUpContacts(json);

  if (own?.contacts.length) {
    return (
      sanitizeStoredFollowUpContacts(own, job.company, {
        title: job.title,
        description: job.description,
      }) ?? own
    );
  }

  const inherited = await findCompanyFollowUpContacts(
    subscriberId,
    job.company,
    jobId,
    manualJobId
  );
  if (!inherited?.contacts.length) return null;

  const resolved: StoredFollowUpContacts = {
    ...inherited,
    inherited_from_company: true,
    overview:
      inherited.overview?.trim() ||
      `Contacts from your other ${job.company ?? 'company'} application — recruiters and hiring managers apply across roles.`,
  };

  return sanitizeStoredFollowUpContacts(resolved, job.company) ?? resolved;
}

/** Copy company-level contacts onto this application before the first write. */
async function ensureOwnFollowUpStored(
  subscriberId: string,
  job: FollowUpJobContext,
  jobId?: number,
  manualJobId?: string
): Promise<StoredFollowUpContacts | null> {
  const json = await loadFollowUpJson(subscriberId, jobId, manualJobId);
  const own = isStoredFollowUpContacts(json) ? normalizeStoredFollowUp(json) : null;
  if (own?.contacts.length) return own;

  const inherited = await findCompanyFollowUpContacts(
    subscriberId,
    job.company,
    jobId,
    manualJobId
  );
  if (!inherited?.contacts.length) return null;

  const toSave: StoredFollowUpContacts = normalizeStoredFollowUp({
    ...inherited,
    inherited_from_company: undefined,
    overview:
      inherited.overview?.trim() ||
      `Contacts reused from your other ${job.company ?? 'company'} application.`,
  });
  await saveFollowUpJson(subscriberId, toSave, jobId, manualJobId);
  return toSave;
}

export async function getStoredFollowUpContacts(
  jobId?: number,
  manualJobId?: string
): Promise<StoredFollowUpContacts | null> {
  const sub = await requireSubscriber();
  const json = await loadFollowUpJson(sub.id, jobId, manualJobId);
  if (!isStoredFollowUpContacts(json)) return null;
  return normalizeStoredFollowUp(json);
}

async function resolveFollowUpContext(
  subscriberId: string,
  jobId: number | null,
  manualJobId: string | null
) {
  let job: {
    title: string;
    company: string | null;
    description: string;
    url?: string | null;
  } | null = null;
  let application = null;
  let resume = null;

  if (manualJobId) {
    const [resumeRow, manual, applicationRow] = await Promise.all([
      getActiveResume(subscriberId),
      getManualJobById(manualJobId, subscriberId),
      getApplicationForManualJob(subscriberId, manualJobId),
    ]);
    resume = resumeRow;
    if (!manual?.description) throw new Error('Job not found');
    job = {
      title: manual.title,
      company: manual.company,
      description: manual.description,
      url: manual.url,
    };
    application = applicationRow;
  } else if (jobId) {
    const [resumeRow, scraped, applicationRow] = await Promise.all([
      getActiveResume(subscriberId),
      getJobById(jobId),
      getApplicationForJob(subscriberId, jobId),
    ]);
    resume = resumeRow;
    if (!scraped?.description) throw new Error('Job not found or missing description');
    job = {
      title: scraped.title,
      company: scraped.company,
      description: scraped.description,
      url: scraped.url,
    };
    application = applicationRow;
  } else {
    throw new Error('Invalid job');
  }

  if (!resume) throw new Error('Upload your resume in settings first');

  if (!application || !FOLLOW_UP_STAGES.includes(application.stage)) {
    throw new Error('Follow-up contacts are available for applied jobs');
  }

  let gapAnalysis: GapAnalysis | null = null;

  if (application.tailoring_session_id) {
    const session = await getTailoringSession(application.tailoring_session_id, subscriberId);
    if (session?.gap_analysis && 'summary' in session.gap_analysis) {
      gapAnalysis = session.gap_analysis as GapAnalysis;
    }
  }

  return { resume, job, gapAnalysis, application };
}

export type FollowUpGenerateOptions = {
  /** Run a new web search + LLM pass. */
  refresh?: boolean;
  /** Keep prior contacts and append new ones (Find more). Default replaces the list. */
  mergeExisting?: boolean;
};

export async function generateFollowUpContactsForJob(
  jobId?: number,
  manualJobId?: string,
  options: FollowUpGenerateOptions = {}
): Promise<StoredFollowUpContacts> {
  const refresh = options.refresh ?? false;
  const mergeExisting = options.mergeExisting ?? false;
  const sub = await requireSubscriber();
  const existingJson = await loadFollowUpJson(sub.id, jobId, manualJobId);
  const existing = isStoredFollowUpContacts(existingJson)
    ? normalizeStoredFollowUp(existingJson)
    : null;

  if (!refresh && existing) {
    const { job } = await resolveFollowUpContext(sub.id, jobId ?? null, manualJobId ?? null);
    return sanitizeStoredFollowUpContacts(existing, job.company, {
      title: job.title,
      description: job.description ?? '',
    }) ?? existing;
  }

  const { resume, job, gapAnalysis } = await resolveFollowUpContext(
    sub.id,
    jobId ?? null,
    manualJobId ?? null
  );

  if (!refresh && !mergeExisting && !existing?.contacts.length) {
    const inherited = await findCompanyFollowUpContacts(
      sub.id,
      job.company,
      jobId,
      manualJobId
    );
    if (inherited?.contacts.length) {
      const seeded =
        sanitizeStoredFollowUpContacts(inherited, job.company, {
          title: job.title,
          description: job.description ?? '',
        }) ?? inherited;
      await saveFollowUpJson(sub.id, seeded, jobId, manualJobId);
      revalidateFollowUpPaths(jobId, manualJobId);
      return seeded;
    }
  }

  // Find more: reveal the next batch from the ranked pool without a new search.
  if (mergeExisting && existing?.contact_pool?.length) {
    const promoted = promoteContactsFromPool(existing);
    await saveFollowUpJson(sub.id, promoted, jobId, manualJobId);
    revalidateFollowUpPaths(jobId, manualJobId);
    return promoted;
  }

  const queryVariant = mergeExisting ? 'more' : 'initial';
  const { queries, searches, guessedDomain } = await runFollowUpSearches(job, queryVariant);
  const searchResultsText = formatSearchResultsForLlm(searches);
  const linkedInExtracted = extractLinkedInContactsFromSearches(searches, job.company, job);

  const result = await generateFollowUpContacts({
    resumeText: resume.content_text,
    job,
    gapAnalysis,
    searchResultsText,
    guessedEmailDomain: guessedDomain,
    searchMode: mergeExisting ? 'adjacent' : 'primary',
    excludeNames: mergeExisting ? existing?.contacts.map((c) => c.name) : undefined,
  });

  const overviewNames = parsePersonNamesFromOverview(result.overview);
  const overviewExtracted =
    job.company && overviewNames.length
      ? extractContactsForNamesFromSearches(searches, overviewNames, job.company, job)
      : [];

  if (!result.contacts.length && !linkedInExtracted.length && !overviewExtracted.length) {
    if (mergeExisting && existing?.contacts.length) {
      return sanitizeStoredFollowUpContacts(existing, job.company, {
      title: job.title,
      description: job.description ?? '',
    }) ?? existing;
    }
    throw new Error('Could not identify contacts from search results. Try again or search manually.');
  }

  let allCandidates = sortFollowUpContacts(
    normalizeFollowUpContactIds(
      mergeDiscoveredContacts(
        mergeDiscoveredContacts(result.contacts, linkedInExtracted),
        overviewExtracted
      ),
      existing?.contacts
    ),
    job
  );
  allCandidates = filterContactsByCompanyEvidence(allCandidates, job.company, searchResultsText);
  allCandidates = filterContactsByJobRelevance(allCandidates, job);
  allCandidates = normalizeFollowUpContactList(allCandidates, job.company);
  allCandidates = sortFollowUpContacts(allCandidates, job);

  // If strict filters removed everyone, retry without job-relevance filter (keep recruiters via dedupe)
  if (!allCandidates.length) {
    const relaxed = normalizeFollowUpContactList(
      filterContactsByCompanyEvidence(
        sortFollowUpContacts(
          normalizeFollowUpContactIds(
            mergeDiscoveredContacts(
              mergeDiscoveredContacts(result.contacts, linkedInExtracted),
              overviewExtracted
            ),
            existing?.contacts
          ),
          job
        ),
        job.company,
        searchResultsText
      ),
      job.company
    );
    if (relaxed.length) allCandidates = relaxed;
  }

  // Last resort: accept LinkedIn hits and recruiters that mention the company by name
  if (!allCandidates.length) {
    const loose = normalizeFollowUpContactList(
      filterContactsByLooseCompanyEvidence(
        sortFollowUpContacts(
          normalizeFollowUpContactIds(
            mergeDiscoveredContacts(
              mergeDiscoveredContacts(result.contacts, linkedInExtracted),
              overviewExtracted
            ),
            existing?.contacts
          ),
          job
        ),
        job.company,
        searchResultsText
      ),
      job.company
    );
    if (loose.length) {
      allCandidates = sortFollowUpContacts(loose, job);
    }
  }

  const countBeforeMerge = mergeExisting ? (existing?.contacts.length ?? 0) : 0;
  let contacts: FollowUpContact[];
  let contact_pool: FollowUpContact[] | undefined;

  if (mergeExisting && existing) {
    const knownKeys = new Set(
      [...existing.contacts, ...(existing.contact_pool ?? [])]
        .map((c) => linkedInProfileSlug(c.linkedin_url) ?? c.name.toLowerCase())
        .filter(Boolean)
    );
    const fresh = allCandidates.filter((c) => {
      const key = linkedInProfileSlug(c.linkedin_url) ?? c.name.toLowerCase();
      return key && !knownKeys.has(key);
    });
    const toReveal = fresh.slice(0, FOLLOW_UP_FIND_MORE_BATCH);
    const toPool = fresh.slice(FOLLOW_UP_FIND_MORE_BATCH, FOLLOW_UP_FIND_MORE_BATCH + MAX_FOLLOW_UP_POOL);

    contacts = mergeFollowUpTracking(
      sortFollowUpContacts([...existing.contacts, ...toReveal], job),
      existing.contacts
    ).slice(0, MAX_FOLLOW_UP_CONTACTS);
    contact_pool = [...(existing.contact_pool ?? []), ...toPool].slice(0, MAX_FOLLOW_UP_POOL);
  } else {
    const manualContacts = (existing?.contacts ?? []).filter((c) => c.source === 'manual');
    const manualNames = new Set(manualContacts.map((c) => c.name.toLowerCase()));
    const autoRanked = allCandidates.filter(
      (c) => c.source !== 'manual' && !manualNames.has(c.name.toLowerCase())
    );
    const { visible, pool } = tierAutoDiscoveredContacts(autoRanked, INITIAL_FOLLOW_UP_VISIBLE);

    contacts = sortFollowUpContacts([...manualContacts, ...visible], job).slice(
      0,
      MAX_FOLLOW_UP_CONTACTS
    );
    contact_pool = pool.length ? pool : undefined;
  }

  contacts = mergeFollowUpTracking(contacts, existing?.contacts ?? []);

  if (!contacts.length) {
    if (mergeExisting && existing?.contacts.length) {
      return sanitizeStoredFollowUpContacts(existing, job.company, {
      title: job.title,
      description: job.description ?? '',
    }) ?? existing;
    }
    if (refresh && existing?.contacts.length) {
      return sanitizeStoredFollowUpContacts(existing, job.company, {
        title: job.title,
        description: job.description ?? '',
      }) ?? existing;
    }
    throw new Error('Could not identify verified company contacts from search results. Try again or search manually.');
  }

  const stored: StoredFollowUpContacts = normalizeStoredFollowUp({
    ...result,
    overview: alignOverviewWithContacts(result.overview, contacts, job.company),
    contacts,
    contact_pool: contact_pool?.length
      ? filterContactsByJobRelevance(contact_pool, job)
      : undefined,
    company_email_domain:
      sanitizeFollowUpEmailField(result.company_email_domain) ?? guessedDomain ?? undefined,
    email_pattern: sanitizeFollowUpEmailField(result.email_pattern),
    generated_at: new Date().toISOString(),
    search_queries: queries,
    no_new_contacts: mergeExisting && contacts.length === countBeforeMerge,
  });

  await saveFollowUpJson(sub.id, stored, jobId, manualJobId);
  revalidateFollowUpPaths(jobId, manualJobId);
  return stored;
}

export async function markFollowUpContactReachedOut(
  contactId: string,
  channel: FollowUpContactChannel,
  jobId?: number,
  manualJobId?: string,
  notes?: string,
  followedUpAt?: string
): Promise<StoredFollowUpContacts> {
  const sub = await requireSubscriber();
  if (!contactId?.trim()) throw new Error('Missing contact');

  const { job } = await resolveFollowUpContext(sub.id, jobId ?? null, manualJobId ?? null);
  await ensureOwnFollowUpStored(sub.id, job, jobId, manualJobId);

  const json = await loadFollowUpJson(sub.id, jobId, manualJobId);
  if (!isStoredFollowUpContacts(json)) {
    throw new Error('Generate follow-up contacts first');
  }

  const stored = normalizeStoredFollowUp(json);
  const index = stored.contacts.findIndex((c) => c.id === contactId);
  if (index < 0) throw new Error('Contact not found');

  const when = followedUpAt?.trim() || new Date().toISOString();
  const trimmedNotes = notes?.trim().slice(0, 500) || undefined;

  const updatedContacts = stored.contacts.map((c, i) =>
    i === index
      ? {
          ...c,
          followed_up_at: when,
          follow_up_channel: channel,
          follow_up_notes: trimmedNotes,
        }
      : c
  );

  const next: StoredFollowUpContacts = {
    ...stored,
    contacts: updatedContacts,
  };

  await saveFollowUpJson(sub.id, next, jobId, manualJobId);
  revalidateFollowUpPaths(jobId, manualJobId);
  return next;
}

export async function clearFollowUpContactReachedOut(
  contactId: string,
  jobId?: number,
  manualJobId?: string
): Promise<StoredFollowUpContacts> {
  const sub = await requireSubscriber();
  const { job } = await resolveFollowUpContext(sub.id, jobId ?? null, manualJobId ?? null);
  await ensureOwnFollowUpStored(sub.id, job, jobId, manualJobId);

  const json = await loadFollowUpJson(sub.id, jobId, manualJobId);
  if (!isStoredFollowUpContacts(json)) throw new Error('No follow-up data');

  const stored = normalizeStoredFollowUp(json);
  const updatedContacts = stored.contacts.map((c) =>
    c.id === contactId
      ? {
          ...c,
          followed_up_at: undefined,
          follow_up_channel: undefined,
          follow_up_notes: undefined,
        }
      : c
  );

  const next: StoredFollowUpContacts = { ...stored, contacts: updatedContacts };
  await saveFollowUpJson(sub.id, next, jobId, manualJobId);
  revalidateFollowUpPaths(jobId, manualJobId);
  return next;
}

async function loadOrCreateFollowUpStored(
  subscriberId: string,
  jobId?: number,
  manualJobId?: string,
  job?: FollowUpJobContext
): Promise<StoredFollowUpContacts> {
  if (job) {
    const ensured = await ensureOwnFollowUpStored(subscriberId, job, jobId, manualJobId);
    if (ensured) return ensured;
  }
  const json = await loadFollowUpJson(subscriberId, jobId, manualJobId);
  if (isStoredFollowUpContacts(json)) return normalizeStoredFollowUp(json);
  return emptyFollowUpContactsShell();
}

export async function addManualFollowUpContact(
  input: ManualFollowUpContactInput,
  jobId?: number,
  manualJobId?: string
): Promise<StoredFollowUpContacts> {
  const sub = await requireSubscriber();
  const { job } = await resolveFollowUpContext(sub.id, jobId ?? null, manualJobId ?? null);

  const name = input.name?.trim();
  const title = input.title?.trim();
  if (!name || name.length < 2) throw new Error('Name is required');
  if (!title) throw new Error('Title is required');
  if (!input.linkedin_url?.trim() && !input.email?.trim()) {
    throw new Error('Add a LinkedIn URL or email');
  }

  const stored = await loadOrCreateFollowUpStored(sub.id, jobId, manualJobId, job);
  if (stored.contacts.length >= MAX_FOLLOW_UP_CONTACTS) {
    throw new Error(`Maximum ${MAX_FOLLOW_UP_CONTACTS} contacts per job`);
  }

  const duplicate = [...stored.contacts, ...(stored.contact_pool ?? [])].some((c) => {
    if (personNamesMatch(c.name, name)) return true;
    const slug = linkedInProfileSlug(input.linkedin_url);
    return slug && slug === linkedInProfileSlug(c.linkedin_url);
  });
  if (duplicate) throw new Error('A contact with this name is already on the list');

  const contact = buildManualFollowUpContact(input);
  const next: StoredFollowUpContacts = {
    ...stored,
    contacts: sortFollowUpContacts([...stored.contacts, contact]),
    generated_at: stored.generated_at || new Date().toISOString(),
  };

  await saveFollowUpJson(sub.id, next, jobId, manualJobId);
  revalidateFollowUpPaths(jobId, manualJobId);
  return next;
}

export type DraftContactMessageOptions = {
  extraContext?: string;
  revisionNotes?: string;
};

export async function draftFollowUpContactMessages(
  contactId: string,
  options: DraftContactMessageOptions = {},
  jobId?: number,
  manualJobId?: string
): Promise<StoredFollowUpContacts> {
  const sub = await requireSubscriber();
  if (!contactId?.trim()) throw new Error('Missing contact');

  const { resume, job, gapAnalysis } = await resolveFollowUpContext(
    sub.id,
    jobId ?? null,
    manualJobId ?? null
  );

  const stored = await loadOrCreateFollowUpStored(sub.id, jobId, manualJobId, job);
  const index = stored.contacts.findIndex((c) => c.id === contactId);
  if (index < 0) throw new Error('Contact not found');

  const contact = stored.contacts[index]!;
  const drafted = await draftFollowUpContactMessage({
    resumeText: resume.content_text,
    job,
    gapAnalysis,
    contact,
    extraContext: options.extraContext,
    revisionNotes: options.revisionNotes,
    currentDraft: options.revisionNotes
      ? {
          connection_note: contact.connection_note,
          follow_up_message: contact.follow_up_message,
        }
      : undefined,
  });

  const updatedContacts = stored.contacts.map((c, i) =>
    i === index
      ? {
          ...c,
          connection_note: drafted.connection_note,
          follow_up_message: drafted.follow_up_message,
        }
      : c
  );

  const next: StoredFollowUpContacts = normalizeStoredFollowUp({
    ...stored,
    contacts: updatedContacts,
  });
  await saveFollowUpJson(sub.id, next, jobId, manualJobId);
  revalidateFollowUpPaths(jobId, manualJobId);
  return next;
}

export async function updateFollowUpContactMessages(
  contactId: string,
  messages: { connection_note?: string; follow_up_message?: string },
  jobId?: number,
  manualJobId?: string
): Promise<StoredFollowUpContacts> {
  const sub = await requireSubscriber();
  if (!contactId?.trim()) throw new Error('Missing contact');

  const { job } = await resolveFollowUpContext(sub.id, jobId ?? null, manualJobId ?? null);
  const stored = await loadOrCreateFollowUpStored(sub.id, jobId, manualJobId, job);
  const index = stored.contacts.findIndex((c) => c.id === contactId);
  if (index < 0) throw new Error('Contact not found');

  const updatedContacts = stored.contacts.map((c, i) =>
    i === index
      ? {
          ...c,
          connection_note: messages.connection_note?.trim().slice(0, 300) ?? c.connection_note,
          follow_up_message: messages.follow_up_message?.trim() ?? c.follow_up_message,
        }
      : c
  );

  const next: StoredFollowUpContacts = normalizeStoredFollowUp({
    ...stored,
    contacts: updatedContacts,
  });
  await saveFollowUpJson(sub.id, next, jobId, manualJobId);
  revalidateFollowUpPaths(jobId, manualJobId);
  return next;
}

export async function removeFollowUpContact(
  contactId: string,
  jobId?: number,
  manualJobId?: string
): Promise<StoredFollowUpContacts> {
  const sub = await requireSubscriber();
  if (!contactId?.trim()) throw new Error('Missing contact');

  const { job } = await resolveFollowUpContext(sub.id, jobId ?? null, manualJobId ?? null);
  await ensureOwnFollowUpStored(sub.id, job, jobId, manualJobId);

  const json = await loadFollowUpJson(sub.id, jobId, manualJobId);
  if (!isStoredFollowUpContacts(json)) throw new Error('No follow-up data');

  const stored = normalizeStoredFollowUp(json);
  const contact = stored.contacts.find((c) => c.id === contactId);
  if (!contact) throw new Error('Contact not found');
  if (contact.source !== 'manual') {
    throw new Error('Only manually added contacts can be removed');
  }

  const next: StoredFollowUpContacts = {
    ...stored,
    contacts: stored.contacts.filter((c) => c.id !== contactId),
  };

  await saveFollowUpJson(sub.id, next, jobId, manualJobId);
  revalidateFollowUpPaths(jobId, manualJobId);
  return next;
}
