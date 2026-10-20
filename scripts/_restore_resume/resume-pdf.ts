import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { ResumeDraft } from './resume-template';
import {
  BODY_SIZE,
  BOTTOM_MARGIN,
  BULLET_INDENT,
  CONTENT_WIDTH,
  LEFT,
  LINE_GAP,
  LINE_HEIGHT,
  LOCKED_EDUCATION,
  LOCKED_HEADER,
  NAME_SIZE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  RESUME_ACCENT,
  RESUME_RULE,
  RULE_LEFT,
  RULE_RIGHT,
  SECTION_TITLES,
  TOP_NAME_Y,
} from './resume-template';
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

function fontPath(file: string) {
  const dir = fontDir();
  if (!dir) {
    throw new Error(
      'Cambria fonts not found. Expected web/fonts/Cambria.ttf (copy from C:\\Windows\\Fonts).'
    );
  }
  return path.join(dir, file);
}

function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont('Cambria', fontPath(FONT_FILES.regular));
  doc.registerFont('Cambria-Bold', fontPath(FONT_FILES.bold));
  doc.registerFont('Cambria-Italic', fontPath(FONT_FILES.italic));
  doc.registerFont('Cambria-BoldItalic', fontPath(FONT_FILES.boldItalic));
}

export type ResumeLayoutResult = {
  pageCount: number;
  finalY: number;
  overflowPt: number;
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

function drawCentered(doc: PDFKit.PDFDocument, text: string, y: number, font: string, size: number, color = '#000000') {
  doc.font(font).fontSize(size).fillColor(color);
  doc.text(text, 0, y, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
  return y + (size === NAME_SIZE ? 29.4 : LINE_HEIGHT);
}

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string, y: number) {
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
  doc.font('Cambria-BoldItalic').fontSize(BODY_SIZE).fillColor(RESUME_ACCENT);
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

function drawBullet(doc: PDFKit.PDFDocument, text: string, y: number) {
  doc.font('Cambria').fontSize(BODY_SIZE).fillColor('#000000');
  doc.text('-', LEFT, y, { lineBreak: false });
  return drawWrapped(doc, text, LEFT + BULLET_INDENT, y, CONTENT_WIDTH - BULLET_INDENT, 'Cambria');
}

function drawCompanyLine(doc: PDFKit.PDFDocument, company: string, locationDates: string, y: number) {
  doc.font('Cambria-Bold').fontSize(BODY_SIZE).fillColor('#000000');
  doc.text(company, LEFT, y, { lineBreak: false, continued: true });
  doc.font('Cambria').text(locationDates, { lineBreak: false });
  return y + LINE_HEIGHT;
}

function drawRoleTitle(doc: PDFKit.PDFDocument, title: string, y: number) {
  doc.font('Cambria-Italic').fontSize(BODY_SIZE).fillColor('#000000');
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

function layoutResume(doc: PDFKit.PDFDocument, draft: ResumeDraft): ResumeLayoutResult {
  registerFonts(doc);

  let y = TOP_NAME_Y;
  y = drawCentered(doc, LOCKED_HEADER.name, y, 'Cambria-Bold', NAME_SIZE, RESUME_ACCENT);
  y = drawCentered(doc, LOCKED_HEADER.location, y, 'Cambria', BODY_SIZE);

  const contact = [
    LOCKED_HEADER.email,
    LOCKED_HEADER.phone,
    LOCKED_HEADER.linkedinLabel,
    LOCKED_HEADER.githubLabel,
    LOCKED_HEADER.siteLabel,
  ].join(' | ');
  doc.font('Cambria').fontSize(BODY_SIZE).fillColor('#000000');
  const contactLines = wrapLines(doc, contact, RULE_RIGHT - RULE_LEFT);
  for (const line of contactLines) {
    doc.text(line, 0, y, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
    y += LINE_HEIGHT;
  }

  y = drawSectionHeader(doc, SECTION_TITLES.profile, y);
  y = drawWrapped(doc, draft.profile, LEFT, y, CONTENT_WIDTH, 'Cambria');

  y = drawSectionHeader(doc, SECTION_TITLES.education, y);
  y = drawCompanyLine(doc, LOCKED_EDUCATION.schoolBold, LOCKED_EDUCATION.schoolRest, y);
  doc.font('Cambria-Bold').fontSize(BODY_SIZE).fillColor('#000000');
  doc.text(LOCKED_EDUCATION.degree, LEFT, y, { lineBreak: false });
  y += LINE_HEIGHT;
  y = drawWrapped(doc, LOCKED_EDUCATION.minors, LEFT, y, CONTENT_WIDTH, 'Cambria');

  y = drawSectionHeader(doc, SECTION_TITLES.experience, y);
  for (const job of draft.experience) {
    y = drawCompanyLine(doc, job.company, job.locationDates, y);
    for (const role of job.roles) {
      y = drawRoleTitle(doc, role.title, y);
      for (const bullet of role.bullets) {
        y = drawBullet(doc, bullet.text, y);
      }
    }
  }

  y = drawSectionHeader(doc, SECTION_TITLES.projects, y);
  for (const project of draft.projects) {
    y = drawRoleTitle(doc, project.title, y);
    if (project.subtitle) {
      doc.font('Cambria-Italic').fontSize(BODY_SIZE).fillColor('#000000');
      y = drawWrapped(doc, project.subtitle, LEFT, y, CONTENT_WIDTH, 'Cambria-Italic');
    }
    for (const bullet of project.bullets) {
      y = drawBullet(doc, bullet.text, y);
    }
  }

  y = drawSectionHeader(doc, SECTION_TITLES.skills, y);
  draft.skills.forEach((group, idx) => {
    if (idx > 0) y += LINE_HEIGHT;
    doc.font('Cambria-Italic').fontSize(BODY_SIZE).fillColor('#000000');
    doc.text(group.heading, 0, y, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
    y += LINE_HEIGHT;
    const joined = group.items.join(' | ');
    doc.font('Cambria').fontSize(BODY_SIZE);
    const skillLines = wrapLines(doc, joined, CONTENT_WIDTH);
    for (const line of skillLines) {
      doc.text(line, 0, y, { width: PAGE_WIDTH, align: 'center', lineBreak: false });
      y += LINE_HEIGHT;
    }
  });

  const limit = PAGE_HEIGHT - BOTTOM_MARGIN;
  const overflowPt = Math.max(0, y - limit);
  return {
    pageCount: overflowPt > 0 ? 2 : 1,
    finalY: y,
    overflowPt,
    fits: overflowPt <= 1,
  };
}

function makeDoc() {
  return new PDFDocument({
    size: 'LETTER',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: true,
    bufferPages: true,
  });
}

export function measureResumeDraft(draft: ResumeDraft): ResumeLayoutResult {
  const doc = makeDoc();
  const result = layoutResume(doc, draft);
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
    layoutResume(doc, draft);
    doc.end();
  });
}

/** Cover letters and legacy plain-text resumes. */
export function textToPdfBuffer(text: string, formatMeta?: ResumeFormatMeta): Promise<Buffer> {
  const structured = parseResumeOutput(text);
  if (structured) return draftToPdfBuffer(structured.draft);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const blocks = parseResumeBlocks(text, formatMeta);
    const width = PAGE_WIDTH - 72;

    for (const block of blocks) {
      if (block.type === 'header') {
        doc
          .font(block.primary ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(block.primary ? 14 : 11)
          .text(block.text, { align: block.center ? 'center' : 'left', width });
        doc.moveDown(0.15);
        continue;
      }

      if (block.type === 'section') {
        doc.moveDown(0.35);
        doc.font('Helvetica-Bold').fontSize(11).text(block.text.toUpperCase(), { width });
        const lineY = doc.y + 2;
        doc.moveTo(36, lineY).lineTo(36 + width, lineY).strokeColor('#444444').lineWidth(0.5).stroke();
        doc.moveDown(0.25);
        continue;
      }

      if (block.type === 'bullet') {
        doc.font('Helvetica').fontSize(11).text(`• ${block.text}`, { width, indent: 12, paragraphGap: 3 });
        continue;
      }

      doc.font('Helvetica').fontSize(11).text(block.text, { width, paragraphGap: 3 });
    }

    doc.end();
  });
}

export { hexToRgb, wrapLines, LINE_HEIGHT, CONTENT_WIDTH, BULLET_INDENT };
