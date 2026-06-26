import mammoth from 'mammoth';
import { extractResumeStructure, type ResumeFormatMeta } from './resume-structure';

export type ParsedResume = {
  text: string;
  filename: string;
  formatMeta: ResumeFormatMeta;
};

export async function parseResumeFile(file: File): Promise<ParsedResume> {
  const filename = file.name;
  const ext = filename.split('.').pop()?.toLowerCase();
  let text = '';

  if (ext === 'docx') {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer });
    text = result.value.trim();
  } else if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = result.text.trim();
    } finally {
      await parser.destroy();
    }
  } else if (ext === 'txt') {
    text = (await file.text()).trim();
  } else {
    throw new Error('Unsupported file type. Upload .docx, .pdf, or .txt');
  }

  return { text, filename, formatMeta: extractResumeStructure(text) };
}
