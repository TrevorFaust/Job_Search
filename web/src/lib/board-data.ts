import { getAllJobs, getPriorityJobIds, getSubscriberByToken, normalizeSortKey, type JobView, type SortKey } from './queries';
import {
  getAppliedJobExclusions,
  getAppliedJobs,
  getDismissedJobExclusions,
  mergeJobBoardExclusions,
  normalizeApplicationStage,
  type ApplicationStage,
} from './applications';
import { parseJobFilters, type JobFilters } from './filters';
import { ALL_CATEGORY_IDS } from './categories';
import type { Subscriber } from './queries';

export type BoardView = 'all' | 'preferred' | 'priority' | 'applied';

export type BoardPayload = {
  jobs: JobView[];
  total: number;
  page: number;
  totalPages: number;
  view: BoardView;
  stage?: ApplicationStage;
  sort: SortKey;
  q: string;
  filters: JobFilters;
  signedIn: boolean;
  priorityJobIds: number[];
  organizations: string[];
  locations: string[];
};

export function normalizeBoardView(value: string | undefined): BoardView {
  if (value === 'applied') return 'applied';
  if (value === 'preferred') return 'preferred';
  if (value === 'priority') return 'priority';
  return 'all';
}

export function searchParamsToRecord(searchParams: URLSearchParams): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    record[key] = values.length === 1 ? values[0]! : values;
  }
  return record;
}

export async function fetchBoardPayload(
  params: Record<string, string | string[] | undefined>,
  subscriber: Subscriber | null
): Promise<BoardPayload> {
  const signedIn = !!subscriber;
  const view = normalizeBoardView(typeof params.view === 'string' ? params.view : undefined);
  const stage = normalizeApplicationStage(typeof params.stage === 'string' ? params.stage : undefined);
  const sort = normalizeSortKey(typeof params.sort === 'string' ? params.sort : 'date');
  const q = typeof params.q === 'string' ? params.q : '';
  const page = typeof params.page === 'string' ? Math.max(1, Number(params.page) || 1) : 1;
  const filters = parseJobFilters(params);

  if (view === 'preferred' && !filters.categories.length) {
    filters.categories = ALL_CATEGORY_IDS;
  }

  if (view === 'applied' && !signedIn) {
    throw new Error('Sign in required for applied jobs');
  }

  const boardExclusions = signedIn
    ? mergeJobBoardExclusions(
        await getAppliedJobExclusions(subscriber!.id),
        await getDismissedJobExclusions(subscriber!.id)
      )
    : undefined;

  const [result, priorityJobIds] = await Promise.all([
    view === 'applied'
      ? getAppliedJobs(subscriber!.id, sort, page, q, filters, stage)
      : getAllJobs(
          sort,
          page,
          q,
          filters,
          boardExclusions?.scrapedIds,
          subscriber?.id,
          boardExclusions?.manualIds,
          view === 'priority'
            ? { specialOnly: true }
            : view === 'all'
              ? { excludeSpecial: true }
              : undefined
        ),
    getPriorityJobIds(),
  ]);

  return {
    ...result,
    view,
    stage,
    sort,
    q,
    filters,
    signedIn,
    priorityJobIds,
    organizations: result.organizations ?? [],
    locations: result.locations ?? [],
  };
}

export async function fetchBoardPayloadFromToken(
  params: Record<string, string | string[] | undefined>,
  token?: string
): Promise<BoardPayload> {
  const subscriber = token ? await getSubscriberByToken(token) : null;
  return fetchBoardPayload(params, subscriber);
}
