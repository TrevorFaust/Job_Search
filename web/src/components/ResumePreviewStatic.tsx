'use client';

import { memo, type CSSProperties } from 'react';
import type { ResumeDraft, ResumeJob, ResumeProject } from '@/lib/resume-template';
import {
  BOTTOM_MARGIN,
  companyLine,
  defaultResumeEducation,
  defaultResumeHeader,
  educationLine,
  SECTION_TITLES,
  TOP_NAME_Y,
} from '@/lib/resume-template';

type Props = {
  draft: ResumeDraft;
};

const sheetStyle = {
  width: '8.5in',
  padding: `${TOP_NAME_Y}pt 21pt ${BOTTOM_MARGIN}pt 18pt`,
  fontFamily: "Cambria, Caladea, 'Times New Roman', serif",
  fontSize: '11pt',
  lineHeight: '12.9pt',
  color: '#000',
} as const;

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

function StaticLine({
  children,
  center,
  className,
  style,
}: {
  children: string;
  center?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (!children.trim()) return null;
  return (
    <p className={`whitespace-pre-wrap ${center ? 'text-center' : ''} ${className ?? ''}`} style={style}>
      {children}
    </p>
  );
}

function JobBlockReadOnly({ job }: { job: ResumeJob }) {
  return (
    <div>
      <StaticLine className="font-bold">{companyLine(job)}</StaticLine>
      {job.roles.map((role, roleIndex) => (
        <div key={roleIndex}>
          {role.title.trim() ? (
            <StaticLine className="italic underline">{role.title}</StaticLine>
          ) : null}
          {role.bullets.map((bullet, bulletIndex) =>
            bullet.text.trim() ? (
              <p key={bulletIndex} className="flex items-start gap-0">
                <span className="w-[11pt] shrink-0">- </span>
                <span className="flex-1 whitespace-pre-wrap">{bullet.text}</span>
              </p>
            ) : null
          )}
        </div>
      ))}
    </div>
  );
}

function ProjectBlockReadOnly({ project }: { project: ResumeProject }) {
  return (
    <div>
      <StaticLine className="italic underline">{project.title}</StaticLine>
      {project.subtitle?.trim() ? <StaticLine>{project.subtitle}</StaticLine> : null}
      {project.bullets.map((bullet, bulletIndex) =>
        bullet.text.trim() ? (
          <p key={bulletIndex} className="flex items-start gap-0">
            <span className="w-[11pt] shrink-0">- </span>
            <span className="flex-1 whitespace-pre-wrap">{bullet.text}</span>
          </p>
        ) : null
      )}
    </div>
  );
}

function ResumePreviewStaticInner({ draft }: Props) {
  const header = draft.header ?? defaultResumeHeader();
  const education = draft.education ?? defaultResumeEducation();

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3 overflow-x-auto">
      <div className="mx-auto bg-white text-black shadow-xl" style={sheetStyle}>
        <div
          style={{
            border: '1pt solid #4472C4',
            margin: '-6pt -8pt 0 -4pt',
            padding: '2pt 0 3pt',
          }}
        >
          <StaticLine
            center
            className="font-bold"
            style={{ fontSize: '26pt', lineHeight: '29.4pt', color: '#4472C4' }}
          >
            {header.name}
          </StaticLine>
        </div>
        <StaticLine center>{header.location}</StaticLine>
        <StaticLine center>{header.contact}</StaticLine>

        <SectionTitle>{SECTION_TITLES.profile}</SectionTitle>
        <StaticLine>{draft.profile}</StaticLine>

        <SectionTitle>{SECTION_TITLES.education}</SectionTitle>
        <StaticLine>{educationLine(education)}</StaticLine>
        <StaticLine className="font-bold">{education.degree}</StaticLine>
        <StaticLine>{education.minors}</StaticLine>

        <SectionTitle>{SECTION_TITLES.experience}</SectionTitle>
        {draft.experience.map((job, jobIndex) => (
          <JobBlockReadOnly key={`${job.company}-${jobIndex}`} job={job} />
        ))}

        <SectionTitle>{SECTION_TITLES.projects}</SectionTitle>
        {draft.projects.map((project, projectIndex) => (
          <ProjectBlockReadOnly key={projectIndex} project={project} />
        ))}

        <SectionTitle>{SECTION_TITLES.skills}</SectionTitle>
        {draft.skills.map((group, groupIndex) => (
          <div key={groupIndex} className={groupIndex > 0 ? 'mt-[12.9pt]' : ''}>
            <StaticLine center className="italic">
              {group.heading}
            </StaticLine>
            <StaticLine center>{group.items.join(' | ')}</StaticLine>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ResumePreviewStatic = memo(ResumePreviewStaticInner);
