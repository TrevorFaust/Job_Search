export type DescriptionBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

const SECTION_HEADERS = [
  'summary',
  'job summary',
  'overview',
  'about the role',
  'about the job',
  'about us',
  'about the company',
  'the role',
  'what you will do',
  "what you'll do",
  'what you do',
  'responsibilities',
  'key responsibilities',
  'duties',
  'essential functions',
  'qualifications',
  'requirements',
  'minimum qualifications',
  'required qualifications',
  'preferred qualifications',
  'preferred skills',
  'skills',
  'experience',
  'education',
  'benefits',
  'compensation',
  'who you are',
  'what we offer',
  'nice to have',
  'bonus',
];

function normalizeText(text: string) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function stripHtml(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<h[1-6][^>]*>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isHeadingLine(line: string) {
  const trimmed = line.trim().replace(/:$/, '');
  if (!trimmed || trimmed.length > 80) return false;
  const lower = trimmed.toLowerCase();
  if (SECTION_HEADERS.includes(lower)) return true;
  if (/^#{1,3}\s/.test(trimmed)) return true;
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length < 60) return true;
  return /^[A-Z][^.!?]{2,60}:$/.test(line.trim());
}

function cleanHeading(line: string) {
  return line.trim().replace(/^#{1,3}\s*/, '').replace(/:$/, '');
}

function linesToBlocks(lines: string[]): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length) {
      blocks.push({ type: 'list', items: listItems });
      listItems = [];
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }

    if (isHeadingLine(line)) {
      flushList();
      blocks.push({ type: 'heading', text: cleanHeading(line) });
      continue;
    }

    const bulletMatch = line.match(/^(?:[-•*–—]|\d+[.)])\s+(.+)/);
    if (bulletMatch) {
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    flushList();
    blocks.push({ type: 'paragraph', text: line });
  }

  flushList();
  return blocks;
}

function splitInlineSections(text: string): { title: string | null; content: string }[] {
  const re = new RegExp(
    `\\b(${SECTION_HEADERS.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:?\\s*`,
    'gi'
  );
  const sections: { title: string | null; content: string }[] = [];
  let lastIndex = 0;
  let lastTitle: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      sections.push({ title: lastTitle, content: text.slice(lastIndex, match.index).trim() });
    }
    lastTitle = match[1];
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    sections.push({ title: lastTitle, content: text.slice(lastIndex).trim() });
  }

  return sections.filter((s) => s.content || s.title);
}

/** Turn stored description text into structured blocks for display. */
export function parseJobDescription(raw: string): DescriptionBlock[] {
  const text = normalizeText(stripHtml(raw));
  if (!text) return [];

  if (!text.includes('\n')) {
    const sections = splitInlineSections(text);
    if (sections.length > 1 || sections.some((s) => s.title)) {
      const blocks: DescriptionBlock[] = [];
      for (const section of sections) {
        if (section.title) blocks.push({ type: 'heading', text: section.title });
        if (section.content) blocks.push(...linesToBlocks(section.content.split(/(?<=[.!?])\s+/)));
      }
      return blocks.length ? blocks : [{ type: 'paragraph', text }];
    }
  }

  const blocks: DescriptionBlock[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split('\n');
    if (lines.length === 1 && isHeadingLine(lines[0])) {
      blocks.push({ type: 'heading', text: cleanHeading(lines[0]) });
      continue;
    }
    blocks.push(...linesToBlocks(lines));
  }

  return blocks.length ? blocks : [{ type: 'paragraph', text }];
}

/** Short plain-text preview for job cards — skips headings and HTML. */
export function descriptionPreview(raw: string, maxLength = 280): string {
  const text = normalizeText(stripHtml(raw));
  if (!text) return '';

  const blocks = parseJobDescription(text);
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === 'heading') continue;
    if (block.type === 'list') parts.push(block.items.join(' '));
    else parts.push(block.text);
    if (parts.join(' ').length >= 80) break;
  }

  let preview = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (preview.length < 80) preview = text.replace(/\s+/g, ' ').trim();
  if (preview.length <= maxLength) return preview;
  return `${preview.slice(0, maxLength).trim()}…`;
}
