import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { ResumeDraft } from './resume-template';
import {
  BODY_SIZE,
  BOTTOM_MARGIN,
  CONTENT_WIDTH,
  LEFT,
  LINE_HEIGHT,
  NAME_SIZE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  RESUME_ACCENT,
  RESUME_RULE,
  RULE_LEFT,
  RULE_RIGHT,
  SECTION_TITLES,
  SKILLS_MAX_LINES,
  TOP_NAME_Y,
  defaultResumeEducation,
  defaultResumeHeader,
} from './resume-template';
import {
  COVER_LETTER_MARGIN_PT,
  computeCoverLetterSpacing,
  coverLetterDate,
  coverLetterHeaderLines,
  parseCoverLetterParagraphs,
} from './cover-letter';
import { parseResumeOutput } from './resume-draft';
import type { ResumeFormatMeta } from './resume-structure';
import { parseResumeBlocks } from './resume-structure';

const FONT_FILES = {
  regular: 'Cambria.ttf',
  bold: 'Cambria-Bold.ttf',
  italic: 'Cambria-Italic.ttf',
  boldItalic: 'Cambria-BoldItalic.ttf',
} as const;

function fontDir() {
  const candidates = [
    path.join(process.cwd(), 'fonts'),
    path.join(process.cwd(), 'web', 'fonts'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, FONT_FILES.regular)));
}

type ResumeFontSet = {
  regular: string;
  bold: string;
  italic: string;
  boldItalic: string;
};

function cambriaFontSet(): ResumeFontSet {
  return {
    regular: 'Cambria',
    bold: 'Cambria-Bold',
    italic: 'Cambria-Italic',
    boldItalic: 'Cambria-BoldItalic',
  };
}

function timesFontSet(): ResumeFontSet {
  return {
    regular: 'Times-Roman',
    bold: 'Times-Bold',
    italic: 'Times-Italic',
    boldItalic: 'Times-BoldItalic',
  };
}

/** Prefer local Cambria TTFs; fall back to PDFKit built-ins (needs serverExternalPackages). */
function registerFonts(doc: PDFKit.PDFDocument): ResumeFontSet {
  const dir = fontDir();
  if (!dir) return timesFontSet();
  const fonts = cambriaFontSet();
  doc.registerFont(fonts.regular, path.join(dir, FONT_FILES.regular));
  doc.registerFont(fonts.bold, path.join(dir, FONT_FILES.bold));
  doc.registerFont(fonts.italic, path.join(dir, FONT_FILES.italic));
  doc.registerFont(fonts.boldItalic, path.join(dir, FONT_FILES.boldItalic));
  return fonts;
}

export type ResumeLayoutResult = {
  pageCount: number;
  finalY: number;
  overflowPt: number;
  slackPt: number;
  fits: boolean;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function wrapLines(doc: PDFKit.PDFDocument, text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (doc.widthOfString(next) <= width) current = next;
    else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawCentered(
  doc: PDFKit.PDFDocument,
  text: string,
  y: number,
  font: string,
  size: number,
  color = '#000000'
) {
  doc.font(font).fontSize(size).fillColor(color);
  doc.text(text, 0, y, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
  return y + (size === NAME_SIZE ? 29.4 : LINE_HEIGHT);
}

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number, fonts: ResumeFontSet) {
  const lineY = y + 8;
  doc
    .save()
    .strokeColor(RESUME_RULE)
    .lineWidth(1)
    .moveTo(RULE_LEFT, lineY)
    .lineTo(RULE_RIGHT, lineY)
    .stroke()
    .restore();
  const titleY = lineY + 5;
  doc.font(fonts.boldItalic).fontSize(BODY_SIZE).fillColor(RESUME_ACCENT);
  doc.text(title, LEFT, titleY, { width: CONTENT_WIDTH, lineBreak: false });
  return titleY + LINE_HEIGHT;
}

function drawWrapped(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  font: string
) {
  doc.font(font).fontSize(BODY_SIZE).fillColor('#000000');
  const lines = wrapLines(doc, text, width);
  let cursor = y;
  for (const line of lines) {
    doc.text(line, x, cursor, { width, lineBreak: false });
    cursor += LINE_HEIGHT;
  }
  return cursor;
}

function drawBullet(doc: PDFKit.PDFDocument, text: string, y: number, fonts: ResumeFontSet) {
  doc.font(fonts.regular).fontSize(BODY_SIZE).fillColor('#000000');
  const prefix = '- ';
  const indent = doc.widthOfString(prefix);
  doc.text(prefix, LEFT, y, { lineBreak: false });
  return drawWrapped(doc, text, LEFT + indent, y, CONTENT_WIDTH - indent, fonts.regular);
}

function drawCompanyLine(
  doc: PDFKit.PDFDocument,
  company: string,
  locationDates: string,
  y: number,
  fonts: ResumeFontSet
) {
  doc.font(fonts.bold).fontSize(BODY_SIZE).fillColor('#000000');
  doc.text(company, LEFT, y, { lineBreak: false });
  const companyWidth = doc.widthOfString(company);
  doc.font(fonts.regular).text(locationDates, LEFT + companyWidth, y, { lineBreak: false });
  return y + LINE_HEIGHT;
}

function drawRoleTitle(doc: PDFKit.PDFDocument, title: string, y: number, fonts: ResumeFontSet) {
  doc.font(fonts.italic).fontSize(BODY_SIZE).fillColor('#000000');
  const width = doc.widthOfString(title);
  doc.text(title, LEFT, y, { lineBreak: false });
  const underlineY = y + 10.5;
  doc
    .save()
    .strokeColor('#000000')
    .lineWidth(0.6)
    .moveTo(LEFT, underlineY)
    .lineTo(LEFT + width, underlineY)
    .stroke()
    .restore();
  return y + LINE_HEIGHT;
}

function drawLockedHeader(
  doc: PDFKit.PDFDocument,
  fonts: ResumeFontSet,
  header = defaultResumeHeader()
): number {
  const name = header.name.trim();
  const location = header.location.trim();
  const contact = header.contact.trim();

  if (name) {
    doc
      .save()
      .strokeColor(RESUME_ACCENT)
      .lineWidth(1)
      .rect(14, 13.5, 585, 33.5)
      .stroke()
      .restore();
  }

  let y = TOP_NAME_Y;
  if (name) y = drawCentered(doc, name, y, fonts.bold, NAME_SIZE, RESUME_ACCENT);
  if (location) y = drawCentered(doc, location, y, fonts.regular, BODY_SIZE);

  if (contact) {
    doc.font(fonts.regular).fontSize(BODY_SIZE).fillColor('#000000');
    const contactLines = wrapLines(doc, contact, RULE_RIGHT - RULE_LEFT);
    for (const line of contactLines) {
      doc.text(line, 0, y, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
      y += LINE_HEIGHT;
    }
  }
  return y;
}

function layoutResume(doc: PDFKit.PDFDocument, draft: ResumeDraft): ResumeLayoutResult {
  const fonts = registerFonts(doc);

  const header = draft.header ?? defaultResumeHeader();
  const education = draft.education ?? defaultResumeEducation();
  let y = drawLockedHeader(doc, fonts, header);
  y += 8;

  y = drawSectionHeader(doc, SECTION_TITLES.profile, y, fonts);
  y = drawWrapped(doc, draft.profile, LEFT, y, CONTENT_WIDTH, fonts.regular);

  y = drawSectionHeader(doc, SECTION_TITLES.education, y, fonts);
  if (`${education.schoolBold}${education.schoolRest}`.trim()) {
    y = drawCompanyLine(doc, education.schoolBold, education.schoolRest, y, fonts);
  }
  if (education.degree.trim()) {
    doc.font(fonts.bold).fontSize(BODY_SIZE).fillColor('#000000');
    doc.text(education.degree, LEFT, y, { lineBreak: false });
    y += LINE_HEIGHT;
  }
  if (education.minors.trim()) {
    y = drawWrapped(doc, education.minors, LEFT, y, CONTENT_WIDTH, fonts.regular);
  }

  y = drawSectionHeader(doc, SECTION_TITLES.experience, y, fonts);
  for (const job of draft.experience) {
    y = drawCompanyLine(doc, job.company, job.locationDates, y, fonts);
    for (const role of job.roles) {
      y = drawRoleTitle(doc, role.title, y, fonts);
      for (const bullet of role.bullets) {
        y = drawBullet(doc, bullet.text, y, fonts);
      }
    }
  }

  y = drawSectionHeader(doc, SECTION_TITLES.projects, y, fonts);
  for (const project of draft.projects) {
    y = drawRoleTitle(doc, project.title, y, fonts);
    if (project.subtitle) {
      doc.font(fonts.italic).fontSize(BODY_SIZE).fillColor('#000000');
      y = drawWrapped(doc, project.subtitle, LEFT, y, CONTENT_WIDTH, fonts.italic);
    }
    for (const bullet of project.bullets) {
      y = drawBullet(doc, bullet.text, y, fonts);
    }
  }

  y = drawSectionHeader(doc, SECTION_TITLES.skills, y, fonts);
  draft.skills.forEach((group, idx) => {
    if (idx > 0) y += LINE_HEIGHT;
    doc.font(fonts.italic).fontSize(BODY_SIZE).fillColor('#000000');
    doc.text(group.heading, 0, y, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
    y += LINE_HEIGHT;
    const joined = group.items.join(' | ');
    doc.font(fonts.regular).fontSize(BODY_SIZE);
    const skillLines = wrapLines(doc, joined, CONTENT_WIDTH);
    for (const line of skillLines) {
      doc.text(line, 0, y, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
      y += LINE_HEIGHT;
    }
  });

  const limit = PAGE_HEIGHT - BOTTOM_MARGIN;
  const overflowPt = Math.max(0, y - limit);
  const slackPt = Math.max(0, limit - y);
  return {
    pageCount: overflowPt > 0 ? 2 : 1,
    finalY: y,
    overflowPt,
    slackPt,
    fits: overflowPt <= 1,
  };
}

function makeDoc() {
  const dir = fontDir();
  return new PDFDocument({
    size: 'LETTER',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: true,
    bufferPages: true,
    // Skip bundled Helvetica.afm lookup when Cambria is available (Turbopack breaks AFM paths).
    ...(dir ? { font: path.join(dir, FONT_FILES.regular) } : {}),
  });
}

export function wrapBulletText(text: string): string[] {
  const doc = makeDoc();
  const fonts = registerFonts(doc);
  doc.font(fonts.regular).fontSize(BODY_SIZE);
  const indent = doc.widthOfString('- ');
  const lines = wrapLines(doc, text, CONTENT_WIDTH - indent);
  doc.end();
  return lines;
}

/** Drop trailing skill items until each group wraps to at most maxLines. */
export function capSkillGroupsToLines(
  draft: ResumeDraft,
  maxLines = SKILLS_MAX_LINES
): ResumeDraft {
  const doc = makeDoc();
  const fonts = registerFonts(doc);
  doc.font(fonts.regular).fontSize(BODY_SIZE);
  const skills = draft.skills.map((group) => {
    const items = group.items.map((i) => i.trim()).filter(Boolean);
    while (items.length > 1) {
      const lines = wrapLines(doc, items.join(' | '), CONTENT_WIDTH);
      if (lines.length <= maxLines) break;
      items.pop();
    }
    return { ...group, items };
  });
  doc.end();
  return { ...draft, skills };
}

export function measureResumeDraft(draft: ResumeDraft): ResumeLayoutResult {
  const capped = capSkillGroupsToLines(draft);
  const doc = makeDoc();
  const result = layoutResume(doc, capped);
  doc.end();
  return result;
}

export function draftToPdfBuffer(draft: ResumeDraft): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = makeDoc();
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    layoutResume(doc, capSkillGroupsToLines(draft));
    doc.end();
  });
}

function layoutCoverLetter(doc: PDFKit.PDFDocument, raw: string) {
  const fonts = registerFonts(doc);
  const margin = COVER_LETTER_MARGIN_PT;
  const width = PAGE_WIDTH - margin * 2;
  const paragraphs = parseCoverLetterParagraphs(raw);

  doc.font(fonts.regular).fontSize(BODY_SIZE).fillColor('#000000');
  let bodyLines = 0;
  for (const paragraph of paragraphs) {
    for (const line of paragraph.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      bodyLines += Math.max(1, wrapLines(doc, t, width).length);
    }
  }
  const spacing = computeCoverLetterSpacing(bodyLines, paragraphs);

  let y = margin;
  for (const line of coverLetterHeaderLines()) {
    doc.text(line, margin, y, { width, lineBreak: false });
    y += spacing.headerLineHeight;
  }
  y += spacing.headerLineHeight;
  doc.text(coverLetterDate(), margin, y, { width, lineBreak: false });
  y += spacing.headerLineHeight + spacing.afterDate;

  for (let i = 0; i < paragraphs.length; i++) {
    const physical = paragraphs[i]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (const piece of physical) {
      if (y > PAGE_HEIGHT - margin - spacing.lineHeight) {
        doc.addPage();
        y = margin;
      }
      const wrapped = wrapLines(doc, piece, width);
      for (const row of wrapped) {
        doc.text(row, margin, y, { width, lineBreak: false });
        y += spacing.lineHeight;
      }
    }
    if (i < paragraphs.length - 1) {
      y += spacing.paragraphGap;
    }
  }
}

export function coverLetterToPdfBuffer(raw: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = makeDoc();
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    layoutCoverLetter(doc, raw);
    doc.end();
  });
}

/** Legacy plain-text resumes. Structured JSON drafts route to draftToPdfBuffer. */
export function textToPdfBuffer(text: string, formatMeta?: ResumeFormatMeta): Promise<Buffer> {
  const structured = parseResumeOutput(text);
  if (structured) return draftToPdfBuffer(structured.draft);

  return new Promise((resolve, reject) => {
    const doc = makeDoc();
    const fonts = registerFonts(doc);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const blocks = parseResumeBlocks(text, formatMeta);
    const width = PAGE_WIDTH - 72;
    const margin = 36;

    for (const block of blocks) {
      if (block.type === 'header') {
        doc
          .font(block.primary ? fonts.bold : fonts.regular)
          .fontSize(block.primary ? 14 : 11)
          .text(block.text, margin, doc.y, { align: block.center ? 'center' : 'left', width });
        doc.moveDown(0.15);
        continue;
      }

      if (block.type === 'section') {
        doc.moveDown(0.35);
        doc.font(fonts.bold).fontSize(11).text(block.text.toUpperCase(), margin, doc.y, { width });
        const lineY = doc.y + 2;
        doc.moveTo(margin, lineY).lineTo(margin + width, lineY).strokeColor('#444444').lineWidth(0.5).stroke();
        doc.moveDown(0.25);
        continue;
      }

      if (block.type === 'bullet') {
        doc.font(fonts.regular).fontSize(11).text(`• ${block.text}`, margin, doc.y, {
          width,
          indent: 12,
          paragraphGap: 3,
        });
        continue;
      }

      doc.font(fonts.regular).fontSize(11).text(block.text, margin, doc.y, { width, paragraphGap: 3 });
    }

    doc.end();
  });
}

export { hexToRgb, wrapLines, LINE_HEIGHT, CONTENT_WIDTH };
