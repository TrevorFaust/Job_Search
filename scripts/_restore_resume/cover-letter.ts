import { LOCKED_HEADER, defaultResumeHeader } from './resume-template';
import { stripEmDashes } from './resume-structure';

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_LINE = new RegExp(`^(${MONTHS})\\s+\\d{1,2},\\s+\\d{4}\\.?$`, 'i');
const SHORT_DATE = /^\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\.?$/;

/** US Letter inch margins for a standard business letter. */
export const COVER_LETTER_MARGIN_PT = 72;

export const COVER_LETTER_HEADER = {
  name: 'Trevor Faust',
  locationContact: `Seattle, WA | ${LOCKED_HEADER.email} | ${LOCKED_HEADER.phone}`,
  profiles: 'linkedin.com/in/trevor-faust-000t | github.com/TrevorFaust',
} as const;

export function coverLetterHeaderLines(): [string, string, string] {
  return [
    COVER_LETTER_HEADER.name,
    COVER_LETTER_HEADER.locationContact,
    COVER_LETTER_HEADER.profiles,
  ];
}

/** Pacific date so the letter year matches Trevor's local calendar, not the model. */
export function coverLetterDate(now = new Date()): string {
  return now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
}

function isLockedHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const resume = defaultResumeHeader();
  if (t === resume.name || t === resume.location || t === resume.contact) return true;
  if (coverLetterHeaderLines().includes(t as (typeof COVER_LETTER_HEADER)[keyof typeof COVER_LETTER_HEADER])) {
    return true;
  }
  if (/^trevor\s+faust\.?$/i.test(t)) return true;
  if (/seattle,\s*wa/i.test(t) && (/relocate/i.test(t) || /trevorfaus27@gmail/i.test(t))) return true;
  if (/trevorfaus27@gmail\.com/i.test(t)) return true;
  if (/\(267\)\s*664-0898/.test(t) && /linkedin|github|draftdna|seattle/i.test(t)) return true;
  if (/linkedin\.com\/in\/trevor-faust/i.test(t) && /github|draftdna/i.test(t)) return true;
  if (/^linkedin\.com\/in\/trevor-faust/i.test(t)) return true;
  if (/^github\.com\/TrevorFaust$/i.test(t)) return true;
  if (/^draftdna\.com$/i.test(t)) return true;
  return false;
}

function isDateLine(line: string): boolean {
  const t = line.trim();
  return DATE_LINE.test(t) || SHORT_DATE.test(t);
}

/** Strip letterhead and date lines so stored text is only the per-job body. */
export function normalizeCoverLetterBody(raw: string): string {
  if (!raw) return '';
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => stripEmDashes(line));
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t || isLockedHeaderLine(lines[i]) || isDateLine(lines[i])) {
      i += 1;
      continue;
    }
    break;
  }
  while (i < lines.length && !lines[i].trim()) i += 1;
  return lines.slice(i).join('\n').replace(/\s+$/, '');
}

export function composeCoverLetter(body: string, now?: Date): string {
  const letter = normalizeCoverLetterBody(body);
  return [...coverLetterHeaderLines(), '', coverLetterDate(now), '', letter].join('\n').trim();
}
