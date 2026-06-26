import PDFDocument from 'pdfkit';
import type { ResumeFormatMeta } from './resume-structure';
import { parseResumeBlocks } from './resume-structure';

const MARGIN = 36; // 0.5 inch in points
const BODY_SIZE = 11;
const NAME_SIZE = 14;
const CONTENT_WIDTH = 612 - MARGIN * 2; // US Letter

export function textToPdfBuffer(text: string, formatMeta?: ResumeFormatMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const blocks = parseResumeBlocks(text, formatMeta);

    for (const block of blocks) {
      if (block.type === 'header') {
        doc
          .font(block.primary ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(block.primary ? NAME_SIZE : BODY_SIZE)
          .text(block.text, { align: block.center ? 'center' : 'left', width: CONTENT_WIDTH });
        doc.moveDown(0.15);
        continue;
      }

      if (block.type === 'section') {
        doc.moveDown(0.35);
        doc
          .font('Helvetica-Bold')
          .fontSize(BODY_SIZE)
          .text(block.text.toUpperCase(), { width: CONTENT_WIDTH });
        const lineY = doc.y + 2;
        doc
          .moveTo(MARGIN, lineY)
          .lineTo(MARGIN + CONTENT_WIDTH, lineY)
          .strokeColor('#444444')
          .lineWidth(0.5)
          .stroke();
        doc.moveDown(0.25);
        continue;
      }

      if (block.type === 'bullet') {
        doc
          .font('Helvetica')
          .fontSize(BODY_SIZE)
          .text(`• ${block.text}`, {
            width: CONTENT_WIDTH,
            indent: 12,
            paragraphGap: 3,
          });
        continue;
      }

      doc.font('Helvetica').fontSize(BODY_SIZE).text(block.text, {
        width: CONTENT_WIDTH,
        paragraphGap: 3,
      });
    }

    doc.end();
  });
}
