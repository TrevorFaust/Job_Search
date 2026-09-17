import { cache } from 'react';
import { getDb } from './supabase';
import { ALL_CATEGORY_IDS } from './categories';
import { decryptSecret, encryptSecret, secretLast4 } from './llm-crypto';
import { defaultModelFor, type LlmProvider, type LlmRuntime } from './llm-runtime';
import { CANDIDATE_FACTS, type CandidateFact } from './candidate-facts';
import {
  APARTMENT_HUNT_CONTEXT,
  APARTMENT_HUNT_PROJECT,
  DRAFTDNA_CONTEXT,
  DRAFTDNA_PROJECT,
  FANTASY_BLOG_CONTEXT,
  FANTASY_BLOG_PROJECT,
  PERSONAL_WEBSITE_CONTEXT,
  PERSONAL_WEBSITE_PROJECT,
  SCOUTDNA_CONTEXT,
  SCOUTDNA_PROJECT,
  mergeProjectContextNotes,
  mergeSeedProjects,
} from './project-corpus';
import {
  LOCKED_EDUCATION,
  LOCKED_HEADER,
  LOCKED_KENNAMETAL,
  sanitizeResumeContact,
  type ResumeEducation,
  type ResumeHeader,
  type ResumeJob,
  type ResumeProject,
  type ResumeSkillGroup,
} from './resume-template';

export type ProfileRole = {
  title: string;
  locked?: boolean;
  includeByDefault?: boolean;
  bullets: Array<{ text: string; cutFirst?: boolean }>;
};

export type ProfileJob = {
  company: string;
  locationDates: string;
  locked?: boolean;
  roles: ProfileRole[];
};

export type ProfileProject = {
  title: string;
  locked?: boolean;
  includeByDefault?: boolean;
  bullets: Array<{ text: string; cutFirst?: boolean }>;
};

export type LearnedFact = {
  id: string;
  topic: string;
  answer: string;
  triggers: string[];
  minHits: number;
  source: 'qa' | 'manual' | 'seed';
};

export type UserProfileRow = {
  subscriber_id: string;
  display_name: string;
  location: string;
  contact_email: string;
  phone: string;
  linkedin_label: string;
  linkedin_url: string;
  github_label: string;
  github_url: string;
  website_label: string;
  website_url: string;
  willing_to_relocate: boolean;
  education: ResumeEducation;
  experience: ProfileJob[];
  projects: ProfileProject[];
  skills: ResumeSkillGroup[];
  projects_section_title: string;
  context_notes: string;
  learned_facts: LearnedFact[];
  preferred_categories: string[];
  llm_provider: LlmProvider | null;
  llm_model: string | null;
  llm_api_key_ciphertext: string | null;
  llm_api_key_last4: string | null;
  created_at: string;
  updated_at: string;
};

export type UserProfilePublic = Omit<UserProfileRow, 'llm_api_key_ciphertext'> & {
  hasLlmKey: boolean;
  usesOwnerLlm: boolean;
};

export type CandidateIdentity = {
  displayName: string;
  header: ResumeHeader;
  education: ResumeEducation;
  experience: ResumeJob[];
  projects: ResumeProject[];
  skills: ResumeSkillGroup[];
  projectsSectionTitle: string;
  contextNotes: string;
  facts: CandidateFact[];
  cover: {
    name: string;
    locationContact: string;
    profiles: string;
  };
};

export type ProfileSaveInput = {
  display_name: string;
  location: string;
  contact_email: string;
  phone: string;
  linkedin_label: string;
  linkedin_url: string;
  github_label: string;
  github_url: string;
  website_label: string;
  website_url: string;
  willing_to_relocate: boolean;
  education: ResumeEducation;
  experience: ProfileJob[];
  projects: ProfileProject[];
  skills: ResumeSkillGroup[];
  projects_section_title: string;
  context_notes: string;
  preferred_categories: string[];
};

function ownerEmails(): string[] {
  return [process.env.OWNER_EMAIL, process.env.EMAIL_TO, LOCKED_HEADER.email]
    .map((v) => v?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v));
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.trim().toLowerCase());
}

function asEducation(value: unknown): ResumeEducation {
  const row = (value && typeof value === 'object' ? value : {}) as Partial<ResumeEducation>;
  return {
    schoolBold: String(row.schoolBold ?? ''),
    schoolRest: String(row.schoolRest ?? ''),
    degree: String(row.degree ?? ''),
    minors: String(row.minors ?? ''),
  };
}

function asBullets(value: unknown): Array<{ text: string; cutFirst?: boolean }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { text: item.trim() };
      if (item && typeof item === 'object' && 'text' in item) {
        const row = item as { text?: unknown; cutFirst?: unknown };
        return { text: String(row.text ?? '').trim(), cutFirst: Boolean(row.cutFirst) };
      }
      return { text: '' };
    })
    .filter((b) => b.text);
}

function asJobs(value: unknown): ProfileJob[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Partial<ProfileJob> & {
        roles?: unknown;
      };
      return {
        company: String(row.company ?? '').trim(),
        locationDates: String(row.locationDates ?? ''),
        locked: Boolean(row.locked),
        roles: Array.isArray(row.roles)
          ? row.roles.map((role) => {
              const r = (role && typeof role === 'object' ? role : {}) as Partial<ProfileRole> & {
                bullets?: unknown;
              };
              return {
                title: String(r.title ?? '').trim(),
                locked: Boolean(r.locked),
                includeByDefault: r.includeByDefault !== false,
                bullets: asBullets(r.bullets),
              };
            })
          : [],
      };
    })
    .filter((job) => job.company);
}

function asProjects(value: unknown): ProfileProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Partial<ProfileProject> & {
        bullets?: unknown;
      };
      return {
        title: String(row.title ?? '').trim(),
        locked: Boolean(row.locked),
        includeByDefault: row.includeByDefault !== false,
        bullets: asBullets(row.bullets),
      };
    })
    .filter((p) => p.title);
}

function asSkills(value: unknown): ResumeSkillGroup[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Partial<ResumeSkillGroup>;
      return {
        heading: String(row.heading ?? '').trim() || 'Skills',
        items: Array.isArray(row.items) ? row.items.map((i) => String(i).trim()).filter(Boolean) : [],
      };
    })
    .filter((g) => g.heading || g.items.length);
}

function asFacts(value: unknown): LearnedFact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Partial<LearnedFact> & {
        triggers?: unknown;
      };
      const answer = String(row.answer ?? '').trim();
      if (!answer) return null;
      return {
        id: String(row.id ?? '').trim() || crypto.randomUUID(),
        topic: String(row.topic ?? '').trim() || 'note',
        answer,
        triggers: Array.isArray(row.triggers)
          ? row.triggers.map((t) => String(t).trim()).filter(Boolean)
          : [],
        minHits: Number(row.minHits) > 0 ? Number(row.minHits) : 1,
        source: row.source === 'qa' || row.source === 'seed' ? row.source : 'manual',
      };
    })
    .filter((f): f is LearnedFact => Boolean(f));
}

function asCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(ALL_CATEGORY_IDS);
  return [...new Set(value.map((v) => String(v)).filter((id) => allowed.has(id)))];
}

function normalizeRow(row: Record<string, unknown>): UserProfileRow {
  return {
    subscriber_id: String(row.subscriber_id),
    display_name: String(row.display_name ?? ''),
    location: String(row.location ?? ''),
    contact_email: String(row.contact_email ?? ''),
    phone: String(row.phone ?? ''),
    linkedin_label: String(row.linkedin_label ?? ''),
    linkedin_url: String(row.linkedin_url ?? ''),
    github_label: String(row.github_label ?? ''),
    github_url: String(row.github_url ?? ''),
    website_label: String(row.website_label ?? ''),
    website_url: String(row.website_url ?? ''),
    willing_to_relocate: Boolean(row.willing_to_relocate),
    education: asEducation(row.education),
    experience: asJobs(row.experience),
    projects: asProjects(row.projects),
    skills: asSkills(row.skills),
    projects_section_title: String(row.projects_section_title ?? 'PROJECTS') || 'PROJECTS',
    context_notes: String(row.context_notes ?? ''),
    learned_facts: asFacts(row.learned_facts),
    preferred_categories: asCategories(row.preferred_categories),
    llm_provider: row.llm_provider === 'openai' || row.llm_provider === 'anthropic' ? row.llm_provider : null,
    llm_model: typeof row.llm_model === 'string' && row.llm_model.trim() ? row.llm_model.trim() : null,
    llm_api_key_ciphertext: typeof row.llm_api_key_ciphertext === 'string' ? row.llm_api_key_ciphertext : null,
    llm_api_key_last4: typeof row.llm_api_key_last4 === 'string' ? row.llm_api_key_last4 : null,
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function emptyInsert(subscriberId: string) {
  return {
    subscriber_id: subscriberId,
    display_name: '',
    location: '',
    contact_email: '',
    phone: '',
    linkedin_label: '',
    linkedin_url: '',
    github_label: '',
    github_url: '',
    website_label: '',
    website_url: '',
    willing_to_relocate: false,
    education: { schoolBold: '', schoolRest: '', degree: '', minors: '' },
    experience: [] as ProfileJob[],
    projects: [] as ProfileProject[],
    skills: [] as ResumeSkillGroup[],
    projects_section_title: 'PROJECTS',
    context_notes: '',
    learned_facts: [] as LearnedFact[],
    preferred_categories: [] as string[],
  };
}

function trevorSeed(subscriberId: string) {
  return {
    subscriber_id: subscriberId,
    display_name: 'Trevor Faust',
    location: 'Seattle, WA',
    contact_email: LOCKED_HEADER.email,
    phone: LOCKED_HEADER.phone,
    linkedin_label: LOCKED_HEADER.linkedinLabel,
    linkedin_url: LOCKED_HEADER.linkedinUrl,
    github_label: LOCKED_HEADER.githubLabel,
    github_url: LOCKED_HEADER.githubUrl,
    website_label: '',
    website_url: '',
    willing_to_relocate: true,
    education: { ...LOCKED_EDUCATION },
    experience: [
      {
        company: LOCKED_KENNAMETAL.company,
        locationDates: LOCKED_KENNAMETAL.locationDates,
        locked: true,
        roles: [
          {
            title: LOCKED_KENNAMETAL.channelRepTitle,
            locked: true,
            includeByDefault: true,
            bullets: [
              'Grew a 7-person inside sales and applications team covering the Pacific Northwest, tying distributor training to weekly Power BI pipeline reviews.',
              'Raised customer retention about 20% by installing a follow-up cadence and quoting playbook for regional distributors.',
            ].map((text) => ({ text })),
          },
          {
            title: 'Process Engineer',
            locked: false,
            includeByDefault: true,
            bullets: [
              'Cut about $2M in cost and 700 labor hours by redesigning a production process and locking the new standard into the plant schedule.',
              'Built Excel and VBA tools that scheduled jobs and labor so supervisors could see capacity gaps before the shift started.',
            ].map((text) => ({ text })),
          },
        ],
      },
    ] satisfies ProfileJob[],
    projects: [
      DRAFTDNA_PROJECT,
      SCOUTDNA_PROJECT,
      FANTASY_BLOG_PROJECT,
      {
        title: 'Personal job board',
        locked: false,
        includeByDefault: false,
        bullets: [
          'Built a personal job board in Next.js that scores listings against a resume corpus and stores tailored drafts per role.',
        ].map((text) => ({ text })),
      },
      APARTMENT_HUNT_PROJECT,
      PERSONAL_WEBSITE_PROJECT,
    ] satisfies ProfileProject[],
    skills: [] as ResumeSkillGroup[],
    projects_section_title: 'DATA & ANALYTICS PROJECTS',
    context_notes: `${DRAFTDNA_CONTEXT}\n\n${SCOUTDNA_CONTEXT}\n\n${FANTASY_BLOG_CONTEXT}\n\n${APARTMENT_HUNT_CONTEXT}\n\n${PERSONAL_WEBSITE_CONTEXT}`,
    learned_facts: learnedFromSeed(CANDIDATE_FACTS),
    preferred_categories: ALL_CATEGORY_IDS,
  };
}

export function toPublicProfile(row: UserProfileRow, email: string | null): UserProfilePublic {
  const { llm_api_key_ciphertext: _hidden, ...rest } = row;
  return {
    ...rest,
    hasLlmKey: Boolean(row.llm_api_key_ciphertext),
    usesOwnerLlm: !row.llm_api_key_ciphertext && isOwnerEmail(email),
  };
}

export function headerFromProfile(row: Pick<
  UserProfileRow,
  | 'display_name'
  | 'location'
  | 'willing_to_relocate'
  | 'contact_email'
  | 'phone'
  | 'linkedin_label'
  | 'github_label'
  | 'website_label'
>): ResumeHeader {
  const location = [row.location.trim(), row.willing_to_relocate ? 'Willing to Relocate' : '']
    .filter(Boolean)
    .join(' | ');
  const contact = sanitizeResumeContact(
    [row.contact_email, row.phone, row.linkedin_label, row.github_label, row.website_label]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(' | ')
  );
  return {
    name: row.display_name.trim().toUpperCase(),
    location,
    contact,
  };
}

export function coverFromProfile(row: UserProfileRow): CandidateIdentity['cover'] {
  const name =
    row.display_name.trim() ||
    row.display_name.toUpperCase() ||
    'Applicant';
  const locationContact = [row.location.trim(), row.contact_email.trim(), row.phone.trim()]
    .filter(Boolean)
    .join(' | ');
  const profiles = [row.linkedin_label.trim(), row.github_label.trim(), row.website_label.trim()]
    .filter(Boolean)
    .join(' | ');
  return {
    name: toTitleName(name),
    locationContact,
    profiles,
  };
}

function toTitleName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 'Applicant';
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function toCandidateIdentity(row: UserProfileRow): CandidateIdentity {
  return {
    displayName: toTitleName(row.display_name || row.contact_email || 'Applicant'),
    header: headerFromProfile(row),
    education: row.education,
    experience: row.experience.map((job) => ({
      company: job.company,
      locationDates: job.locationDates,
      locked: job.locked ?? true,
      roles: job.roles.map((role) => ({
        title: role.title,
        locked: Boolean(role.locked),
        includeByDefault: role.includeByDefault !== false,
        bullets: role.bullets,
      })),
    })),
    projects: row.projects.map((p) => ({
      title: p.title,
      locked: Boolean(p.locked),
      includeByDefault: p.includeByDefault !== false,
      bullets: p.bullets,
    })),
    skills: row.skills,
    projectsSectionTitle: row.projects_section_title || 'PROJECTS',
    contextNotes: row.context_notes,
    facts: row.learned_facts.map((f) => ({
      id: f.id,
      triggers: f.triggers.length ? f.triggers : [f.topic],
      minHits: f.minHits || 1,
      answer: f.answer,
    })),
    cover: coverFromProfile(row),
  };
}

export function profileHasIdentity(row: UserProfileRow): boolean {
  return Boolean(row.display_name.trim() || row.experience.length || row.education.schoolBold.trim());
}

export function identityLockJobs(identity: CandidateIdentity): boolean {
  return identity.experience.some((job) => job.company.trim());
}

async function subscriberEmail(subscriberId: string): Promise<string | null> {
  const { data, error } = await getDb()
    .from('subscribers')
    .select('email')
    .eq('id', subscriberId)
    .maybeSingle();
  if (error) throw error;
  return (data?.email as string | undefined) ?? null;
}

export const getUserProfile = cache(async function getUserProfile(
  subscriberId: string
): Promise<UserProfileRow | null> {
  const { data, error } = await getDb()
    .from('user_profiles')
    .select('*')
    .eq('subscriber_id', subscriberId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeRow(data as Record<string, unknown>) : null;
});

function learnedFromSeed(facts: CandidateFact[]): LearnedFact[] {
  return facts.map((fact) => ({
    id: fact.id,
    topic: fact.id.replace(/-/g, ' '),
    answer: fact.answer,
    triggers: fact.triggers,
    minHits: fact.minHits,
    source: 'seed' as const,
  }));
}

function mergeOwnerSeedRow(row: UserProfileRow, seed: ReturnType<typeof trevorSeed>): {
  projects: ProfileProject[];
  learned_facts: LearnedFact[];
  context_notes: string;
} | null {
  const projects = mergeSeedProjects(row.projects, seed.projects);
  const haveFactIds = new Set(row.learned_facts.map((f) => f.id));
  const learned_facts = [
    ...row.learned_facts,
    ...seed.learned_facts.filter((f) => f.id && !haveFactIds.has(f.id)),
  ];
  const context_notes = mergeProjectContextNotes(row.context_notes, seed.context_notes);
  if (
    JSON.stringify(projects) === JSON.stringify(row.projects) &&
    learned_facts.length === row.learned_facts.length &&
    context_notes === row.context_notes.trim()
  ) {
    return null;
  }
  return { projects, learned_facts, context_notes };
}

async function maybeMergeOwnerSeed(row: UserProfileRow, email: string | null): Promise<UserProfileRow> {
  if (!isOwnerEmail(email)) return row;
  const patch = mergeOwnerSeedRow(row, trevorSeed(row.subscriber_id));
  if (!patch) return row;
  const { data, error } = await getDb()
    .from('user_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('subscriber_id', row.subscriber_id)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeRow(data as Record<string, unknown>);
}

export async function getOrCreateUserProfile(subscriberId: string): Promise<UserProfileRow> {
  const existing = await getUserProfile(subscriberId);
  const email = await subscriberEmail(subscriberId);
  if (existing) return maybeMergeOwnerSeed(existing, email);

  const seed = isOwnerEmail(email) ? trevorSeed(subscriberId) : emptyInsert(subscriberId);
  const { data, error } = await getDb().from('user_profiles').insert(seed).select('*').single();
  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const raced = await getUserProfile(subscriberId);
      if (raced) return maybeMergeOwnerSeed(raced, email);
    }
    throw error;
  }
  return normalizeRow(data as Record<string, unknown>);
}

export async function getPublicUserProfile(subscriberId: string, email?: string | null): Promise<UserProfilePublic> {
  const row = await getOrCreateUserProfile(subscriberId);
  const resolvedEmail = email ?? (await subscriberEmail(subscriberId));
  return toPublicProfile(row, resolvedEmail);
}

export async function saveUserProfileRow(subscriberId: string, input: ProfileSaveInput): Promise<UserProfileRow> {
  const patch = {
    display_name: input.display_name.trim(),
    location: input.location.trim(),
    contact_email: input.contact_email.trim(),
    phone: input.phone.trim(),
    linkedin_label: input.linkedin_label.trim(),
    linkedin_url: input.linkedin_url.trim(),
    github_label: input.github_label.trim(),
    github_url: input.github_url.trim(),
    website_label: input.website_label.trim(),
    website_url: input.website_url.trim(),
    willing_to_relocate: input.willing_to_relocate,
    education: asEducation(input.education),
    experience: asJobs(input.experience),
    projects: asProjects(input.projects),
    skills: asSkills(input.skills),
    projects_section_title: input.projects_section_title.trim().toUpperCase() || 'PROJECTS',
    context_notes: input.context_notes.trim(),
    preferred_categories: asCategories(input.preferred_categories),
    updated_at: new Date().toISOString(),
  };

  await getOrCreateUserProfile(subscriberId);
  const { data, error } = await getDb()
    .from('user_profiles')
    .update(patch)
    .eq('subscriber_id', subscriberId)
    .select('*')
    .single();
  if (error) throw error;
  return normalizeRow(data as Record<string, unknown>);
}

export async function saveUserLlmKey(
  subscriberId: string,
  provider: LlmProvider,
  apiKey: string,
  model?: string
): Promise<void> {
  const trimmed = apiKey.trim();
  if (trimmed.length < 20) throw new Error('That API key looks too short');
  await getOrCreateUserProfile(subscriberId);
  const { error } = await getDb()
    .from('user_profiles')
    .update({
      llm_provider: provider,
      llm_model: model?.trim() || null,
      llm_api_key_ciphertext: encryptSecret(trimmed),
      llm_api_key_last4: secretLast4(trimmed),
      updated_at: new Date().toISOString(),
    })
    .eq('subscriber_id', subscriberId);
  if (error) throw error;
}

export async function clearUserLlmKey(subscriberId: string): Promise<void> {
  const { error } = await getDb()
    .from('user_profiles')
    .update({
      llm_api_key_ciphertext: null,
      llm_api_key_last4: null,
      updated_at: new Date().toISOString(),
    })
    .eq('subscriber_id', subscriberId);
  if (error) throw error;
}

export async function removeLearnedFact(subscriberId: string, factId: string): Promise<void> {
  const row = await getOrCreateUserProfile(subscriberId);
  const next = row.learned_facts.filter((f) => f.id !== factId);
  const { error } = await getDb()
    .from('user_profiles')
    .update({ learned_facts: next, updated_at: new Date().toISOString() })
    .eq('subscriber_id', subscriberId);
  if (error) throw error;
}

const SKIP_ANSWERS = /^(n\/?a|skip+|no|yes|not really|idk|i don'?t know\.?)$/i;

export async function ingestLearnedFacts(
  subscriberId: string,
  items: Array<{ question?: string; answer: string; related_requirement?: string }>
): Promise<void> {
  const additions: LearnedFact[] = [];
  for (const item of items) {
    const answer = item.answer.trim();
    if (answer.length < 40 || SKIP_ANSWERS.test(answer)) continue;
    const topic = (item.related_requirement || item.question || 'note').trim().slice(0, 120);
    const triggers = topic
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4)
      .slice(0, 6);
    additions.push({
      id: crypto.randomUUID(),
      topic,
      answer: answer.slice(0, 1200),
      triggers: triggers.length ? triggers : [topic.toLowerCase().slice(0, 40)],
      minHits: Math.min(2, Math.max(1, triggers.length >= 3 ? 2 : 1)),
      source: 'qa',
    });
  }
  if (!additions.length) return;

  const row = await getOrCreateUserProfile(subscriberId);
  const existing = row.learned_facts;
  const next = [...existing];
  for (const fact of additions) {
    const duplicate = next.some(
      (f) =>
        f.answer.toLowerCase().slice(0, 80) === fact.answer.toLowerCase().slice(0, 80) ||
        (f.topic.toLowerCase() === fact.topic.toLowerCase() && f.source === 'qa')
    );
    if (duplicate) {
      const idx = next.findIndex(
        (f) => f.topic.toLowerCase() === fact.topic.toLowerCase() && f.source === 'qa'
      );
      if (idx >= 0) next[idx] = { ...next[idx]!, answer: fact.answer, triggers: fact.triggers };
      continue;
    }
    next.unshift(fact);
  }

  const { error } = await getDb()
    .from('user_profiles')
    .update({ learned_facts: next.slice(0, 80), updated_at: new Date().toISOString() })
    .eq('subscriber_id', subscriberId);
  if (error) throw error;
}

export async function maybeSeedProfileFromResume(
  subscriberId: string,
  draft: {
    header?: ResumeHeader;
    education?: ResumeEducation;
    experience?: ResumeJob[];
    projects?: ResumeProject[];
    skills?: ResumeSkillGroup[];
  }
): Promise<void> {
  const row = await getOrCreateUserProfile(subscriberId);
  if (profileHasIdentity(row)) return;

  const header = draft.header;
  const contactParts = (header?.contact ?? '').split('|').map((p) => p.trim()).filter(Boolean);
  const email = contactParts.find((p) => p.includes('@')) ?? '';
  const phone = contactParts.find((p) => /\d{3}/.test(p) && !p.includes('@')) ?? '';
  const linkedin = contactParts.find((p) => /linkedin/i.test(p)) ?? '';
  const github = contactParts.find((p) => /github/i.test(p)) ?? '';
  const website = contactParts.find((p) => !p.includes('@') && !/linkedin|github/i.test(p) && /\./.test(p)) ?? '';
  const locationLine = header?.location ?? '';
  const relocate = /relocate/i.test(locationLine);
  const location = locationLine.replace(/\|\s*willing to relocate/i, '').trim();

  const { error } = await getDb()
    .from('user_profiles')
    .update({
      display_name: toTitleName(header?.name ?? ''),
      location,
      contact_email: email,
      phone,
      linkedin_label: linkedin,
      github_label: github,
      website_label: website,
      willing_to_relocate: relocate,
      education: asEducation(draft.education),
      experience: asJobs(
        (draft.experience ?? []).map((job) => ({
          company: job.company,
          locationDates: job.locationDates,
          locked: true,
          roles: job.roles.map((role) => ({
            title: role.title,
            locked: false,
            includeByDefault: true,
            bullets: role.bullets,
          })),
        }))
      ),
      projects: asProjects(
        (draft.projects ?? []).map((p) => ({
          title: p.title,
          locked: false,
          includeByDefault: true,
          bullets: p.bullets,
        }))
      ),
      skills: asSkills(draft.skills),
      updated_at: new Date().toISOString(),
    })
    .eq('subscriber_id', subscriberId);
  if (error) throw error;
}

export async function resolveLlmRuntimeForUser(
  subscriberId: string,
  email?: string | null
): Promise<LlmRuntime> {
  const row = await getOrCreateUserProfile(subscriberId);
  const resolvedEmail = email ?? (await subscriberEmail(subscriberId));

  if (row.llm_api_key_ciphertext && row.llm_provider) {
    return {
      provider: row.llm_provider,
      apiKey: decryptSecret(row.llm_api_key_ciphertext),
      model: row.llm_model || defaultModelFor(row.llm_provider, 'main'),
      interviewModel: defaultModelFor(row.llm_provider, 'interview'),
      source: 'user',
    };
  }

  const envKey = process.env.ANTHROPIC_API_KEY;
  if (isOwnerEmail(resolvedEmail) && envKey) {
    return {
      provider: 'anthropic',
      apiKey: envKey,
      model: defaultModelFor('anthropic', 'main'),
      interviewModel: defaultModelFor('anthropic', 'interview'),
      source: 'owner',
    };
  }

  throw new Error(
    'Add your own Anthropic or OpenAI API key in Profile. Tailoring is billed to each user, not the site owner.'
  );
}

export async function llmStatusForUser(subscriberId: string, email?: string | null) {
  try {
    const runtime = await resolveLlmRuntimeForUser(subscriberId, email);
    return { ready: true as const, source: runtime.source, provider: runtime.provider };
  } catch (error) {
    return {
      ready: false as const,
      message: error instanceof Error ? error.message : 'API key required',
    };
  }
}

export function canonicalBulletsFor(identity: CandidateIdentity, label: string): string[] {
  const needle = label.toLowerCase();
  const hits: string[] = [];
  for (const job of identity.experience) {
    for (const role of job.roles) {
      if (`${job.company} ${role.title}`.toLowerCase().includes(needle) || needle.includes(role.title.toLowerCase())) {
        hits.push(...role.bullets.map((b) => b.text));
      }
    }
  }
  for (const project of identity.projects) {
    if (project.title.toLowerCase().includes(needle) || needle.includes(project.title.toLowerCase().slice(0, 18))) {
      hits.push(...project.bullets.map((b) => b.text));
    }
  }
  return hits;
}
