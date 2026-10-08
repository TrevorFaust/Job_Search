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

const selectClass =
  'mt-1.5 w-full rounded-xl border border-line bg-sheet px-3 py-2.5 text-sm text-ink shadow-sm transition hover:border-brand/40';

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
    <aside className="space-y-5 rounded-2xl border border-line border-t-2 border-t-brand bg-sheet p-5 shadow-[0_1px_0_rgb(26_28_24/0.04),0_16px_36px_-24px_rgb(26_28_24/0.45)] lg:sticky lg:top-24 lg:self-start">
      <h2 className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-brand">
        <span className="h-px w-5 bg-brand" aria-hidden />
        Filters
      </h2>
      <form action="/" method="get" className="space-y-4">
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

        <label className="block text-sm">
          <span className="text-ink-soft">Posted within</span>
          <select name="recency" defaultValue={recencyValue} className={selectClass}>
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
            className={selectClass}
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            name="exclude_no_salary"
            value="1"
            defaultChecked={filters.excludeNoSalary}
            className="rounded border-line"
          />
          Exclude jobs without salary
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm text-ink-soft">Interest areas</legend>
          <p className="text-xs text-ink-faint">
            Used on the Preferred tab. Your saved defaults live in Profile; these checkboxes narrow this search.
          </p>
          <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-paper/70 p-2">
            {INTEREST_CATEGORIES.map((cat) => (
              <label key={cat.id} className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  name="cat"
                  value={cat.id}
                  defaultChecked={activeCategories.includes(cat.id)}
                  className="rounded border-line"
                />
                {cat.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label className="block text-sm text-ink-soft">Location</label>
          <LocationInput
            key={filters.locations.join('|') || 'no-location'}
            name="location"
            defaultValues={filters.locations}
          />
          <label className="block text-sm">
            <span className="text-ink-soft">Within (miles)</span>
            <input
              name="radius"
              type="number"
              min="1"
              max="500"
              defaultValue={filters.locationRadius ?? 50}
              placeholder="50"
              className={selectClass}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-ink-soft">Work type</span>
          <select name="work_type" defaultValue={filters.workType ?? ''} className={selectClass}>
            {WORK_TYPE_OPTIONS.map((o) => (
              <option key={o.id || 'any'} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-full bg-brand py-2.5 text-sm font-semibold text-paper shadow-sm transition hover:bg-brand-soft"
          >
            Apply
          </button>
          <ResetBoardFiltersLink
            className="flex items-center rounded-full border border-line px-3.5 text-sm text-ink-faint transition hover:border-ink/25 hover:text-ink"
          >
            Reset
          </ResetBoardFiltersLink>
        </div>
      </form>
    </aside>
  );
}
