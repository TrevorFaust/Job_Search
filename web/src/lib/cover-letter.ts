import { LOCKED_HEADER, PAGE_HEIGHT, PAGE_WIDTH, defaultResumeHeader } from './resume-template';
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
  if (coverLetterHeaderLines().some((line) => line === t)) return true;
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
  return structureCoverLetterBody(lines.slice(i).join('\n').replace(/\s+$/, ''));
}

export function composeCoverLetter(body: string, now?: Date): string {
  const letter = normalizeCoverLetterBody(body);
  return [...coverLetterHeaderLines(), '', coverLetterDate(now), '', letter].join('\n').trim();
}

const CLOSING_TAIL = /\s*(sincerely,?)\s*(trevor\s+faust\.?)?\s*$/i;

/** Keep salutation, body, then closing with the name on the next line. */
export function structureCoverLetterBody(body: string): string {
  let text = body.replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const closing = '\n\nSincerely,\nTrevor Faust';
  if (CLOSING_TAIL.test(text)) {
    text = text.replace(CLOSING_TAIL, '').trimEnd();
    text = `${text}${closing}`;
  } else if (!/\bsincerely\b/i.test(text)) {
    text = `${text}${closing}`;
  } else {
    text = text.replace(/\n*(sincerely,?)\n*(trevor\s+faust\.?)?\s*$/i, closing);
  }

  text = text.replace(/(^|\n)(dear[^\n,]+,)[ \t]*/gi, '$1$2\n\n');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/** Compact header; body spacing stretches or shrinks to stay on one page. */
export const COVER_LETTER_HEADER_LINE_PT = 14;
const LINE_FLOOR = 12.6;
const LINE_COMFORT = 16.8;
const LINE_MAX = 20.5;
const PARA_FLOOR = 6;
const PARA_COMFORT = 14;
const PARA_MAX = 30;
const AFTER_DATE_FLOOR = 12;
const AFTER_DATE_COMFORT = 22;
const AFTER_DATE_MAX = 44;
/** Leave a little air above the bottom margin when the letter is short. */
const TARGET_SLACK_PT = 40;
const FIT_SLACK_PT = 8;

export type CoverLetterSpacing = {
  headerLineHeight: number;
  afterDate: number;
  lineHeight: number;
  paragraphGap: number;
};

export function parseCoverLetterParagraphs(body: string): string[] {
  return normalizeCoverLetterBody(body)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function estimateWrappedLines(text: string, widthPt: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const maxChars = Math.max(8, Math.floor(widthPt / 5.5));
  let lines = 1;
  let current = 0;
  for (const word of words) {
    const add = current === 0 ? word.length : word.length + 1;
    if (current + add > maxChars) {
      lines += 1;
      current = word.length;
    } else {
      current += add;
    }
  }
  return lines;
}

export function countCoverLetterBodyLines(paragraphs: string[], widthPt?: number): number {
  const width = widthPt ?? PAGE_WIDTH - COVER_LETTER_MARGIN_PT * 2;
  let lines = 0;
  for (const paragraph of paragraphs) {
    for (const line of paragraph.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      lines += estimateWrappedLines(t, width);
    }
  }
  return lines;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function mixSpacing(from: CoverLetterSpacing, to: CoverLetterSpacing, t: number): CoverLetterSpacing {
  return {
    headerLineHeight: COVER_LETTER_HEADER_LINE_PT,
    afterDate: lerp(from.afterDate, to.afterDate, t),
    lineHeight: lerp(from.lineHeight, to.lineHeight, t),
    paragraphGap: lerp(from.paragraphGap, to.paragraphGap, t),
  };
}

export function computeCoverLetterSpacing(bodyLineCount: number, paragraphs: string[]): CoverLetterSpacing {
  const headerLH = COVER_LETTER_HEADER_LINE_PT;
  const gaps = Math.max(0, paragraphs.length - 1);
  const headerBlock = headerLH * 5;
  const usable = PAGE_HEIGHT - COVER_LETTER_MARGIN_PT * 2;
  const target = usable - TARGET_SLACK_PT;
  const fit = usable - FIT_SLACK_PT;

  const height = (s: CoverLetterSpacing) =>
    headerBlock + s.afterDate + bodyLineCount * s.lineHeight + gaps * s.paragraphGap;

  const floor: CoverLetterSpacing = {
    headerLineHeight: headerLH,
    afterDate: AFTER_DATE_FLOOR,
    lineHeight: LINE_FLOOR,
    paragraphGap: PARA_FLOOR,
  };
  const comfort: CoverLetterSpacing = {
    headerLineHeight: headerLH,
    afterDate: AFTER_DATE_COMFORT,
    lineHeight: LINE_COMFORT,
    paragraphGap: PARA_COMFORT,
  };
  const max: CoverLetterSpacing = {
    headerLineHeight: headerLH,
    afterDate: AFTER_DATE_MAX,
    lineHeight: LINE_MAX,
    paragraphGap: PARA_MAX,
  };

  const hFloor = height(floor);
  const hComfort = height(comfort);
  const hMax = height(max);

  if (hMax <= target) return max;
  if (hComfort <= target) {
    return mixSpacing(comfort, max, (target - hComfort) / Math.max(1, hMax - hComfort));
  }
  if (hComfort <= fit) return comfort;
  if (hFloor >= fit) return floor;
  return mixSpacing(floor, comfort, (fit - hFloor) / Math.max(1, hComfort - hFloor));
}

export function coverLetterSpacingForBody(body: string): {
  paragraphs: string[];
  spacing: CoverLetterSpacing;
} {
  const paragraphs = parseCoverLetterParagraphs(body);
  const lines = countCoverLetterBodyLines(paragraphs);
  return { paragraphs, spacing: computeCoverLetterSpacing(lines, paragraphs) };
}
