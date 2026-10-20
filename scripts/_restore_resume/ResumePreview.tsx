'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { ResumeDraft, ResumeJob, ResumeProject, ResumeSkillGroup } from '@/lib/resume-template';
import {
  LOCKED_EDUCATION,
  LOCKED_HEADER,
  LOCKED_KENNAMETAL,
  SECTION_TITLES,
} from '@/lib/resume-template';

type Props = {
  draft: ResumeDraft;
  onChange: (draft: ResumeDraft) => void;
  saving?: boolean;
  saved?: boolean;
};

const SHEET_IN = 11;

function AutoTextarea({
  value,
  onChange,
  className,
  placeholder,
  center,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  center?: boolean;
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
      className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-inherit outline-none ring-0 placeholder:text-neutral-400 focus:bg-amber-50/60 ${center ? 'text-center' : ''} ${className ?? ''}`}
    />
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
    <div className="space-y-0">
      {bullets.map((bullet, i) => (
        <div key={i} className="group flex items-start gap-1">
          <span className="mt-px w-[4.5pt] shrink-0">-</span>
          <AutoTextarea
            value={bullet.text}
            onChange={(text) => {
              const next = bullets.map((b, idx) => (idx === i ? { ...b, text } : b));
              onChange(next);
            }}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => onChange(bullets.filter((_, idx) => idx !== i))}
            className="mt-0.5 hidden text-[10px] text-neutral-400 group-hover:inline hover:text-red-600"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...bullets, { text: '', cutFirst: false }])}
        className="text-[10px] text-neutral-500 hover:text-neutral-800"
      >
        + Add bullet
      </button>
    </div>
  );
}

function updateJob(draft: ResumeDraft, jobIndex: number, job: ResumeJob): ResumeDraft {
  return { ...draft, experience: draft.experience.map((j, i) => (i === jobIndex ? job : j)) };
}

export function ResumePreview({ draft, onChange, saving, saved }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [overflowLines, setOverflowLines] = useState(0);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const pagePx = SHEET_IN * 96;
    const extra = Math.max(0, el.scrollHeight - pagePx);
    setOverflowLines(extra > 2 ? Math.ceil(extra / 13) : 0);
  }, [draft]);

  const contact = [
    LOCKED_HEADER.email,
    LOCKED_HEADER.phone,
    LOCKED_HEADER.linkedinLabel,
    LOCKED_HEADER.githubLabel,
    LOCKED_HEADER.siteLabel,
  ].join(' | ');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {overflowLines > 0 ? (
          <p className="rounded-md border border-amber-700/60 bg-amber-950/40 px-2.5 py-1 text-amber-200">
            About {overflowLines} line{overflowLines === 1 ? '' : 's'} over one page — shorten a wrapping bullet or remove the least relevant line.
          </p>
        ) : (
          <p className="rounded-md border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1 text-emerald-300">
            Fits on one page
          </p>
        )}
        {saving && <span className="text-zinc-500">Saving…</span>}
        {saved && !saving && <span className="text-emerald-400/80">Saved</span>}
        <span className="text-zinc-600">Click any body text to edit. Name, contact, and education stay locked.</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3">
        <div
          ref={sheetRef}
          className="mx-auto bg-white text-black shadow-xl"
          style={{
            width: '8.5in',
            minHeight: '11in',
            padding: '19.5pt 21pt 28pt 18pt',
            fontFamily: "Cambria, Caladea, 'Times New Roman', serif",
            fontSize: '11pt',
            lineHeight: '12.9pt',
            color: '#000',
          }}
        >
          <h1
            className="text-center font-bold"
            style={{ fontSize: '26pt', lineHeight: '29.4pt', color: '#4472C4', margin: 0 }}
          >
            {LOCKED_HEADER.name}
          </h1>
          <p className="text-center" style={{ margin: 0 }}>
            {LOCKED_HEADER.location}
          </p>
          <p className="text-center" style={{ margin: 0 }}>
            {contact}
          </p>

          <SectionTitle>{SECTION_TITLES.profile}</SectionTitle>
          <AutoTextarea
            value={draft.profile}
            onChange={(profile) => onChange({ ...draft, profile })}
            placeholder="Profile tailored to this job…"
          />

          <SectionTitle>{SECTION_TITLES.education}</SectionTitle>
          <p style={{ margin: 0 }}>
            <strong>{LOCKED_EDUCATION.schoolBold}</strong>
            {LOCKED_EDUCATION.schoolRest}
          </p>
          <p style={{ margin: 0 }}>
            <strong>{LOCKED_EDUCATION.degree}</strong>
          </p>
          <p style={{ margin: 0 }}>{LOCKED_EDUCATION.minors}</p>

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
            className="mt-1 text-[10px] text-neutral-500 hover:text-neutral-800"
          >
            + Add another employer (only if relevant)
          </button>

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
          <button
            type="button"
            onClick={() =>
              onChange({
                ...draft,
                projects: [...draft.projects, { title: 'Project', bullets: [{ text: '' }] }],
              })
            }
            className="text-[10px] text-neutral-500 hover:text-neutral-800"
          >
            + Add project
          </button>

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
                  const items = raw.split('|').map((s) => s.trim()).filter(Boolean);
                  const skills = draft.skills.map((g, idx) => (idx === i ? { ...g, items } : g));
                  onChange({ ...draft, skills });
                }}
              />
            </div>
          ))}
        </div>
      </div>
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
        {job.locked ? (
          <p style={{ margin: 0 }}>
            <strong>{LOCKED_KENNAMETAL.company}</strong>
            {LOCKED_KENNAMETAL.locationDates}
          </p>
        ) : (
          <div className="flex w-full gap-2">
            <AutoTextarea
              className="font-bold"
              value={job.company}
              onChange={(company) => onChange({ ...job, company })}
            />
            <AutoTextarea
              value={job.locationDates}
              onChange={(locationDates) => onChange({ ...job, locationDates })}
            />
          </div>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="hidden text-[10px] text-red-600 group-hover/job:inline">
            Remove employer
          </button>
        )}
      </div>
      {job.roles.map((role, roleIndex) => (
        <div key={roleIndex} className="group/role">
          {role.locked ? (
            <p className="italic underline" style={{ margin: 0 }}>
              {LOCKED_KENNAMETAL.channelRepTitle}
            </p>
          ) : (
            <div className="flex items-start gap-2">
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
              <button
                type="button"
                onClick={() => onChange({ ...job, roles: job.roles.filter((_, i) => i !== roleIndex) })}
                className="hidden text-[10px] text-red-600 group-hover/role:inline"
              >
                Remove role
              </button>
            </div>
          )}
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
      <button
        type="button"
        onClick={() =>
          onChange({
            ...job,
            roles: [...job.roles, { title: 'Process Engineer', locked: false, bullets: [{ text: '' }] }],
          })
        }
        className="text-[10px] text-neutral-500 hover:text-neutral-800"
      >
        + Add role under {job.company}
      </button>
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
    <div className="group/project">
      <div className="flex items-start gap-2">
        <AutoTextarea
          className="italic underline"
          value={project.title}
          onChange={(title) => onChange({ ...project, title })}
        />
        <button type="button" onClick={onRemove} className="hidden text-[10px] text-red-600 group-hover/project:inline">
          Remove
        </button>
      </div>
      <AutoTextarea
        className="italic"
        value={project.subtitle ?? ''}
        placeholder="Optional subtitle"
        onChange={(subtitle) => onChange({ ...project, subtitle: subtitle || undefined })}
      />
      <BulletEditor bullets={project.bullets} onChange={(bullets) => onChange({ ...project, bullets })} />
    </div>
  );
}

export function useDebouncedDraftSave(
  sessionId: string,
  draft: ResumeDraft | null,
  save: (sessionId: string, draft: ResumeDraft) => Promise<void>
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

export type { ResumeSkillGroup };
