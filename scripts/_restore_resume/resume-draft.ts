import {
  emptyKennametalJob,
  LOCKED_KENNAMETAL,
  type KeywordAlignmentItem,
  type ResumeDraft,
  type ResumeJob,
  type ResumeSessionOutput,
} from './resume-template';

export function serializeResumeOutput(output: ResumeSessionOutput): string {
  return JSON.stringify(output);
}

export function parseResumeOutput(text: string | null | undefined): ResumeSessionOutput | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as ResumeSessionOutput;
    if (parsed?.version === 1 && parsed.draft && typeof parsed.draft.profile === 'string') {
      return {
        version: 1,
        draft: applyLockedStructure(parsed.draft),
        keywordAlignment: Array.isArray(parsed.keywordAlignment) ? parsed.keywordAlignment : [],
      };
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeLocationDates(raw: string) {
  const t = raw.trim();
  if (t.startsWith(',')) return t.startsWith(', ') ? t : `, ${t.slice(1).trim()}`;
  if (!t) return LOCKED_KENNAMETAL.locationDates;
  return `, ${t.replace(/^,\s*/, '')}`;
}

function asBullets(value: unknown): ResumeDraft['experience'][0]['roles'][0]['bullets'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return { text: item.trim(), cutFirst: false };
      if (item && typeof item === 'object' && 'text' in item) {
        const row = item as { text?: unknown; cutFirst?: unknown };
        return {
          text: String(row.text ?? '').trim(),
          cutFirst: Boolean(row.cutFirst),
        };
      }
      return { text: '', cutFirst: false };
    })
    .filter((b) => b.text.length > 0);
}

export function applyLockedStructure(input: ResumeDraft): ResumeDraft {
  const jobs = Array.isArray(input.experience) ? [...input.experience] : [];
  const kennametalIdx = jobs.findIndex((j) => /kennametal/i.test(j.company ?? ''));
  const kennametalSrc = kennametalIdx >= 0 ? jobs.splice(kennametalIdx, 1)[0] : emptyKennametalJob();

  const roles = Array.isArray(kennametalSrc.roles) ? [...kennametalSrc.roles] : [];
  const channelIdx = roles.findIndex((r) => /channel representative/i.test(r.title ?? ''));
  const channel = channelIdx >= 0 ? roles.splice(channelIdx, 1)[0] : { title: LOCKED_KENNAMETAL.channelRepTitle, bullets: [] };

  const lockedKennametal: ResumeJob = {
    company: LOCKED_KENNAMETAL.company,
    locationDates: LOCKED_KENNAMETAL.locationDates,
    locked: true,
    roles: [
      {
        title: LOCKED_KENNAMETAL.channelRepTitle,
        locked: true,
        bullets: asBullets(channel.bullets),
      },
      ...roles
        .filter((r) => r.title?.trim())
        .map((r) => ({
          title: r.title.trim(),
          locked: false,
          bullets: asBullets(r.bullets),
        })),
    ],
  };

  const extraJobs = jobs
    .filter((j) => j.company?.trim() && !/kennametal/i.test(j.company))
    .map((j) => ({
      company: j.company.trim(),
      locationDates: normalizeLocationDates(j.locationDates ?? ''),
      locked: false,
      roles: (j.roles ?? [])
        .filter((r) => r.title?.trim())
        .map((r) => ({
          title: r.title.trim(),
          locked: false,
          bullets: asBullets(r.bullets),
        })),
    }));

  const skills = (input.skills ?? [])
    .slice(0, 2)
    .map((g) => ({
      heading: (g.heading ?? '').trim() || 'Skills',
      items: (g.items ?? []).map((i) => String(i).trim()).filter(Boolean),
    }));

  while (skills.length < 2) {
    skills.push({ heading: skills.length === 0 ? 'Data & Analytic Tools' : 'Data Analysis', items: [] });
  }

  return {
    profile: (input.profile ?? '').trim(),
    experience: [lockedKennametal, ...extraJobs],
    projects: (input.projects ?? [])
      .filter((p) => p.title?.trim())
      .map((p) => ({
        title: p.title.trim(),
        subtitle: p.subtitle?.trim() || undefined,
        bullets: asBullets(p.bullets),
      })),
    skills,
  };
}

export function draftToPlainText(draft: ResumeDraft): string {
  const lines: string[] = [];
  lines.push('TREVOR FAUST');
  lines.push('Seattle, WA | Willing to Relocate');
  lines.push(
    'trevorfaus27@gmail.com | (267) 664-0898 | www.linkedin.com/in/trevor-faust-000t | github.com/TrevorFaust | draftdna.com'
  );
  lines.push('');
  lines.push('PROFILE');
  lines.push(draft.profile);
  lines.push('');
  lines.push('EDUCATION');
  lines.push('Pennsylvania State University: State College, PA');
  lines.push('B.S. in Energy Engineering');
  lines.push('Minors: Environmental Engineering |Economics | Spanish');
  lines.push('');
  lines.push('PROFESSIONAL EXPERIENCE');
  for (const job of draft.experience) {
    lines.push(`${job.company}${job.locationDates}`);
    for (const role of job.roles) {
      lines.push(role.title);
      for (const b of role.bullets) lines.push(`- ${b.text}`);
    }
  }
  lines.push('');
  lines.push('DATA & ANALYTICS PROJECTS');
  for (const project of draft.projects) {
    lines.push(project.title);
    if (project.subtitle) lines.push(project.subtitle);
    for (const b of project.bullets) lines.push(`- ${b.text}`);
  }
  lines.push('');
  lines.push('RELEVANT SKILLS');
  for (const group of draft.skills) {
    lines.push(group.heading);
    lines.push(group.items.join(' | '));
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function formatKeywordAlignment(items: KeywordAlignmentItem[]): string {
  if (!items.length) return '';
  return items.map((i) => `${i.term}: ${i.status}`).join('\n');
}
