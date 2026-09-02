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
import Link from 'next/link';
import { Suspense } from 'react';
import { PersistBoardFilters } from './PersistBoardFilters';

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
}: Props) {
  const pagePriorityIds = jobs.filter((j) => j.is_special && !j.isManual).map((j) => j.id);
  const { newCount } = usePrioritySeen(view, pagePriorityIds, priorityJobIds);

  function hrefFor(
    overrides: { view?: BoardView; stage?: ApplicationStage | ''; sort?: string; q?: string; page?: number } = {}
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
          {BOARD_VIEWS.filter((v) => !v.signedInOnly || signedIn).map((v) => (
            <a
              key={v.id}
              href={hrefFor({ view: v.id, stage: '', page: 1 })}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                view === v.id
                  ? 'bg-amber-400 text-zinc-950'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {v.label}
              {v.id === 'priority' && newCount > 0 && view !== 'priority' ? (
                <span className="ml-1.5 rounded-full bg-amber-300/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                  {newCount} new
                </span>
              ) : null}
            </a>
          ))}
        </div>

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
            Watched / priority roles only. These stay off the All jobs tab so they don&apos;t clog the main feed.
            Opening this tab marks currently listed roles as seen.
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
                    ? q
                      ? 'No priority jobs match this search. Clear search and try again.'
                      : 'No priority jobs yet. Roles tagged as watched show up here once the scraper finds them.'
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

              const article = (
              <article key={cardKey} className="p-5 transition hover:bg-zinc-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={jobHref(job)}
                        className="text-lg font-semibold text-zinc-50 hover:text-amber-300"
                      >
                        {job.title}
                      </Link>
                      {job.is_special && (
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
                      {job.company ?? 'Unknown company'}
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
                {showInterviewPrep && <InterviewPrepExpanded variant="sidebar" />}
              </article>
              );

              return showInterviewPrep ? (
                <InterviewPrepProvider
                  key={cardKey}
                  jobId={job.isManual ? undefined : job.id}
                  manualJobId={job.manual_job_id}
                  initialPrep={parseStoredInterviewPrep(job.interview_prep)}
                >
                  {article}
                </InterviewPrepProvider>
              ) : (
                article
              );
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
