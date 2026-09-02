'use client';

import { formatAnnualSalary } from '@/lib/salary';
import { buildBoardHref, formatPostedDate, RECENCY_OPTIONS, type JobFilters } from '@/lib/filters';
import { getCategoryLabel, matchJobToCategories } from '@/lib/categories';
import { descriptionPreview } from '@/lib/job-description';
import {
  APPLICATION_STAGES,
  STAGE_LABELS,
  type ApplicationStage,
} from '@/lib/applications';
import type { JobView, SortKey } from '@/lib/queries';
import { RemoveApplicationButton } from './RemoveApplicationButton';
import { DismissJobButton } from './DismissJobButton';
import { ApplicationStageSelect } from './ApplicationStageSelect';
import { FilterSidebar } from './FilterSidebar';
import { FitLevelBadge } from './FitLevelBadge';
import {
  InterviewPrepExpanded,
  InterviewPrepProvider,
  InterviewPrepTrigger,
} from './InterviewPrepPanel';
import { MarkAppliedButton } from './MarkAppliedButton';
import { Pagination } from './Pagination';
import type { StoredInterviewPrep } from '@/lib/interview-actions';
import { usePrioritySeen } from '@/lib/priority-seen';
import { prioritySourceMeta } from '@/lib/priority-jobs';
import { isStoredFollowUpContacts } from '@/lib/follow-up-utils';
import Link from 'next/link';
import { Fragment, Suspense } from 'react';
import { PersistBoardFilters } from './PersistBoardFilters';
import {
  FollowUpContactsExpanded,
  FollowUpContactsProvider,
  FollowUpContactsTrigger,
} from './FollowUpContactsPanel';

type BoardView = 'all' | 'preferred' | 'priority' | 'applied';

type Props = {
  jobs: JobView[];
  total: number;
  page: number;
  totalPages: number;
  view: BoardView;
  stage?: ApplicationStage;
  sort: string;
  q: string;
  filters: JobFilters;
  signedIn: boolean;
  priorityJobIds?: number[];
  organizations?: string[];
  locations?: string[];
};

const BOARD_VIEWS: { id: BoardView; label: string; signedInOnly?: boolean }[] = [
  { id: 'all', label: 'All jobs' },
  { id: 'preferred', label: 'Preferred' },
  { id: 'priority', label: 'Priority' },
  { id: 'applied', label: 'Applied', signedInOnly: true },
];

const SORT_OPTIONS = [
  { id: 'date' as const, label: 'Date' },
  { id: 'salary' as const, label: 'Salary' },
];

function isDateSort(sort: string) {
  return sort === 'date' || sort === 'date_asc' || sort === 'newest';
}

function isSalarySort(sort: string) {
  return sort === 'salary_high' || sort === 'salary_low';
}

function sortOptionLabel(option: 'date' | 'salary', sort: string) {
  if (option === 'date') {
    if (sort === 'date_asc') return 'Date · oldest';
    if (isDateSort(sort)) return 'Date · newest';
    return 'Date';
  }
  if (sort === 'salary_low') return 'Salary · low';
  if (sort === 'salary_high') return 'Salary · high';
  return 'Salary';
}

function nextSort(sort: string, option: 'date' | 'salary'): SortKey {
  if (option === 'date') {
    if (isDateSort(sort)) return sort === 'date_asc' ? 'date' : 'date_asc';
    return 'date';
  }
  if (isSalarySort(sort)) return sort === 'salary_high' ? 'salary_low' : 'salary_high';
  return 'salary_high';
}

function salaryDisplay(job: JobView) {
  const annual = formatAnnualSalary(job.salary_min_annual, job.salary_max_annual);
  return annual ?? job.salary ?? '—';
}

function parseStoredInterviewPrep(value: unknown): StoredInterviewPrep | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.overview !== 'string' || !Array.isArray(v.questions) || typeof v.generated_at !== 'string') {
    return null;
  }
  return value as StoredInterviewPrep;
}

function parseStoredFollowUpContacts(value: unknown) {
  return isStoredFollowUpContacts(value) ? value : null;
}

const FOLLOW_UP_STAGES: ApplicationStage[] = ['applied', 'interviewing', 'offered'];

export function JobBoard({
  jobs,
  total,
  page,
  totalPages,
  view,
  stage,
  sort,
  q,
  filters,
  signedIn,
  priorityJobIds = [],
  organizations = [],
  locations = [],
}: Props) {
  const pagePriorityIds = jobs.filter((j) => j.is_special && !j.isManual).map((j) => j.id);
  const { ready: seenReady, newCount, sessionUnseen } = usePrioritySeen(
    view,
    pagePriorityIds,
    priorityJobIds
  );

  function hrefFor(
    overrides: {
      view?: BoardView;
      stage?: ApplicationStage | '';
      sort?: string;
      q?: string;
      page?: number;
    } = {}
  ) {
    const pick = <T,>(key: keyof typeof overrides, fallback: T): T =>
      key in overrides ? (overrides[key] as T) : fallback;

    const nextView = pick('view', view);
    const nextStage = pick('stage', stage);

    return buildBoardHref(filters, {
      view: nextView,
      stage: nextView === 'applied' && nextStage ? nextStage : undefined,
      sort: pick('sort', sort),
      q: pick('q', q),
      page: overrides.page ?? page,
    });
  }

  const boardHref = hrefFor();
  const jobHref = (job: JobView) => {
    const from = encodeURIComponent(boardHref);
    if (job.isManual && job.manual_job_id) {
      return `/jobs/manual/${job.manual_job_id}?from=${from}`;
    }
    return `/jobs/${job.id}?from=${from}`;
  };

  const tailorHref = (job: JobView) =>
    job.isManual && job.manual_job_id
      ? `/tailor/manual/${job.manual_job_id}`
      : `/tailor/${job.id}`;

  return (
    <>
      <Suspense fallback={null}>
        <PersistBoardFilters />
      </Suspense>
      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <FilterSidebar filters={filters} view={view} stage={stage} sort={sort} q={q} />

      <div className="space-y-6">
        <form action="/" method="get" className="flex gap-2">
          <input type="hidden" name="view" value={view} />
          {view === 'applied' && stage && <input type="hidden" name="stage" value={stage} />}
          {sort !== 'date' && <input type="hidden" name="sort" value={sort} />}
          {filters.minSalary && <input type="hidden" name="min_salary" value={filters.minSalary} />}
          {filters.excludeNoSalary && <input type="hidden" name="exclude_no_salary" value="1" />}
          {filters.locations.map((loc) => (
            <input key={loc} type="hidden" name="location" value={loc} />
          ))}
          {filters.locationRadius && <input type="hidden" name="radius" value={filters.locationRadius} />}
          {filters.workType && <input type="hidden" name="work_type" value={filters.workType} />}
          {filters.recencyDays && (
            <input
              type="hidden"
              name="recency"
              value={RECENCY_OPTIONS.find((o) => o.days === filters.recencyDays)?.id ?? ''}
            />
          )}
          {filters.categories.map((cat) => (
            <input key={cat} type="hidden" name="cat" value={cat} />
          ))}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search title, company, description…"
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <button
            type="submit"
            className="rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
          >
            Search
          </button>
          {q && (
            <a
              href={hrefFor({ q: '', page: 1 })}
              className="flex items-center rounded-xl border border-zinc-700 px-3 text-sm text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </a>
          )}
        </form>

        <div className="flex flex-wrap gap-2">
          {BOARD_VIEWS.filter((v) => !v.signedInOnly || signedIn).map((v) => {
            const showNew = v.id === 'priority' && seenReady && newCount > 0;
            return (
              <a
                key={v.id}
                href={hrefFor({ view: v.id, stage: '', page: 1 })}
                aria-label={
                  v.id === 'priority' && showNew
                    ? `Priority, ${newCount} new ${newCount === 1 ? 'job' : 'jobs'}`
                    : v.label
                }
                className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  view === v.id
                    ? 'bg-amber-400 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {v.label}
                {showNew ? (
                  <span
                    className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                      view === v.id
                        ? 'bg-zinc-950 text-amber-300'
                        : 'bg-amber-400 text-zinc-950'
                    }`}
                  >
                    {newCount}
                  </span>
                ) : null}
              </a>
            );
          })}
        </div>

        {view === 'priority' && (organizations.length > 0 || locations.length > 0) && (
          <form action="/" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <input type="hidden" name="view" value="priority" />
            {sort !== 'date' && <input type="hidden" name="sort" value={sort} />}
            {q && <input type="hidden" name="q" value={q} />}
            {filters.recencyDays != null && (
              <input
                type="hidden"
                name="recency"
                value={RECENCY_OPTIONS.find((o) => o.days === filters.recencyDays)?.id ?? ''}
              />
            )}
            {organizations.length > 0 && (
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Organization</span>
                <select
                  name="org"
                  defaultValue={filters.priorityOrg ?? ''}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="">All organizations</option>
                  {organizations.map((org) => (
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {locations.length > 0 && (
              <label className="text-sm">
                <span className="mb-1 block text-zinc-500">Location</span>
                <select
                  name="place"
                  defaultValue={filters.priorityPlace ?? ''}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="">All locations</option>
                  {locations.map((place) => (
                    <option key={place} value={place}>
                      {place}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="submit"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"
            >
              Filter
            </button>
            {(filters.priorityOrg || filters.priorityPlace) && (
              <a
                href={buildBoardHref(
                  { ...filters, priorityOrg: undefined, priorityPlace: undefined },
                  { view: 'priority', sort, q }
                )}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300"
              >
                Clear
              </a>
            )}
          </form>
        )}

        {signedIn && view === 'applied' && (
          <div className="flex flex-wrap gap-2">
            <a
              href={hrefFor({ stage: '', page: 1 })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                !stage ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All stages
            </a>
            {APPLICATION_STAGES.map((s) => (
              <a
                key={s}
                href={hrefFor({ stage: s, page: 1 })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  stage === s ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {STAGE_LABELS[s]}
              </a>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          <span>Sort by</span>
          {SORT_OPTIONS.map((s) => {
            const active = s.id === 'date' ? isDateSort(sort) : isSalarySort(sort);
            return (
              <a
                key={s.id}
                href={hrefFor({ sort: nextSort(sort, s.id), page: 1 })}
                className={`rounded px-2 py-0.5 ${
                  active ? 'text-amber-300 underline' : 'hover:text-zinc-300'
                }`}
              >
                {sortOptionLabel(s.id, sort)}
              </a>
            );
          })}
          <span className="ml-auto">
            {total} jobs{totalPages > 1 ? ` · showing ${jobs.length} on this page` : ''}
          </span>
        </div>

        {view === 'preferred' && (
          <p className="text-sm text-zinc-500">
            Jobs matching your interest areas (sports, economics, energy, analytics, and related fields). Narrow
            categories in the sidebar, or combine with location and salary filters.
          </p>
        )}

        {view === 'priority' && (
          <p className="text-sm text-zinc-500">
            Watched / priority roles only — kept off All jobs. The badge counts jobs you haven&apos;t
            scrolled onto yet; open each page to mark that page as seen (clicking the tab once won&apos;t
            clear hundreds of jobs).
          </p>
        )}

        {view === 'all' && (
          <p className="text-sm text-zinc-500">
            Showing every scraped job in your selected timeline (priority watched roles live under Priority).
            {signedIn
              ? ' Jobs you mark as applied move to the Applied tab.'
              : q
                ? ' Search narrows results by keyword.'
                : ' Use the search box above to narrow by keyword.'}
          </p>
        )}

        {view === 'applied' && (
          <p className="text-sm text-zinc-500">
            Jobs you&apos;ve applied to. Update the stage as you hear back — applied, interviewing,
            rejected, or offered. Jobs in the interviewing stage show a prep button below the stage
            dropdown.
          </p>
        )}

        {!signedIn && (
          <p className="text-sm text-zinc-500">
            <a href="/sign-in" className="text-amber-400 hover:underline">
              Sign in
            </a>{' '}
            to tailor resumes, track applications, and manage digest email preferences.
          </p>
        )}

        <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
          {jobs.length === 0 ? (
            <p className="p-8 text-center text-zinc-500">
              {view === 'applied'
                ? stage
                  ? `No jobs in "${STAGE_LABELS[stage]}" yet.`
                  : 'No applied jobs yet. Mark a job after you submit an application.'
                : view === 'preferred'
                  ? 'No jobs match your selected interest areas. Try enabling more categories or loosening other filters.'
                  : view === 'priority'
                    ? filters.priorityOrg || filters.priorityPlace || q
                      ? 'No priority jobs match these filters. Clear organization, location, or search and try again.'
                      : 'No priority jobs yet. Roles tagged as watched show up here, newest first.'
                  : q
                  ? `No jobs matching "${q}". Try a broader keyword or loosen your filters.`
                  : 'No jobs in this view yet. Run the scraper or check back after the next daily pull.'}
            </p>
          ) : (
            jobs
              .filter((job) => view === 'priority' || view === 'preferred' || !job.is_special)
              .map((job) => {
              const matchedCategories =
                view === 'preferred' ? matchJobToCategories(job, filters.categories) : [];
              const cardKey = job.isManual ? job.manual_job_id! : String(job.id);
              const showInterviewPrep =
                signedIn && view === 'applied' && job.application_stage === 'interviewing';
              const showFollowUpContacts =
                signedIn &&
                view === 'applied' &&
                !!job.application_stage &&
                FOLLOW_UP_STAGES.includes(job.application_stage);
              const isNew = view === 'priority' && sessionUnseen.has(job.id);
              const priorityMeta =
                view === 'priority' ? prioritySourceMeta(job.source, job.company) : null;

              const article = (
              <article
                className={`p-5 transition hover:bg-zinc-900 ${
                  isNew ? 'border-l-2 border-l-amber-400 bg-amber-400/[0.04]' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isNew ? (
                        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-950">
                          New
                        </span>
                      ) : null}
                      <Link
                        href={jobHref(job)}
                        className="text-lg font-semibold text-zinc-50 hover:text-amber-300"
                      >
                        {job.title}
                      </Link>
                      {job.is_special && view !== 'priority' && (
                        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                          Priority
                        </span>
                      )}
                      {job.fit_level && (
                        <FitLevelBadge
                          fitLevel={job.fit_level}
                          fitScore={job.fit_score}
                          estimated={job.fit_estimated}
                        />
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-zinc-300">
                      {job.company ?? priorityMeta?.label ?? 'Unknown company'}
                      <span className="mx-2 text-zinc-600">·</span>
                      <span className="text-amber-400/90">
                        {view === 'applied' && job.applied_at
                          ? `Applied ${formatPostedDate(job.applied_at, job.applied_at)}`
                          : `Posted ${formatPostedDate(job.posted_at, job.created_at)}`}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      {job.location ?? 'Location n/a'} · {job.source}
                    </p>
                    {matchedCategories.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {matchedCategories.map((catId) => (
                          <span
                            key={catId}
                            className="rounded-full bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300"
                          >
                            {getCategoryLabel(catId)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm text-emerald-400">{salaryDisplay(job)}</div>
                    {signedIn && (view === 'all' || view === 'preferred' || view === 'priority') && (
                      <div className="mt-2 flex flex-col items-end gap-1">
                        {view === 'priority' && priorityMeta && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-zinc-400 hover:text-amber-300"
                          >
                            {priorityMeta.externalCta}
                          </a>
                        )}
                        <a
                          href={tailorHref(job)}
                          className="text-xs font-medium text-amber-400 hover:text-amber-300"
                        >
                          Tailor resume →
                        </a>
                        {job.isManual ? (
                          <MarkAppliedButton manualJobId={job.manual_job_id} />
                        ) : (
                          <MarkAppliedButton jobId={job.id} />
                        )}
                        {job.isManual ? (
                          <DismissJobButton manualJobId={job.manual_job_id} />
                        ) : (
                          <DismissJobButton jobId={job.id} />
                        )}
                      </div>
                    )}
                    {signedIn && view === 'applied' && job.application_stage && (
                      <div className="mt-2 flex flex-col items-end gap-2">
                        <ApplicationStageSelect
                          jobId={job.isManual ? undefined : job.id}
                          manualJobId={job.manual_job_id}
                          stage={job.application_stage}
                          compact
                        />
                        <a
                          href={tailorHref(job)}
                          className="text-xs font-medium text-amber-400 hover:text-amber-300"
                        >
                          View resume & cover letter →
                        </a>
                        {showFollowUpContacts && <FollowUpContactsTrigger variant="sidebar" />}
                        {job.application_stage === 'interviewing' && (
                          <InterviewPrepTrigger variant="sidebar" />
                        )}
                        <RemoveApplicationButton
                          jobId={job.isManual ? undefined : job.id}
                          manualJobId={job.manual_job_id}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {job.description && (() => {
                  const preview = descriptionPreview(job.description);
                  if (!preview) return null;
                  return (
                    <Link
                      href={jobHref(job)}
                      className="mt-3 block line-clamp-2 text-sm text-zinc-500 hover:text-zinc-400"
                    >
                      {preview}
                    </Link>
                  );
                })()}
                {showFollowUpContacts && <FollowUpContactsExpanded variant="sidebar" />}
                {showInterviewPrep && <InterviewPrepExpanded variant="sidebar" />}
              </article>
              );

              let wrapped = article;
              if (showInterviewPrep) {
                wrapped = (
                  <InterviewPrepProvider
                    jobId={job.isManual ? undefined : job.id}
                    manualJobId={job.manual_job_id}
                    initialPrep={parseStoredInterviewPrep(job.interview_prep)}
                  >
                    {wrapped}
                  </InterviewPrepProvider>
                );
              }
              if (showFollowUpContacts) {
                wrapped = (
                  <FollowUpContactsProvider
                    jobId={job.isManual ? undefined : job.id}
                    manualJobId={job.manual_job_id}
                    companyName={job.company}
                    initialContacts={parseStoredFollowUpContacts(job.follow_up_contacts)}
                  >
                    {wrapped}
                  </FollowUpContactsProvider>
                );
              }

              return <Fragment key={cardKey}>{wrapped}</Fragment>;
            })
          )}
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          hrefForPage={(p) => hrefFor({ page: p })}
        />
      </div>
    </div>
    </>
  );
}
