import type { Job } from './queries';

export type InterestCategory = {
  id: string;
  label: string;
  keywords: string[];
};

/** Interest areas — matched against title, company, and description. */
export const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    id: 'sports',
    label: 'Sports',
    keywords: [
      'sports',
      'sporting',
      'athletic',
      'stadium',
      'arena',
      'league',
      'nba',
      'nfl',
      'mlb',
      'nhl',
      'mls',
      'soccer',
      'football',
      'basketball',
      'baseball',
      'hockey',
      'esports',
      'sporting goods',
      'sports media',
      'sports analytics',
      'athlete',
      'ticketing',
      'fan engagement',
      'ncaa',
      'sportsbook',
    ],
  },
  {
    id: 'architecture',
    label: 'Architecture',
    keywords: [
      'architect',
      'architecture',
      'architectural',
      'bim',
      'revit',
      'autocad',
      'built environment',
      'urban design',
      'landscape architect',
      'interior design',
      'construction design',
      'aia',
    ],
  },
  {
    id: 'ev',
    label: 'EV & Battery',
    keywords: [
      'electric vehicle',
      'ev charging',
      'battery',
      'lithium',
      'electrification',
      'bev',
      'phev',
      'ev fleet',
      'charging station',
      'energy storage',
      'cell manufacturing',
    ],
  },
  {
    id: 'automotive',
    label: 'Automotive',
    keywords: [
      'automotive',
      'automobile',
      'vehicle',
      'oem',
      'tier 1',
      'car manufacturer',
      'auto parts',
      'dealership',
      'mobility',
      'autonomous driving',
      'adas',
    ],
  },
  {
    id: 'solar',
    label: 'Solar',
    keywords: [
      'solar',
      'photovoltaic',
      'pv system',
      'solar panel',
      'solar farm',
      'solar energy',
      'renewable energy',
      'clean energy',
    ],
  },
  {
    id: 'hydro',
    label: 'Hydro',
    keywords: [
      'hydroelectric',
      'hydropower',
      'hydro power',
      'dam operator',
      'water power',
      ' pumped storage',
    ],
  },
  {
    id: 'geothermal',
    label: 'Geothermal',
    keywords: ['geothermal', 'ground source', 'heat pump', 'geothermal energy'],
  },
  {
    id: 'betting',
    label: 'Betting & Gaming',
    keywords: [
      'sportsbook',
      'sports betting',
      'gambling',
      'igaming',
      'casino',
      'wagering',
      'fantasy sports',
      'draftkings',
      'fanduel',
      'betting',
      'gaming operator',
    ],
  },
  {
    id: 'analytics',
    label: 'Data Analytics',
    keywords: [
      'data analyst',
      'data analytics',
      'data science',
      'business intelligence',
      'analytics',
      'bi analyst',
      'tableau',
      'power bi',
      'sql analyst',
      'insights analyst',
      'metrics',
      'reporting analyst',
    ],
  },
  {
    id: 'economics',
    label: 'Economics',
    keywords: [
      'economics',
      'economist',
      'economic',
      'economic analysis',
      'economic research',
      'economic policy',
      'economic development',
      'economic forecasting',
      'economic modeling',
      'economic consultant',
      'economic consulting',
      'econometrics',
      'microeconomics',
      'macroeconomics',
      'applied economics',
      'labor economics',
      'health economics',
      'public economics',
      'behavioral economics',
      'financial economics',
      'fiscal policy',
      'monetary policy',
      'market research economist',
      'policy economist',
      'economic advisor',
      'economic advisory',
    ],
  },
  {
    id: 'energy',
    label: 'Energy (general)',
    keywords: [
      'energy sector',
      'utility',
      'utilities',
      'power grid',
      'transmission',
      'renewables',
      'sustainability',
      'climate tech',
      'cleantech',
      'carbon',
    ],
  },
];

export const ALL_CATEGORY_IDS = INTEREST_CATEGORIES.map((c) => c.id);

const CATEGORY_BY_ID = new Map(INTEREST_CATEGORIES.map((c) => [c.id, c]));

export function getCategoryLabel(id: string): string {
  return CATEGORY_BY_ID.get(id)?.label ?? id;
}

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatches(haystack: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  if (kw.includes(' ')) return haystack.includes(kw);
  return new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(haystack);
}

export function jobHaystack(job: Pick<Job, 'title' | 'company' | 'description'>): string {
  return `${job.title} ${job.company ?? ''} ${job.description ?? ''}`.toLowerCase();
}

export function matchJobToCategories(
  job: Pick<Job, 'title' | 'company' | 'description'>,
  categoryIds: string[]
): string[] {
  if (!categoryIds.length) return [];

  const haystack = jobHaystack(job);
  const allowed = new Set(categoryIds);

  return INTEREST_CATEGORIES.filter(
    (cat) => allowed.has(cat.id) && cat.keywords.some((kw) => keywordMatches(haystack, kw))
  ).map((cat) => cat.id);
}

export function filterByCategories<T extends Job>(jobs: T[], categoryIds: string[]): T[] {
  if (!categoryIds.length) return jobs;
  return jobs.filter((job) => matchJobToCategories(job, categoryIds).length > 0);
}

const CATEGORY_DB_KEYWORD_CAP = 36;

function sanitizeIlikeToken(value: string): string {
  return value.replace(/[%_,]/g, ' ').trim();
}

/** Keywords for a coarse Postgres ilike filter (preferred tab). */
export function categoryDbKeywords(categoryIds: string[]): string[] {
  const keywords = new Set<string>();
  for (const id of categoryIds) {
    const cat = CATEGORY_BY_ID.get(id);
    if (!cat) continue;
    for (const kw of cat.keywords) {
      const token = sanitizeIlikeToken(kw);
      if (token.length >= 3) keywords.add(token);
      if (keywords.size >= CATEGORY_DB_KEYWORD_CAP) return [...keywords];
    }
  }
  return [...keywords];
}

export function parseCategoryIds(params: Record<string, string | string[] | undefined>): string[] {
  const raw = params.cat ?? params.cats;
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((v) => v.trim())
    .filter(Boolean);

  return [...new Set(values.filter((id) => CATEGORY_BY_ID.has(id)))];
}
