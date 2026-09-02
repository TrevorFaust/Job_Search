import { applyLockedStructure } from './resume-draft';
import { measureResumeDraft, capSkillGroupsToLines, wrapBulletText, type ResumeLayoutResult } from './resume-pdf';
import type { ResumeDraft } from './resume-template';

const TIGHTEN: [RegExp, string][] = [
  [/\s+in order to\s+/gi, ' to '],
  [/\s+as well as\s+/gi, ' and '],
  [/\s+in addition to\s+/gi, ' and '],
  [/\s+that were\s+/gi, ' '],
  [/\s+that was\s+/gi, ' '],
  [/\s+that is\s+/gi, ' '],
  [/\s+subsequently\s+/gi, ' then '],
  [/\s+utilize[ds]?\s+/gi, ' used '],
  [/\s+utilizing\s+/gi, ' using '],
  [/\s+in order for\s+/gi, ' for '],
  [/\s{2,}/g, ' '],
];

export type FitResult = {
  draft: ResumeDraft;
  layout: ResumeLayoutResult;
  changed: boolean;
  bulletsRemoved: number;
  message: string;
};

function cloneDraft(draft: ResumeDraft): ResumeDraft {
  return capSkillGroupsToLines(applyLockedStructure(JSON.parse(JSON.stringify(draft)) as ResumeDraft));
}

function countBullets(draft: ResumeDraft) {
  let n = 0;
  for (const job of draft.experience) {
    for (const role of job.roles) n += role.bullets.filter((b) => b.text.trim()).length;
  }
  for (const project of draft.projects) n += project.bullets.filter((b) => b.text.trim()).length;
  return n;
}

function tightenText(text: string) {
  let next = text;
  for (const [pattern, replacement] of TIGHTEN) {
    next = next.replace(pattern, replacement);
  }
  return next.replace(/\s+/g, ' ').trim();
}

function squeezeWrappingBullets(draft: ResumeDraft): boolean {
  let changed = false;
  const visit = (text: string) => {
    const lines = wrapBulletText(text);
    const last = lines[lines.length - 1] ?? '';
    const lastWords = last.split(/\s+/).filter(Boolean).length;
    if (lines.length < 2 || lastWords > 5) return text;
    const squeezed = tightenText(text);
    if (squeezed === text) return text;
    const after = wrapBulletText(squeezed);
    if (after.length < lines.length) {
      changed = true;
      return squeezed;
    }
    return text;
  };

  for (const job of draft.experience) {
    for (const role of job.roles) {
      for (const bullet of role.bullets) bullet.text = visit(bullet.text);
    }
  }
  for (const project of draft.projects) {
    for (const bullet of project.bullets) bullet.text = visit(bullet.text);
  }
  return changed;
}

function dropOneBullet(draft: ResumeDraft): boolean {
  const channel = draft.experience[0]?.roles[0];

  const cutFrom = (bullets: { text: string; cutFirst?: boolean }[], keep: number) => {
    const cutIdx = [...bullets].map((b, i) => ({ b, i })).reverse().find((row) => row.b.cutFirst);
    if (cutIdx && bullets.length > keep) {
      bullets.splice(cutIdx.i, 1);
      return true;
    }
    return false;
  };

  if (channel && cutFrom(channel.bullets, 2)) return true;
  for (const role of draft.experience[0]?.roles.slice(1) ?? []) {
    if (cutFrom(role.bullets, 1)) return true;
  }
  for (const project of [...draft.projects].reverse()) {
    if (cutFrom(project.bullets, 1)) return true;
  }

  if (channel && channel.bullets.length >= 4) {
    channel.bullets.pop();
    return true;
  }

  const extraRole = draft.experience[0]?.roles.slice(1).find((r) => r.bullets.length >= 3);
  if (extraRole) {
    extraRole.bullets.pop();
    return true;
  }

  const lastProject = [...draft.projects].reverse().find((p) => p.bullets.length > 1);
  if (lastProject) {
    lastProject.bullets.pop();
    return true;
  }

  if (channel && channel.bullets.length > 2) {
    channel.bullets.pop();
    return true;
  }

  const roles = draft.experience[0]?.roles ?? [];
  const processIdx = roles.findIndex((r) => /process engineer/i.test(r.title));
  if (processIdx > 0) {
    if (roles[processIdx].bullets.length > 0) {
      roles[processIdx].bullets.pop();
      return true;
    }
    roles.splice(processIdx, 1);
    return true;
  }

  if (draft.projects.length > 1 && draft.projects[draft.projects.length - 1].bullets.length === 0) {
    draft.projects.pop();
    return true;
  }

  return false;
}

function shortenProfile(draft: ResumeDraft): boolean {
  const parts = draft.profile.split(/(?<=\.)\s+/).filter(Boolean);
  if (parts.length < 3) return false;
  parts.pop();
  draft.profile = parts.join(' ');
  return true;
}

function slackMessage(layout: ResumeLayoutResult) {
  const lines = Math.max(0, Math.round(layout.slackPt / 12.9));
  if (lines <= 1) return 'Already one page.';
  return `Already one page with about ${lines} line${lines === 1 ? '' : 's'} of room. Trim only cuts when the PDF would spill onto page 2 — add bullets in the preview to fill it.`;
}

export function fitResumeToPage(input: ResumeDraft): FitResult {
  const draft = cloneDraft(input);
  const beforeBullets = countBullets(draft);
  let layout = measureResumeDraft(draft);

  if (layout.fits) {
    return {
      draft,
      layout,
      changed: false,
      bulletsRemoved: 0,
      message: slackMessage(layout),
    };
  }

  const squeezed = squeezeWrappingBullets(draft);
  layout = measureResumeDraft(draft);
  if (layout.fits) {
    return {
      draft,
      layout,
      changed: squeezed,
      bulletsRemoved: 0,
      message: squeezed
        ? 'Shortened wrapping lines so leftover words fit on the line above.'
        : slackMessage(layout),
    };
  }

  let guard = 0;
  while (!layout.fits && guard < 24) {
    guard += 1;
    const dropped = dropOneBullet(draft);
    if (!dropped && !shortenProfile(draft)) break;
    layout = measureResumeDraft(draft);
  }

  const bulletsRemoved = Math.max(0, beforeBullets - countBullets(draft));
  const message = layout.fits
    ? bulletsRemoved
      ? `Removed ${bulletsRemoved} bullet${bulletsRemoved === 1 ? '' : 's'} to fit one page.`
      : 'Tightened wording to fit one page.'
    : 'Still over one page after cutting extras. Delete another bullet in the preview.';

  return {
    draft,
    layout,
    changed: bulletsRemoved > 0 || squeezed,
    bulletsRemoved,
    message,
  };
}
