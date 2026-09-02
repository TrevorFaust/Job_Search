import { splitResumeOutput, stripEmDashes } from './resume-structure';
import {
  defaultResumeEducation,
  defaultResumeHeader,
  emptyKennametalJob,
  LOCKED_KENNAMETAL,
  parseCompanyLine,
  parseEducationLine,
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
        draft: applyLockedStructure(parsed.draft),
        keywordAlignment: Array.isArray(parsed.keywordAlignment) ? parsed.keywordAlignment : [],
      };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeLocationDates(raw: string) {
  const t = raw.trim();
  if (t.startsWith(',')) return t.startsWith(', ') ? t : `, ${t.slice(1).trim()}`;
  if (!t) return LOCKED_KENNAMETAL.locationDates;
  return `, ${t.replace(/^,\s*/, '')}`;
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

function withHeader(input: ResumeDraft): ResumeHeader {
  const fallback = defaultResumeHeader();
  if (!input.header) return fallback;
  return {
    name: stripEmDashes(input.header.name ?? ''),
    location: stripEmDashes(input.header.location ?? ''),
    contact: sanitizeResumeContact(stripEmDashes(input.header.contact ?? '')),
  };
}

function withEducation(input: ResumeDraft): ResumeEducation {
  const fallback = defaultResumeEducation();
  if (!input.education) return fallback;
  return {
    schoolBold: stripEmDashes(input.education.schoolBold ?? ''),
    schoolRest: stripEmDashes(input.education.schoolRest ?? ''),
    degree: stripEmDashes(input.education.degree ?? ''),
    minors: stripEmDashes(input.education.minors ?? ''),
  };
}
function foldProjectTitle(title: string, subtitle?: string) {
  let next = stripEmDashes(title);
  const extra = stripEmDashes(subtitle ?? '');
  const blob = `${next} ${extra}`;
  if (/draftdna\.com/i.test(blob) && !/draftdna\.com/i.test(next)) {
    next = `${next.replace(/[:\s]+$/, '').trim()} (draftdna.com)`;
  }
  return next;
}

export function applyLockedStructure(input: ResumeDraft): ResumeDraft {
  const jobs = Array.isArray(input.experience) ? [...input.experience] : [];
  const kennametalIdx = jobs.findIndex((j) => /kennametal/i.test(j.company ?? ''));
  const kennametalSrc = kennametalIdx >= 0 ? jobs.splice(kennametalIdx, 1)[0] : emptyKennametalJob();

  const roles = Array.isArray(kennametalSrc.roles) ? [...kennametalSrc.roles] : [];
  const channelIdx = roles.findIndex((r) => /channel representative/i.test(r.title ?? ''));
  const channel = channelIdx >= 0 ? roles.splice(channelIdx, 1)[0] : { title: LOCKED_KENNAMETAL.channelRepTitle, bullets: [] };

  const lockedKennametal: ResumeJob = {
    company: stripEmDashes(kennametalSrc.company?.trim() || LOCKED_KENNAMETAL.company),
    locationDates: stripEmDashes(
      normalizeLocationDates(kennametalSrc.locationDates || LOCKED_KENNAMETAL.locationDates)
    ),
    locked: true,
    roles: [
      {
        title: stripEmDashes(channel.title?.trim() || LOCKED_KENNAMETAL.channelRepTitle),
        locked: true,
        bullets: asBullets(channel.bullets),
      },
      ...roles
        .filter((r) => r.title?.trim())
        .map((r) => ({
          title: stripEmDashes(r.title.trim()),
          locked: false,
          bullets: asBullets(r.bullets),
        })),
    ],
  };

  const extraJobs = jobs
    .filter((j) => j.company?.trim() && !/kennametal/i.test(j.company))
    .map((j) => ({
      company: stripEmDashes(j.company.trim()),
      locationDates: stripEmDashes(normalizeLocationDates(j.locationDates ?? '')),
      locked: false,
      roles: (j.roles ?? [])
        .filter((r) => r.title?.trim())
        .map((r) => ({
          title: stripEmDashes(r.title.trim()),
          locked: false,
          bullets: asBullets(r.bullets),
        })),
    }));

  const skills = (input.skills ?? [])
    .slice(0, 2)
    .map((g) => ({
      heading: (g.heading ?? '').trim() || 'Skills',
      items: (g.items ?? []).map((i) => String(i).trim()).filter(Boolean),
    }));

  while (skills.length < 2) {
    skills.push({ heading: skills.length === 0 ? 'Data & Analytic Tools' : 'Data Analysis', items: [] });
  }

  return {
    header: withHeader(input),
    education: withEducation(input),
    profile: stripEmDashes((input.profile ?? '').trim()),
    experience: [lockedKennametal, ...extraJobs],
    projects: (input.projects ?? [])
      .filter((p) => p.title?.trim())
      .map((p) => ({
        title: foldProjectTitle(p.title, p.subtitle),
        subtitle: undefined,
        bullets: asBullets(p.bullets),
      })),
    skills: skills.map((g) => ({
      heading: stripEmDashes(g.heading),
      items: capSkillsItems(g.items.map((i) => stripEmDashes(i)).filter(Boolean)),
    })),
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
  lines.push('DATA & ANALYTICS PROJECTS');
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

/** Keep user-edited header, education, and Kennametal labels across regenerate. */
export function preserveIdentityFields(generated: ResumeDraft, previous?: ResumeDraft | null): ResumeDraft {
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
  };
  const prevJob = previous.experience[0];
  const nextJob = next.experience[0];
  if (!prevJob || !nextJob) return next;
  const prevChannel = prevJob.roles.find((r) => r.locked) ?? prevJob.roles[0];
  next.experience[0] = {
    ...nextJob,
    company: prevJob.company,
    locationDates: prevJob.locationDates,
    roles: nextJob.roles.map((role, i) =>
      i === 0 && prevChannel ? { ...role, title: prevChannel.title } : role
    ),
  };
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
        locked: /kennametal/i.test(parsed.company),
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
  return applyLockedStructure(draft);
}

/** JSON draft when available; otherwise rebuild from legacy plain-text output. */
export function resolveResumeFromOutput(text: string | null | undefined): ResumeSessionOutput | null {
  const json = parseResumeOutput(text);
  if (json) return json;
  const draft = plainTextToResumeDraft(text);
  if (!draft) return null;
  return { version: 1, draft, keywordAlignment: [] };
}
