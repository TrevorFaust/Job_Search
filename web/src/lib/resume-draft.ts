import { splitResumeOutput, stripEmDashes } from './resume-structure';
import type { CandidateIdentity } from './user-profile';
import {
  defaultResumeEducation,
  defaultResumeHeader,
  parseCompanyLine,
  parseEducationLine,
  projectSectionTitle,
  sanitizeResumeContact,
  type KeywordAlignmentItem,
  type ResumeDraft,
  type ResumeEducation,
  type ResumeHeader,
  type ResumeJob,
  type ResumeProject,
  type ResumeRole,
  type ResumeSkillGroup,
  type ResumeSessionOutput,
} from './resume-template';

/** ~2 wrapped Cambria 11pt lines on the skills content width. Server also font-caps. */
const SKILLS_MAX_JOINED_CHARS = 200;

/** Profile must stay a short blurb — never rival Experience for space (~4–5 wrapped lines). */
const PROFILE_MAX_SENTENCES = 3;
const PROFILE_MAX_CHARS = 480;

export function clampProfileText(profile: string): string {
  let text = stripEmDashes((profile ?? '').replace(/\s+/g, ' ').trim());
  if (!text) return text;

  const sentences =
    text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  if (sentences.length > PROFILE_MAX_SENTENCES) {
    text = sentences.slice(0, PROFILE_MAX_SENTENCES).join(' ');
  }
  if (text.length <= PROFILE_MAX_CHARS) return text;

  const clipped = text.slice(0, PROFILE_MAX_CHARS);
  const lastStop = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('! '),
    clipped.lastIndexOf('? ')
  );
  if (lastStop > PROFILE_MAX_CHARS * 0.55) {
    return clipped.slice(0, lastStop + 1).trim();
  }
  return `${clipped.replace(/\s+\S*$/, '').trim()}…`;
}

function capSkillsItems(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    const next = out.length === 0 ? item : `${out.join(' | ')} | ${item}`;
    if (out.length > 0 && next.length > SKILLS_MAX_JOINED_CHARS) break;
    out.push(item);
  }
  return out;
}

export function serializeResumeOutput(output: ResumeSessionOutput): string {
  return JSON.stringify(output);
}

export function parseResumeOutput(text: string | null | undefined): ResumeSessionOutput | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as ResumeSessionOutput;
    if (parsed?.version === 1 && parsed.draft && typeof parsed.draft.profile === 'string') {
      return {
        version: 1,
        draft: sanitizeDraft(parsed.draft),
        keywordAlignment: Array.isArray(parsed.keywordAlignment) ? parsed.keywordAlignment : [],
      };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeLocationDates(raw: string, fallback = '') {
  const t = raw.trim();
  if (t.startsWith(',')) return t.startsWith(', ') ? t : `, ${t.slice(1).trim()}`;
  if (!t) return fallback;
  return `, ${t.replace(/^,\s*/, '')}`;
}

function companyKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function titlesMatch(a: string, b: string) {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function asBullets(value: unknown): ResumeDraft['experience'][0]['roles'][0]['bullets'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { text: stripEmDashes(item.trim()), cutFirst: false };
      if (item && typeof item === 'object' && 'text' in item) {
        const row = item as { text?: unknown; cutFirst?: unknown };
        return {
          text: stripEmDashes(String(row.text ?? '')),
          cutFirst: Boolean(row.cutFirst),
        };
      }
      return { text: '', cutFirst: false };
    });
}

function withHeader(input: ResumeDraft, identity?: CandidateIdentity | null): ResumeHeader {
  const fallback = identity?.header ?? defaultResumeHeader();
  if (!input.header) return fallback;
  const name = stripEmDashes(input.header.name ?? '') || fallback.name;
  return {
    name,
    location: stripEmDashes(input.header.location ?? '') || fallback.location,
    contact: sanitizeResumeContact(stripEmDashes(input.header.contact ?? '') || fallback.contact),
  };
}

function withEducation(input: ResumeDraft, identity?: CandidateIdentity | null): ResumeEducation {
  const fallback = identity?.education ?? defaultResumeEducation();
  if (!input.education) return fallback;
  return {
    schoolBold: stripEmDashes(input.education.schoolBold ?? '') || fallback.schoolBold,
    schoolRest: stripEmDashes(input.education.schoolRest ?? '') || fallback.schoolRest,
    degree: stripEmDashes(input.education.degree ?? '') || fallback.degree,
    minors: stripEmDashes(input.education.minors ?? '') || fallback.minors,
  };
}

function foldProjectTitle(title: string, subtitle?: string, allowDraftDna = false) {
  let next = stripEmDashes(title);
  next = next
    .replace(/\s*&\s*Mock Draft Simulator\b/gi, '')
    .replace(/\s+Mock Draft Simulator\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const extra = stripEmDashes(subtitle ?? '');
  const blob = `${next} ${extra}`;
  if (allowDraftDna && /draftdna\.com/i.test(blob) && !/draftdna\.com/i.test(next)) {
    next = `${next.replace(/[:\s]+$/, '').trim()} (draftdna.com)`;
  }
  return next;
}

function findMatchingJob(jobs: ResumeJob[], company: string): ResumeJob | undefined {
  const key = companyKey(company);
  if (!key) return undefined;
  return (
    jobs.find((j) => companyKey(j.company) === key) ??
    jobs.find((j) => {
      const other = companyKey(j.company);
      return other.includes(key) || key.includes(other);
    })
  );
}

function findMatchingRole(roles: ResumeRole[], title: string): ResumeRole | undefined {
  return roles.find((r) => titlesMatch(r.title, title));
}

function findMatchingProject(projects: ResumeProject[], title: string): ResumeProject | undefined {
  return projects.find((p) => titlesMatch(p.title, title));
}

function sanitizeJobs(jobs: ResumeJob[]): ResumeJob[] {
  return jobs
    .filter((j) => j.company?.trim())
    .map((j) => ({
      company: stripEmDashes(j.company.trim()),
      locationDates: stripEmDashes(normalizeLocationDates(j.locationDates ?? '')),
      locked: Boolean(j.locked),
      roles: (j.roles ?? [])
        .filter((r) => r.title?.trim())
        .map((r) => ({
          title: stripEmDashes(r.title.trim()),
          locked: Boolean(r.locked),
          includeByDefault: r.includeByDefault,
          bullets: asBullets(r.bullets),
        })),
    }));
}

function mergeExperience(generated: ResumeJob[], skeleton: ResumeJob[]): ResumeJob[] {
  const jobs: ResumeJob[] = [];
  for (const skel of skeleton) {
    const match = findMatchingJob(generated, skel.company);
    const genRoles = match?.roles ?? [];
    const roles: ResumeRole[] = [];
    for (const skelRole of skel.roles) {
      const genRole = findMatchingRole(genRoles, skelRole.title);
      const include =
        Boolean(skelRole.locked) ||
        skelRole.includeByDefault !== false ||
        Boolean(genRole?.bullets.some((b) => b.text.trim()));
      if (!include) continue;
      roles.push({
        title: stripEmDashes(skelRole.title),
        locked: Boolean(skelRole.locked),
        includeByDefault: skelRole.includeByDefault,
        bullets: asBullets(genRole?.bullets?.length ? genRole.bullets : skelRole.bullets),
      });
    }
    if (!roles.length) continue;
    jobs.push({
      company: stripEmDashes(skel.company),
      locationDates: stripEmDashes(normalizeLocationDates(skel.locationDates, skel.locationDates)),
      locked: true,
      roles,
    });
  }
  return jobs;
}

function mergeProjects(
  generated: ResumeProject[],
  skeleton: ResumeProject[],
  allowDraftDna: boolean
): ResumeProject[] {
  const merged: ResumeProject[] = [];
  for (const skel of skeleton) {
    const match = findMatchingProject(generated, skel.title);
    const include =
      Boolean(skel.locked) ||
      skel.includeByDefault !== false ||
      Boolean(match?.bullets.some((b) => b.text.trim()));
    if (!include) continue;
    merged.push({
      title: foldProjectTitle(skel.title, undefined, allowDraftDna),
      subtitle: undefined,
      locked: Boolean(skel.locked),
      includeByDefault: skel.includeByDefault,
      bullets: asBullets(match?.bullets?.length ? match.bullets : skel.bullets),
    });
  }
  if (merged.length) return merged;
  return generated
    .filter((p) => p.title?.trim())
    .map((p) => ({
      title: foldProjectTitle(p.title, p.subtitle, allowDraftDna),
      subtitle: undefined,
      bullets: asBullets(p.bullets),
    }));
}

function capSkillGroups(input: ResumeSkillGroup[], identity?: CandidateIdentity | null): ResumeSkillGroup[] {
  const source = (input ?? []).length ? input : identity?.skills ?? [];
  const skills = source.slice(0, 2).map((g) => ({
    heading: (g.heading ?? '').trim() || 'Skills',
    items: (g.items ?? []).map((i) => String(i).trim()).filter(Boolean),
  }));
  while (skills.length < 2) {
    skills.push({ heading: skills.length === 0 ? 'Tools' : 'Skills', items: [] });
  }
  return skills.map((g) => ({
    heading: stripEmDashes(g.heading),
    items: capSkillsItems(g.items.map((i) => stripEmDashes(i)).filter(Boolean)),
  }));
}

export function sanitizeDraft(input: ResumeDraft, identity?: CandidateIdentity | null): ResumeDraft {
  return {
    header: withHeader(input, identity),
    education: withEducation(input, identity),
    profile: clampProfileText(input.profile ?? ''),
    experience: sanitizeJobs(Array.isArray(input.experience) ? input.experience : []),
    projects: (input.projects ?? [])
      .filter((p) => p.title?.trim())
      .map((p) => ({
        title: foldProjectTitle(p.title, p.subtitle, /draftdna/i.test(p.title)),
        subtitle: undefined,
        bullets: asBullets(p.bullets),
      })),
    skills: capSkillGroups(input.skills ?? [], identity),
    projectsSectionTitle: input.projectsSectionTitle || identity?.projectsSectionTitle,
  };
}

export function applyLockedStructure(input: ResumeDraft, identityArg?: CandidateIdentity | null): ResumeDraft {
  const identity = identityArg ?? null;
  const sanitized = sanitizeDraft(input, identity);
  if (!identity) return sanitized;

  const allowDraftDna = identity.projects.some((p) => /draftdna/i.test(p.title));
  const experience = identity.experience.length
    ? mergeExperience(sanitized.experience, identity.experience)
    : sanitized.experience;
  const projects = identity.projects.length
    ? mergeProjects(sanitized.projects, identity.projects, allowDraftDna)
    : sanitized.projects;

  return {
    ...sanitized,
    header: identity.header.name.trim() ? identity.header : sanitized.header,
    education: identity.education.schoolBold.trim() ? identity.education : sanitized.education,
    experience,
    projects,
    projectsSectionTitle: identity.projectsSectionTitle || sanitized.projectsSectionTitle,
  };
}

export function draftToPlainText(draft: ResumeDraft): string {
  const header = draft.header ?? defaultResumeHeader();
  const education = draft.education ?? defaultResumeEducation();
  const lines: string[] = [];
  if (header.name.trim()) lines.push(header.name);
  if (header.location.trim()) lines.push(header.location);
  if (header.contact.trim()) lines.push(header.contact);
  lines.push('');
  lines.push('PROFILE');
  lines.push(draft.profile);
  lines.push('');
  lines.push('EDUCATION');
  if (`${education.schoolBold}${education.schoolRest}`.trim()) {
    lines.push(`${education.schoolBold}${education.schoolRest}`);
  }
  if (education.degree.trim()) lines.push(education.degree);
  if (education.minors.trim()) lines.push(education.minors);
  lines.push('');
  lines.push('PROFESSIONAL EXPERIENCE');
  for (const job of draft.experience) {
    lines.push(`${job.company}${job.locationDates}`);
    for (const role of job.roles) {
      lines.push(role.title);
      for (const b of role.bullets) lines.push(`- ${b.text}`);
    }
  }
  lines.push('');
  lines.push(projectSectionTitle(draft).toUpperCase());
  for (const project of draft.projects) {
    lines.push(project.title);
    if (project.subtitle) lines.push(project.subtitle);
    for (const b of project.bullets) lines.push(`- ${b.text}`);
  }
  lines.push('');
  lines.push('RELEVANT SKILLS');
  for (const group of draft.skills) {
    lines.push(group.heading);
    lines.push(group.items.join(' | '));
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function formatKeywordAlignment(items: KeywordAlignmentItem[]): string {
  if (!items.length) return '';
  return items.map((i) => `${i.term}: ${i.status}`).join('\n');
}

export function countResumeBullets(draft: ResumeDraft): number {
  let n = 0;
  for (const job of draft.experience) {
    for (const role of job.roles) n += role.bullets.filter((b) => b.text.trim()).length;
  }
  for (const project of draft.projects) n += project.bullets.filter((b) => b.text.trim()).length;
  return n;
}

/** Keep user-edited header, education, and locked job labels across regenerate. */
export function preserveIdentityFields(
  generated: ResumeDraft,
  previous?: ResumeDraft | null,
  identity?: CandidateIdentity | null
): ResumeDraft {
  if (!previous) return generated;
  const next: ResumeDraft = {
    ...generated,
    header: previous.header
      ? {
          ...previous.header,
          contact: sanitizeResumeContact(previous.header.contact ?? ''),
        }
      : generated.header,
    education: previous.education ?? generated.education,
    projectsSectionTitle: previous.projectsSectionTitle || generated.projectsSectionTitle,
  };

  if (identity?.experience.length) {
    return applyLockedStructure(next, identity);
  }

  if (!previous.experience[0] || !next.experience[0]) return next;
  next.experience = next.experience.map((job, jobIndex) => {
    const prevJob = previous.experience[jobIndex];
    if (!prevJob) return job;
    return {
      ...job,
      company: prevJob.company,
      locationDates: prevJob.locationDates,
      roles: job.roles.map((role, roleIndex) => {
        const prevRole = prevJob.roles[roleIndex];
        return prevRole ? { ...role, title: prevRole.title } : role;
      }),
    };
  });
  return next;
}

function normalizePlainSectionKey(line: string): string | null {
  const t = line.trim().replace(/:$/, '').toUpperCase();
  if (/^PROFILE|^SUMMARY|^PROFESSIONAL SUMMARY|^OBJECTIVE/.test(t)) return 'profile';
  if (/^EDUCATION/.test(t)) return 'education';
  if (/^PROFESSIONAL EXPERIENCE|^WORK EXPERIENCE|^EXPERIENCE/.test(t)) return 'experience';
  if (/^DATA & ANALYTICS PROJECTS|^PROJECTS/.test(t)) return 'projects';
  if (/^RELEVANT SKILLS|^SKILLS|^TECHNICAL SKILLS/.test(t)) return 'skills';
  return null;
}

function isBulletLine(line: string) {
  return /^[\u2022•\-–—*]\s+/.test(line.trim());
}

function stripBulletPrefix(line: string) {
  return line.trim().replace(/^[\u2022•\-–—*]\s+/, '');
}

function isCompanyLine(line: string) {
  const idx = line.indexOf(',');
  if (idx < 0) return false;
  const after = line.slice(idx);
  return /\d{4}|present|\([A-Za-z]/i.test(after);
}

function parsePlainExperience(lines: string[]): ResumeJob[] {
  const jobs: ResumeJob[] = [];
  let current: ResumeJob | null = null;
  let currentRole: ResumeRole | null = null;

  function flushRole() {
    if (current && currentRole?.title.trim()) {
      current.roles.push(currentRole);
    }
    currentRole = null;
  }

  function flushJob() {
    flushRole();
    if (current?.company.trim()) jobs.push(current);
    current = null;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (isBulletLine(line)) {
      if (!current) continue;
      if (!currentRole) currentRole = { title: '', bullets: [] };
      currentRole.bullets.push({ text: stripEmDashes(stripBulletPrefix(line)) });
      continue;
    }

    if (isCompanyLine(line)) {
      flushJob();
      const parsed = parseCompanyLine(line);
      current = {
        company: stripEmDashes(parsed.company),
        locationDates: stripEmDashes(parsed.locationDates),
        roles: [],
        locked: false,
      };
      continue;
    }

    if (!current) continue;
    flushRole();
    currentRole = { title: stripEmDashes(line), bullets: [] };
  }

  flushJob();
  return jobs;
}

function parsePlainProjects(lines: string[]): ResumeProject[] {
  const projects: ResumeProject[] = [];
  let current: ResumeProject | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (isBulletLine(line)) {
      if (!current) continue;
      current.bullets.push({ text: stripEmDashes(stripBulletPrefix(line)) });
      continue;
    }

    if (current) projects.push(current);
    current = { title: stripEmDashes(line), bullets: [] };
  }

  if (current) projects.push(current);
  return projects;
}

function parsePlainSkills(lines: string[]): ResumeSkillGroup[] {
  const groups: ResumeSkillGroup[] = [];
  let i = 0;
  while (i < lines.length) {
    while (i < lines.length && !lines[i]?.trim()) i++;
    if (i >= lines.length) break;
    const heading = stripEmDashes(lines[i]!.trim());
    i++;
    while (i < lines.length && !lines[i]?.trim()) i++;
    const itemsLine = i < lines.length ? lines[i]!.trim() : '';
    i++;
    groups.push({
      heading,
      items: itemsLine
        .split('|')
        .map((s) => stripEmDashes(s.trim()))
        .filter(Boolean),
    });
  }
  return groups;
}

/** Reconstruct a structured draft from legacy plain-text tailoring output. */
export function plainTextToResumeDraft(text: string | null | undefined): ResumeDraft | null {
  if (!text?.trim() || text.trim().startsWith('{')) return null;

  const { resume } = splitResumeOutput(text);
  const lines = resume.split('\n');
  const firstSectionIdx = lines.findIndex((line) => normalizePlainSectionKey(line));
  if (firstSectionIdx < 0) return null;

  const headerLines = lines
    .slice(0, firstSectionIdx)
    .map((line) => line.trim())
    .filter(Boolean);
  const fallbackHeader = defaultResumeHeader();
  const header: ResumeHeader = {
    name: stripEmDashes(headerLines[0] ?? fallbackHeader.name),
    location: stripEmDashes(headerLines[1] ?? fallbackHeader.location),
    contact: sanitizeResumeContact(stripEmDashes(headerLines[2] ?? fallbackHeader.contact)),
  };

  const sectionLines: Record<string, string[]> = {
    profile: [],
    education: [],
    experience: [],
    projects: [],
    skills: [],
  };
  let currentKey: string | null = null;

  for (let i = firstSectionIdx; i < lines.length; i++) {
    const key = normalizePlainSectionKey(lines[i] ?? '');
    if (key) {
      currentKey = key;
      continue;
    }
    if (currentKey) sectionLines[currentKey].push(lines[i] ?? '');
  }

  const eduLines = sectionLines.education.map((l) => l.trim()).filter(Boolean);
  const schoolParsed = parseEducationLine(eduLines[0] ?? '');
  const education: ResumeEducation = {
    schoolBold: stripEmDashes(schoolParsed.schoolBold || defaultResumeEducation().schoolBold),
    schoolRest: stripEmDashes(schoolParsed.schoolRest || defaultResumeEducation().schoolRest),
    degree: stripEmDashes(eduLines[1] ?? defaultResumeEducation().degree),
    minors: stripEmDashes(eduLines[2] ?? defaultResumeEducation().minors),
  };

  const draft: ResumeDraft = {
    header,
    education,
    profile: stripEmDashes(sectionLines.profile.join('\n').trim()),
    experience: parsePlainExperience(sectionLines.experience),
    projects: parsePlainProjects(sectionLines.projects),
    skills: parsePlainSkills(sectionLines.skills),
  };

  if (!draft.profile && !draft.experience.length && !draft.projects.length) return null;
  return sanitizeDraft(draft);
}

/** JSON draft when available; otherwise rebuild from legacy plain-text output. */
export function resolveResumeFromOutput(text: string | null | undefined): ResumeSessionOutput | null {
  const json = parseResumeOutput(text);
  if (json) return json;
  const draft = plainTextToResumeDraft(text);
  if (!draft) return null;
  return { version: 1, draft, keywordAlignment: [] };
}
