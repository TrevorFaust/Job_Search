export type WebSearchResult = {
  title: string;
  link: string;
  snippet: string;
};

export type WebSearchResponse = {
  query: string;
  results: WebSearchResult[];
};

const SERPER_URL = 'https://google.serper.dev/search';
const DEFAULT_RESULT_COUNT = 10;
const SEARCH_TIMEOUT_MS = 12_000;

function getSerperKey() {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      'SERPER_API_KEY is not configured. Get a free key at https://serper.dev and add it to web/.env.local'
    );
  }
  return key;
}

/** Strip operators Serper free tier rejects (site:, -term, OR, quoted @domains). */
export function simplifyQueryForFreeTier(query: string): string {
  return query
    .replace(/\bsite:\S+/gi, '')
    .replace(/\B@[\w.-]+\.\w+/g, '')
    .replace(/\s+-[\w"]+/g, '')
    .replace(/"([^"]+)"/g, '$1')
    .replace(/\s+\bOR\b\s+/gi, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFreeTierPatternError(message: string): boolean {
  return /query pattern not allowed|not allowed for free/i.test(message);
}

export async function searchWeb(query: string, num = DEFAULT_RESULT_COUNT): Promise<WebSearchResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(SERPER_URL, {
      method: 'POST',
      headers: {
        'X-API-KEY': getSerperKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Web search failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    const data = (await response.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };

    const results: WebSearchResult[] = (data.organic ?? [])
      .map((item) => ({
        title: (item.title ?? '').trim(),
        link: (item.link ?? '').trim(),
        snippet: (item.snippet ?? '').trim(),
      }))
      .filter((item) => item.title && item.link);

    return { query, results };
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWebWithFallback(query: string, num: number): Promise<WebSearchResponse | null> {
  try {
    return await searchWeb(query, num);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isFreeTierPatternError(message)) throw error;

    const simplified = simplifyQueryForFreeTier(query);
    if (!simplified || simplified === query) return null;

    try {
      return await searchWeb(simplified, num);
    } catch (retryError) {
      const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
      if (isFreeTierPatternError(retryMessage)) return null;
      throw retryError;
    }
  }
}

export async function searchWebBatch(
  queries: string[],
  num = DEFAULT_RESULT_COUNT
): Promise<WebSearchResponse[]> {
  const unique = [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
  const responses: WebSearchResponse[] = [];

  for (const query of unique) {
    const result = await searchWebWithFallback(query, num);
    if (result) responses.push(result);
  }

  if (!responses.length) {
    throw new Error(
      'Web search returned no results. Serper free accounts limit query syntax — try again or upgrade at serper.dev.'
    );
  }

  return responses;
}

export function formatSearchResultsForLlm(searches: WebSearchResponse[]): string {
  return searches
    .map((search) => {
      const lines = search.results.slice(0, 10).map((r, i) => {
        return `${i + 1}. ${r.title}\n   URL: ${r.link}\n   ${r.snippet}`;
      });
      return `Query: ${search.query}\n${lines.join('\n') || '(no results)'}`;
    })
    .join('\n\n---\n\n');
}
