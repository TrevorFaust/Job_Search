'use client';

import {
  RECENCY_OPTIONS,
  WORK_TYPE_OPTIONS,
  type JobFilters,
} from '@/lib/filters';
import { ALL_CATEGORY_IDS, INTEREST_CATEGORIES } from '@/lib/categories';
import { LocationInput } from './LocationInput';
import { ResetBoardFiltersLink } from './PersistBoardFilters';

type Props = {
  filters: JobFilters;
  view: string;
  stage?: string;
  sort: string;
  q: string;
  preferredCategories?: string[];
};

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink shadow-sm transition hover:border-brand/40';

export function FilterSidebar({ filters, view, stage, sort, q, preferredCategories }: Props) {
  const recencyValue =
    RECENCY_OPTIONS.find((o) => o.days === filters.recencyDays)?.id ?? '';

  const activeCategories =
    filters.categories.length > 0
      ? filters.categories
      : view === 'preferred'
        ? preferredCategories?.length
          ? preferredCategories
          : ALL_CATEGORY_IDS
        : [];

  return (
    <aside className="rounded-2xl border border-line border-t-2 border-t-brand bg-sheet p-4 shadow-[0_1px_0_rgb(26_28_24/0.04),0_16px_36px_-24px_rgb(26_28_24/0.45)] sm:p-5">
      <form action="/" method="get" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-brand">
            <span className="h-px w-5 bg-brand" aria-hidden />
            Filters
          </h2>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-paper shadow-sm transition hover:bg-brand-soft"
            >
              Apply
            </button>
            <ResetBoardFiltersLink className="flex items-center rounded-full border border-line px-3.5 py-2 text-sm text-ink-faint transition hover:border-ink/25 hover:text-ink">
              Reset
            </ResetBoardFiltersLink>
          </div>
        </div>
        <input type="hidden" name="view" value={view} />
        {view === 'applied' && stage && <input type="hidden" name="stage" value={stage} />}
        {sort !== 'date' && <input type="hidden" name="sort" value={sort} />}
        {q && <input type="hidden" name="q" value={q} />}
        {view === 'priority' && filters.priorityOrg && (
          <input type="hidden" name="org" value={filters.priorityOrg} />
        )}
        {view === 'priority' && filters.priorityPlace && (
          <input type="hidden" name="place" value={filters.priorityPlace} />
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="block text-sm">
            <span className="text-ink-soft">Posted within</span>
            <select name="recency" defaultValue={recencyValue} className={fieldClass}>
              {RECENCY_OPTIONS.map((o) => (
                <option key={o.id || 'any'} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-ink-soft">Min salary ($/year)</span>
            <input
              name="min_salary"
              type="number"
              step="1000"
              min="0"
              defaultValue={filters.minSalary ?? ''}
              placeholder="e.g. 60000"
              className={fieldClass}
            />
          </label>

          <div className="block text-sm sm:col-span-2 xl:col-span-2">
            <span className="text-ink-soft">Location</span>
            <div className="mt-1.5">
              <LocationInput
                key={filters.locations.join('|') || 'no-location'}
                name="location"
                defaultValues={filters.locations}
              />
            </div>
          </div>

          <label className="block text-sm">
            <span className="text-ink-soft">Within (miles)</span>
            <input
              name="radius"
              type="number"
              min="1"
              max="500"
              defaultValue={filters.locationRadius ?? 50}
              placeholder="50"
              className={fieldClass}
            />
          </label>

          <label className="block text-sm">
            <span className="text-ink-soft">Work type</span>
            <select name="work_type" defaultValue={filters.workType ?? ''} className={fieldClass}>
              {WORK_TYPE_OPTIONS.map((o) => (
                <option key={o.id || 'any'} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="exclude_no_salary"
            value="1"
            defaultChecked={filters.excludeNoSalary}
            className="size-4 rounded border-line"
          />
          Exclude jobs without salary
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm text-ink-soft">
            Interest areas
            <span className="ml-2 text-xs text-ink-faint">
              Used on the Preferred tab. Saved defaults live in Profile.
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {INTEREST_CATEGORIES.map((cat) => (
              <label
                key={cat.id}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink-soft has-[:checked]:border-brand has-[:checked]:bg-brand/10 has-[:checked]:text-ink"
              >
                <input
                  type="checkbox"
                  name="cat"
                  value={cat.id}
                  defaultChecked={activeCategories.includes(cat.id)}
                  className="size-4 rounded border-line"
                />
                {cat.label}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </aside>
  );
}
