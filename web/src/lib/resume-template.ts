/** Locked layout + content from Trevor's Word/PDF resume template. */

export const RESUME_ACCENT = '#4472C4';
export const RESUME_RULE = '#888888';
export const RESUME_LINK = '#467886';

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const LEFT = 18;
export const RULE_LEFT = 21;
export const RULE_RIGHT = 591;
export const CONTENT_WIDTH = RULE_RIGHT - LEFT;
export const BULLET_INDENT = 4.5;
export const TOP_NAME_Y = 19.5;
export const BOTTOM_MARGIN = 14;
/** Keep filling until leftover space is under ~1 line. */
export const FILL_IF_SLACK_PT = 10;
/** Each Relevant Skills group (the tool list, not the heading) wraps to at most this many lines. */
export const SKILLS_MAX_LINES = 2;
export const BODY_SIZE = 11;
export const NAME_SIZE = 26;
export const LINE_HEIGHT = 12.9;
export const LINE_GAP = LINE_HEIGHT - BODY_SIZE;

export const LOCKED_HEADER = {
  name: 'TREVOR FAUST',
  location: 'Seattle, WA | Willing to Relocate',
  email: 'trevorfaus27@gmail.com',
  phone: '(267) 664-0898',
  linkedinLabel: 'www.linkedin.com/in/trevor-faust-000t',
  linkedinUrl: 'https://www.linkedin.com/in/trevor-faust-000t',
  githubLabel: 'github.com/TrevorFaust',
  githubUrl: 'https://github.com/TrevorFaust',
};

/** Contact line excludes draftdna.com — that belongs on the DraftDNA project title only. */
export function sanitizeResumeContact(contact: string): string {
  return contact
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && !/\bdraftdna\.com\b/i.test(part))
    .join(' | ');
}

export function defaultResumeHeader(): ResumeHeader {
  return {
    name: LOCKED_HEADER.name,
    location: LOCKED_HEADER.location,
    contact: sanitizeResumeContact(
      [
        LOCKED_HEADER.email,
        LOCKED_HEADER.phone,
        LOCKED_HEADER.linkedinLabel,
        LOCKED_HEADER.githubLabel,
      ].join(' | ')
    ),
  };
}

export const LOCKED_EDUCATION = {
  schoolBold: 'Pennsylvania State University',
  schoolRest: ': State College, PA',
  degree: 'B.S. in Energy Engineering',
  minors: 'Minors: Environmental Engineering |Economics | Spanish',
};

export type ResumeHeader = {
  name: string;
  location: string;
  contact: string;
};

export type ResumeEducation = {
  schoolBold: string;
  schoolRest: string;
  degree: string;
  minors: string;
};

export function defaultResumeEducation(): ResumeEducation {
  return { ...LOCKED_EDUCATION };
}

export function educationLine(education: ResumeEducation) {
  return `${education.schoolBold}${education.schoolRest}`;
}

export function parseEducationLine(raw: string): Pick<ResumeEducation, 'schoolBold' | 'schoolRest'> {
  const idx = raw.indexOf(':');
  if (idx < 0) return { schoolBold: raw, schoolRest: '' };
  return { schoolBold: raw.slice(0, idx).trim(), schoolRest: raw.slice(idx) };
}

export function companyLine(job: { company: string; locationDates: string }) {
  return `${job.company}${job.locationDates}`;
}

export function parseCompanyLine(raw: string): { company: string; locationDates: string } {
  const idx = raw.indexOf(',');
  if (idx < 0) return { company: raw.trim(), locationDates: '' };
  return { company: raw.slice(0, idx).trim(), locationDates: raw.slice(idx) };
}

export const LOCKED_KENNAMETAL = {
  company: 'Kennametal',
  locationDates: ', Seattle, WA / Pittsburgh, PA / Solon, OH  (Feb 2021-Present)',
  channelRepTitle: 'Regional Channel Representative',
};

export const SECTION_TITLES = {
  profile: 'PROFILE',
  education: 'EDUCATION',
  experience: 'PROFESSIONAL EXPERIENCE',
  projects: 'DATA & ANALYTICS PROJECTS',
  skills: 'RELEVANT SKILLS',
} as const;

export type ResumeBullet = {
  text: string;
  /** Drop this bullet first when the page overflows. */
  cutFirst?: boolean;
};

export type ResumeRole = {
  title: string;
  bullets: ResumeBullet[];
  /** Channel Rep cannot be removed. */
  locked?: boolean;
};

export type ResumeJob = {
  company: string;
  /** Text after the bold company name, including leading comma/space. */
  locationDates: string;
  roles: ResumeRole[];
  locked?: boolean;
};

export type ResumeProject = {
  title: string;
  subtitle?: string;
  bullets: ResumeBullet[];
};

export type ResumeSkillGroup = {
  heading: string;
  items: string[];
};

export type ResumeDraft = {
  header?: ResumeHeader;
  education?: ResumeEducation;
  profile: string;
  experience: ResumeJob[];
  projects: ResumeProject[];
  skills: ResumeSkillGroup[];
};

export type KeywordAlignmentItem = {
  term: string;
  status: 'Yes' | 'Partial' | 'Gap' | string;
};

export type ResumeSessionOutput = {
  version: 1;
  draft: ResumeDraft;
  keywordAlignment: KeywordAlignmentItem[];
};

export function emptyKennametalJob(): ResumeJob {
  return {
    company: LOCKED_KENNAMETAL.company,
    locationDates: LOCKED_KENNAMETAL.locationDates,
    locked: true,
    roles: [
      {
        title: LOCKED_KENNAMETAL.channelRepTitle,
        locked: true,
        bullets: [],
      },
    ],
  };
}

export function resumeFileName(jobTitle: string | null | undefined) {
  const title = (jobTitle ?? 'Resume').replace(/[^\w\s.&+-]/g, '').replace(/\s+/g, ' ').trim();
  return `${title} - Trevor Faust.pdf`;
}
