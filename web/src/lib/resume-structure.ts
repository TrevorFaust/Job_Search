export type ResumeFormatMeta = {
  sections: string[];
  sectionOrder: string[];
  bulletStyle: 'bullet' | 'dash' | 'none';
  lineCount: number;
  sampleHeaders: string[];
};

const SECTION_PATTERNS = [
  /^profile$/i,
  /^summary$/i,
  /^professional summary$/i,
  /^objective$/i,
  /^experience$/i,
  /^work experience$/i,
  /^professional experience$/i,
  /^education$/i,
  /^skills$/i,
  /^technical skills$/i,
  /^certifications$/i,
  /^projects$/i,
  /^volunteer$/i,
  /^interests$/i,
  /^awards$/i,
];

function isSectionHeader(line: string) {
  const t = line.trim().replace(/:$/, '');
  if (!t || t.length > 60) return false;
  if (SECTION_PATTERNS.some((p) => p.test(t))) return true;
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.length < 40) return true;
  if (/^[A-Z][A-Za-z\s/&-]{2,40}:$/.test(line.trim())) return true;
  return false;
}

function normalizeSection(line: string) {
  return line.trim().replace(/:$/, '').replace(/\s+/g, ' ');
}

export function matchesSectionHeader(line: string, formatMeta?: ResumeFormatMeta) {
  const t = line.trim().replace(/:$/, '');
  if (!t || t.length > 60) return false;
  if (formatMeta?.sectionOrder.some((s) => s.toLowerCase() === t.toLowerCase())) return true;
  return isSectionHeader(line);
}

export type ResumeBlock =
  | { type: 'header'; text: string; primary: boolean; center: boolean }
  | { type: 'section'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'body'; text: string };

/** Parsed resume content for DOCX/PDF export (excludes Keyword Alignment). */
export function parseResumeBlocks(text: string, formatMeta?: ResumeFormatMeta): ResumeBlock[] {
  const { resume } = splitResumeOutput(text);
  const lines = resume.split('\n');
  const blocks: ResumeBlock[] = [];
  const firstSectionIdx = lines.findIndex((l) => matchesSectionHeader(l, formatMeta));
  const headerEnd = firstSectionIdx > 0 ? firstSectionIdx : Math.min(3, lines.length);

  for (let i = 0; i < headerEnd; i++) {
    const trimmed = lines[i]?.trim();
    if (!trimmed) continue;
    blocks.push({ type: 'header', text: trimmed, primary: i === 0, center: i <= 1 });
  }

  for (let i = headerEnd; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (matchesSectionHeader(raw, formatMeta)) {
      blocks.push({ type: 'section', text: trimmed.replace(/:$/, '') });
    } else if (/^[\u2022•\-–—*]\s+/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[\u2022•\-–—*]\s+/, '') });
    } else {
      blocks.push({ type: 'body', text: trimmed });
    }
  }

  return blocks;
}

/** Capture layout cues from the uploaded resume text. */
export function extractResumeStructure(text: string): ResumeFormatMeta {
  const lines = text.split('\n');
  const sectionOrder: string[] = [];
  let bulletStyle: ResumeFormatMeta['bulletStyle'] = 'none';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[\u2022•\-–—*]\s+/.test(line)) {
      bulletStyle = line.startsWith('-') || line.startsWith('–') ? 'dash' : 'bullet';
    }
    if (isSectionHeader(line)) {
      const name = normalizeSection(line);
      if (!sectionOrder.includes(name)) sectionOrder.push(name);
    }
  }

  return {
    sections: sectionOrder,
    sectionOrder,
    bulletStyle,
    lineCount: lines.filter((l) => l.trim()).length,
    sampleHeaders: sectionOrder.slice(0, 8),
  };
}

/** Remove bullet/dash prefixes so pasted text does not double-format in the user's template. */
export function stripResumeBulletPrefixes(text: string): string {
  const { resume, keywordAlignment } = splitResumeOutput(text);
  const cleaned = resume
    .split('\n')
    .map((line) => line.replace(/^(\s*)[\u2022•\-–—*]\s+/, '$1'))
    .join('\n');
  if (keywordAlignment) {
    return `${cleaned}\n\nKeyword Alignment\n${keywordAlignment}`;
  }
  return cleaned;
}

export function splitResumeOutput(text: string): { resume: string; keywordAlignment: string | null } {
  const marker = /\n\s*Keyword Alignment\s*\n/i;
  const match = text.match(marker);
  if (!match || match.index === undefined) {
    return { resume: text.trim(), keywordAlignment: null };
  }
  return {
    resume: text.slice(0, match.index).trim(),
    keywordAlignment: text.slice(match.index + match[0].length).trim(),
  };
}

/** Light post-process so analysis copy speaks to the user directly. */
export function addressCandidateDirectly(text: string, candidateName?: string | null) {
  if (!text) return text;
  let out = text;
  if (candidateName) {
    const first = candidateName.split(/\s+/)[0];
    if (first) {
      out = out.replace(new RegExp(`\\b${first}\\b('s)?`, 'gi'), 'you');
      out = out.replace(/\byou are\b/gi, 'you are');
      out = out.replace(/\bYou are\b/g, 'You are');
    }
  }
  out = out.replace(/\bthe candidate\b/gi, 'you');
  out = out.replace(/\bThe candidate\b/g, 'You');
  out = out.replace(/\btheir\b/gi, 'your');
  out = out.replace(/\bTheir\b/g, 'Your');
  out = out.replace(/\bthey\b/gi, 'you');
  out = out.replace(/\bThey\b/g, 'You');
  out = out.replace(/\bthem\b/gi, 'you');
  return out;
}
