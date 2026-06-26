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
};

const selectClass =
  'mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100';

export function FilterSidebar({ filters, view, stage, sort, q }: Props) {
  const recencyValue =
    RECENCY_OPTIONS.find((o) => o.days === filters.recencyDays)?.id ?? '';

  const activeCategories =
    filters.categories.length > 0
      ? filters.categories
      : view === 'preferred'
        ? ALL_CATEGORY_IDS
        : [];

  return (
    <aside className="space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 lg:sticky lg:top-6 lg:self-start">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Filters</h2>
      <form action="/" method="get" className="space-y-4">
        {view !== 'all' && <input type="hidden" name="view" value={view} />}
        {view === 'applied' && stage && <input type="hidden" name="stage" value={stage} />}
        {sort !== 'date' && <input type="hidden" name="sort" value={sort} />}
        {q && <input type="hidden" name="q" value={q} />}

        <label className="block text-sm">
          <span className="text-zinc-400">Posted within</span>
          <select name="recency" defaultValue={recencyValue} className={selectClass}>
            {RECENCY_OPTIONS.map((o) => (
              <option key={o.id || 'any'} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-zinc-400">Min salary ($/year)</span>
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

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="exclude_no_salary"
            value="1"
            defaultChecked={filters.excludeNoSalary}
            className="rounded border-zinc-600"
          />
          Exclude jobs without salary
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm text-zinc-400">Interest areas</legend>
          <p className="text-xs text-zinc-600">
            Used on the Preferred tab. Leave all checked for the widest match.
          </p>
          <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-zinc-800 p-2">
            {INTEREST_CATEGORIES.map((cat) => (
              <label key={cat.id} className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  name="cat"
                  value={cat.id}
                  defaultChecked={activeCategories.includes(cat.id)}
                  className="rounded border-zinc-600"
                />
                {cat.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label className="block text-sm text-zinc-400">Location</label>
          <LocationInput
            key={filters.locations.join('|') || 'no-location'}
            name="location"
            defaultValues={filters.locations}
          />
          <label className="block text-sm">
            <span className="text-zinc-400">Within (miles)</span>
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
          <span className="text-zinc-400">Work type</span>
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
            className="flex-1 rounded-lg bg-amber-400 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
          >
            Apply
          </button>
          <ResetBoardFiltersLink
            className="flex items-center rounded-lg border border-zinc-700 px-3 text-sm text-zinc-500 hover:text-zinc-300"
          >
            Reset
          </ResetBoardFiltersLink>
        </div>
      </form>
    </aside>
  );
}
