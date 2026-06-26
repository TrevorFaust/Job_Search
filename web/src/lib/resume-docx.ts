import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from 'docx';
import type { ResumeFormatMeta } from './resume-structure';
import { parseResumeBlocks } from './resume-structure';

const FONT = 'Calibri';
const BODY = 22;
const SECTION = 22;

function sectionParagraph(text: string) {
  return new Paragraph({
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        font: FONT,
        size: SECTION,
        allCaps: true,
      }),
    ],
    spacing: { before: 180, after: 80, line: 240 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '444444', space: 4 },
    },
  });
}

function bodyParagraph(text: string, opts?: { bold?: boolean; center?: boolean; after?: number }) {
  return new Paragraph({
    alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [
      new TextRun({
        text,
        font: FONT,
        size: BODY,
        bold: opts?.bold,
      }),
    ],
    spacing: { after: opts?.after ?? 60, line: 240 },
  });
}

function bulletParagraph(text: string) {
  return new Paragraph({
    numbering: { reference: 'resume-bullets', level: 0 },
    children: [new TextRun({ text, font: FONT, size: BODY })],
    spacing: { after: 40, line: 240 },
  });
}

export async function textToDocxBuffer(
  text: string,
  formatMeta?: ResumeFormatMeta
): Promise<Buffer> {
  const blocks = parseResumeBlocks(text, formatMeta);
  const children: Paragraph[] = [];
  let headerCount = 0;

  for (const block of blocks) {
    if (block.type === 'header') {
      const idx = headerCount++;
      children.push(
        bodyParagraph(block.text, {
          bold: block.primary,
          center: block.center,
          after: idx === 0 ? 120 : 40,
        })
      );
    } else if (block.type === 'section') {
      children.push(sectionParagraph(block.text));
    } else if (block.type === 'bullet') {
      children.push(bulletParagraph(block.text));
    } else {
      children.push(bodyParagraph(block.text));
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'resume-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.15) },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11),
            },
            margin: {
              top: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.5),
              right: convertInchesToTwip(0.5),
            },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
