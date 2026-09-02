'use client';

import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
import type { ResumeDraft, ResumeJob, ResumeProject, ResumeSkillGroup } from '@/lib/resume-template';
import {
  BOTTOM_MARGIN,
  LINE_HEIGHT,
  SECTION_TITLES,
  TOP_NAME_Y,
  companyLine,
  defaultResumeEducation,
  defaultResumeHeader,
  educationLine,
  parseCompanyLine,
  parseEducationLine,
} from '@/lib/resume-template';
import { suggestedBulletsFor } from '@/lib/resume-bullet-bank';

type Props = {
  draft: ResumeDraft;
  onChange: (draft: ResumeDraft) => void;
  saving?: boolean;
  saved?: boolean;
  readOnly?: boolean;
};

const SHEET_IN = 11;

function AutoTextarea({
  value,
  onChange,
  className,
  placeholder,
  center,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  center?: boolean;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      style={style}
      className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-inherit outline-none ring-0 placeholder:text-neutral-400 focus:bg-amber-50/60 ${center ? 'text-center' : ''} ${className ?? ''}`}
    />
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-0 top-0 z-10 hidden rounded bg-white/90 px-1 text-[10px] leading-none text-neutral-500 shadow-sm group-hover:block hover:text-neutral-800"
    >
      {children}
    </button>
  );
}

function BulletEditor({
  bullets,
  onChange,
}: {
  bullets: ResumeDraft['projects'][0]['bullets'];
  onChange: (next: ResumeDraft['projects'][0]['bullets']) => void;
}) {
  return (
    <div className="relative">
      {bullets.map((bullet, i) => (
        <div key={i} className="group relative flex items-start gap-1">
          <span className="w-[11pt] shrink-0">- </span>
          <AutoTextarea
            value={bullet.text}
            onChange={(text) => {
              const next = bullets.map((b, idx) => (idx === i ? { ...b, text } : b));
              onChange(next);
            }}
            className="flex-1"
          />
          <GhostButton onClick={() => onChange(bullets.filter((_, idx) => idx !== i))}>Remove</GhostButton>
        </div>
      ))}
    </div>
  );
}

function updateJob(draft: ResumeDraft, jobIndex: number, job: ResumeJob): ResumeDraft {
  return { ...draft, experience: draft.experience.map((j, i) => (i === jobIndex ? job : j)) };
}

export function ResumePreview({ draft, onChange, saving, saved, readOnly = false }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowLines, setOverflowLines] = useState(0);
  const [emptyLines, setEmptyLines] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const pt = 96 / 72;
    const innerPx = SHEET_IN * 96 - (TOP_NAME_Y + BOTTOM_MARGIN) * pt;
    const extra = el.scrollHeight - innerPx;
    const linePx = LINE_HEIGHT * pt;
    if (extra > linePx) {
      setOverflowLines(Math.ceil(extra / linePx));
      setEmptyLines(0);
    } else {
      setOverflowLines(0);
      setEmptyLines(Math.max(0, Math.round(-extra / linePx)));
    }
  }, [draft]);

  const header = draft.header ?? defaultResumeHeader();
  const education = draft.education ?? defaultResumeEducation();

  return (
    <div className="space-y-3">
      {!readOnly && (
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {overflowLines > 0 ? (
          <p className="rounded-md border border-amber-700/60 bg-amber-950/40 px-2.5 py-1 text-amber-200">
            About {overflowLines} line{overflowLines === 1 ? '' : 's'} over one page — shorten a wrapping bullet or hit Trim to one page.
          </p>
        ) : emptyLines > 3 ? (
          <p className="rounded-md border border-amber-800/50 bg-amber-950/20 px-2.5 py-1 text-amber-200/90">
            About {emptyLines} lines of room at the bottom — lighter than your usual packed page. Add bullets or regenerate.
          </p>
        ) : (
          <p className="rounded-md border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1 text-emerald-300">
            Fits on one page
          </p>
        )}
        {saving && <span className="text-zinc-500">Saving…</span>}
        {saved && !saving && <span className="text-emerald-400/80">Saved</span>}
        <span className="text-zinc-600">Click any text to edit. Header and education start filled in; you can shorten or clear them.</span>
      </div>
      )}

      <div className={`rounded-lg border border-zinc-700 bg-zinc-950 p-3 ${readOnly ? 'overflow-visible' : 'overflow-x-auto'}`}>
        <div
          className="mx-auto bg-white text-black shadow-xl"
          style={{
            width: '8.5in',
            minHeight: readOnly ? undefined : '11in',
            padding: `${TOP_NAME_Y}pt 21pt ${BOTTOM_MARGIN}pt 18pt`,
            fontFamily: "Cambria, Caladea, 'Times New Roman', serif",
            fontSize: '11pt',
            lineHeight: '12.9pt',
            color: '#000',
          }}
        >
          <div ref={contentRef} className={readOnly ? 'pointer-events-none select-text' : undefined}>
          <div
            style={{
              border: '1pt solid #4472C4',
              margin: '-6pt -8pt 0 -4pt',
              padding: '2pt 0 3pt',
            }}
          >
            <AutoTextarea
              center
              className="font-bold"
              style={{ fontSize: '26pt', lineHeight: '29.4pt', color: '#4472C4' }}
              value={header.name}
              onChange={(name) => onChange({ ...draft, header: { ...header, name } })}
            />
          </div>
          <AutoTextarea
            center
            value={header.location}
            onChange={(location) => onChange({ ...draft, header: { ...header, location } })}
          />
          <AutoTextarea
            center
            value={header.contact}
            onChange={(contact) => onChange({ ...draft, header: { ...header, contact } })}
          />

          <SectionTitle>{SECTION_TITLES.profile}</SectionTitle>
          <AutoTextarea
            value={draft.profile}
            onChange={(profile) => onChange({ ...draft, profile })}
            placeholder="Profile tailored to this job…"
          />

          <SectionTitle>{SECTION_TITLES.education}</SectionTitle>
          <AutoTextarea
            value={educationLine(education)}
            onChange={(raw) => onChange({ ...draft, education: { ...education, ...parseEducationLine(raw) } })}
          />
          <AutoTextarea
            className="font-bold"
            value={education.degree}
            onChange={(degree) => onChange({ ...draft, education: { ...education, degree } })}
          />
          <AutoTextarea
            value={education.minors}
            onChange={(minors) => onChange({ ...draft, education: { ...education, minors } })}
          />

          <SectionTitle>{SECTION_TITLES.experience}</SectionTitle>
          {draft.experience.map((job, jobIndex) => (
            <JobBlock
              key={`${job.company}-${jobIndex}`}
              job={job}
              onChange={(next) => onChange(updateJob(draft, jobIndex, next))}
              onRemove={
                job.locked
                  ? undefined
                  : () => onChange({ ...draft, experience: draft.experience.filter((_, i) => i !== jobIndex) })
              }
            />
          ))}

          <SectionTitle>{SECTION_TITLES.projects}</SectionTitle>
          {draft.projects.map((project, i) => (
            <ProjectBlock
              key={i}
              project={project}
              onChange={(next) =>
                onChange({
                  ...draft,
                  projects: draft.projects.map((p, idx) => (idx === i ? next : p)),
                })
              }
              onRemove={() => onChange({ ...draft, projects: draft.projects.filter((_, idx) => idx !== i) })}
            />
          ))}

          <SectionTitle>{SECTION_TITLES.skills}</SectionTitle>
          {draft.skills.map((group, i) => (
            <div key={i} className={i > 0 ? 'mt-[12.9pt]' : ''}>
              <AutoTextarea
                center
                className="italic"
                value={group.heading}
                onChange={(heading) => {
                  const skills = draft.skills.map((g, idx) => (idx === i ? { ...g, heading } : g));
                  onChange({ ...draft, skills });
                }}
              />
              <AutoTextarea
                center
                value={group.items.join(' | ')}
                onChange={(raw) => {
                  const items = raw.split('|').map((s) => s.trim());
                  const skills = draft.skills.map((g, idx) => (idx === i ? { ...g, items } : g));
                  onChange({ ...draft, skills });
                }}
              />
            </div>
          ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              experience: [
                ...draft.experience,
                {
                  company: 'Company',
                  locationDates: ', City, ST (Dates)',
                  locked: false,
                  roles: [{ title: 'Title', locked: false, bullets: [{ text: '' }] }],
                },
              ],
            })
          }
          className="hover:text-amber-300"
        >
          + Employer
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              experience: draft.experience.map((job, i) =>
                i === 0
                  ? {
                      ...job,
                      roles: [...job.roles, { title: 'Process Engineer', locked: false, bullets: [{ text: '' }] }],
                    }
                  : job
              ),
            })
          }
          className="hover:text-amber-300"
        >
          + Process Engineer role
        </button>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              projects: [...draft.projects, { title: 'Project', bullets: [{ text: '' }] }],
            })
          }
          className="hover:text-amber-300"
        >
          + Project
        </button>
      </div>
      <AddBulletPanel draft={draft} onChange={onChange} hasRoom={emptyLines > 1} />
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ marginTop: '8pt' }}>
      <div style={{ borderTop: '1pt solid #888888', marginLeft: '3pt', marginRight: 0 }} />
      <p className="font-bold italic" style={{ color: '#4472C4', margin: '5pt 0 0' }}>
        {children}
      </p>
    </div>
  );
}

function JobBlock({
  job,
  onChange,
  onRemove,
}: {
  job: ResumeJob;
  onChange: (job: ResumeJob) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group/job">
      <div className="flex items-baseline gap-2">
        <AutoTextarea
          className="font-bold"
          value={companyLine(job)}
          onChange={(raw) => onChange({ ...job, ...parseCompanyLine(raw) })}
        />
        {onRemove && (
          <button type="button" onClick={onRemove} className="hidden text-[10px] text-red-600 group-hover/job:inline">
            Remove employer
          </button>
        )}
      </div>
      {job.roles.map((role, roleIndex) => (
        <div key={roleIndex} className="group/role relative">
          <div className="relative flex items-start">
            <AutoTextarea
              className="italic underline"
              value={role.title}
              onChange={(title) =>
                onChange({
                  ...job,
                  roles: job.roles.map((r, i) => (i === roleIndex ? { ...r, title } : r)),
                })
              }
            />
            {!role.locked && (
              <GhostButton onClick={() => onChange({ ...job, roles: job.roles.filter((_, i) => i !== roleIndex) })}>
                Remove role
              </GhostButton>
            )}
          </div>
          <BulletEditor
            bullets={role.bullets}
            onChange={(bullets) =>
              onChange({
                ...job,
                roles: job.roles.map((r, i) => (i === roleIndex ? { ...r, bullets } : r)),
              })
            }
          />
        </div>
      ))}
    </div>
  );
}

function ProjectBlock({
  project,
  onChange,
  onRemove,
}: {
  project: ResumeProject;
  onChange: (project: ResumeProject) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group/project relative">
      <div className="relative">
        <AutoTextarea
          className="italic underline"
          value={project.title}
          onChange={(title) => onChange({ ...project, title })}
        />
        <GhostButton onClick={onRemove}>Remove</GhostButton>
      </div>
      <BulletEditor bullets={project.bullets} onChange={(bullets) => onChange({ ...project, bullets })} />
    </div>
  );
}

export function useDebouncedDraftSave(
  sessionId: string,
  draft: ResumeDraft | null,
  save: (sessionId: string, draft: ResumeDraft) => Promise<unknown>
) {
  const [saving, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (!draft) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      startTransition(async () => {
        await save(sessionId, draft);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
      });
    }, 700);
    return () => window.clearTimeout(t);
  }, [draft, sessionId, save]);

  return { saving, saved };
}

function AddBulletPanel({
  draft,
  onChange,
  hasRoom,
}: {
  draft: ResumeDraft;
  onChange: (draft: ResumeDraft) => void;
  hasRoom: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const targets: { key: string; label: string; existing: string[]; add: (text: string) => void }[] = [];

  draft.experience.forEach((job, jobIndex) => {
    job.roles.forEach((role, roleIndex) => {
      const existing = role.bullets.map((b) => b.text);
      targets.push({
        key: `job-${jobIndex}-${roleIndex}`,
        label: role.title.trim() || 'Role',
        existing,
        add: (text) =>
          onChange(
            updateJob(draft, jobIndex, {
              ...job,
              roles: job.roles.map((r, i) =>
                i === roleIndex
                  ? { ...r, bullets: [...r.bullets, { text, cutFirst: true }] }
                  : r
              ),
            })
          ),
      });
    });
  });

  draft.projects.forEach((project, projectIndex) => {
    const existing = project.bullets.map((b) => b.text);
    targets.push({
      key: `project-${projectIndex}`,
      label: project.title.trim() || 'Project',
      existing,
      add: (text) =>
        onChange({
          ...draft,
          projects: draft.projects.map((p, i) =>
            i === projectIndex
              ? { ...p, bullets: [...p.bullets, { text, cutFirst: true }] }
              : p
          ),
        }),
    });
  });

  if (!targets.length) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <p className="text-xs font-medium text-zinc-300">Add a bullet</p>
      <p className="mt-1 text-xs text-zinc-500">
        {hasRoom
          ? 'There is room on the page. Pick a suggested line, or add a blank one and write your own.'
          : 'You can still add a line. If the page runs long, trim one bullet or shorten a wrapping line.'}
      </p>
      <div className="mt-3 space-y-2">
        {targets.map((target) => {
          const suggestions = suggestedBulletsFor(target.label, target.existing);
          const open = openKey === target.key;
          return (
            <div key={target.key} className="rounded-md border border-zinc-800 px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-xs text-zinc-200">{target.label}</span>
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : target.key)}
                  className="text-xs text-amber-400/90 hover:text-amber-300"
                >
                  {open ? 'Hide suggestions' : 'Add bullet'}
                </button>
              </div>
              {open ? (
                <ul className="mt-2 space-y-1.5">
                  {suggestions.map((text) => (
                    <li key={text}>
                      <button
                        type="button"
                        onClick={() => {
                          target.add(text);
                          setOpenKey(null);
                        }}
                        className="w-full rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1.5 text-left text-xs leading-relaxed text-zinc-300 hover:border-amber-500/40 hover:text-zinc-100"
                      >
                        {text}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        target.add('');
                        setOpenKey(null);
                      }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Blank bullet, I will write it
                    </button>
                  </li>
                  {suggestions.length === 0 ? (
                    <li className="text-xs text-zinc-600">No unused suggestions left for this section.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { ResumeSkillGroup };
