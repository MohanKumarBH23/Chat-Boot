import { UpstreamServiceError } from '../../security/errors.js';
import { isValidHttpUrl, sanitizeText } from '../../security/validation.js';
import { ISearchClient, SearchResult } from '../../types/index.js';

const TRACKING_PARAMS = new Set(['ref', 'source', 'fbclid']);
const SEARCH_TIMEOUT_MS = 8000;

/**
 * Normalizes a URL and strips tracking parameters, hashes, and trailing slashes.
 */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = '';
    const paramsToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) {
        paramsToDelete.push(key);
      }
    });
    for (const key of paramsToDelete) {
      parsed.searchParams.delete(key);
    }
    let result = parsed.origin + parsed.pathname;
    if (result.endsWith('/') && result.length > parsed.origin.length + 1) {
      result = result.slice(0, -1);
    }
    const query = parsed.searchParams.toString();
    return query ? `${result}?${query}` : result;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

export function extractDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

/**
 * Deduplicates search results by canonical URL and filters non-HTTP(S) schemes.
 */
export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];

  for (const item of results) {
    if (!item.url || !isValidHttpUrl(item.url)) {
      continue;
    }
    const key = canonicalizeUrl(item.url);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push({
        ...item,
        title: sanitizeText(item.title, 200) || 'Untitled',
        snippet: sanitizeText(item.snippet, 1200, true),
        canonicalUrl: key,
        domain: item.domain || extractDomain(item.url),
      });
    }
  }

  return deduped;
}

/**
 * Shared timeout-bounded HTTP JSON helper preventing duplicated fetch/error logic across search providers.
 */
async function fetchJsonWithTimeout<T>(
  providerLabel: string,
  url: string,
  init: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    if (!resp.ok) {
      await resp.text().catch(() => '');
      throw new UpstreamServiceError(`${providerLabel} search failed with status ${resp.status}`);
    }
    return (await resp.json()) as T;
  } catch (err) {
    if (err instanceof UpstreamServiceError) throw err;
    throw new UpstreamServiceError(`${providerLabel} search request failed`, err);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRawSearchItems(
  rawItems: Array<{ title?: string; url?: string; snippet?: string; publishedDate?: string }>
): SearchResult[] {
  return rawItems
    .filter((item): item is { title?: string; url: string; snippet?: string; publishedDate?: string } =>
      typeof item.url === 'string' && isValidHttpUrl(item.url)
    )
    .map((item) => ({
      title: sanitizeText(item.title, 200) || 'Untitled',
      url: item.url,
      canonicalUrl: canonicalizeUrl(item.url),
      snippet: sanitizeText(item.snippet, 1200, true),
      publishedDate: typeof item.publishedDate === 'string' ? sanitizeText(item.publishedDate, 64) : undefined,
      domain: extractDomain(item.url),
    }));
}

export class TavilySearchClient implements ISearchClient {
  readonly name = 'tavily';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new UpstreamServiceError('Web search provider is not configured');
    }

    interface TavilyResponse {
      results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }>;
    }

    const data = await fetchJsonWithTimeout<TavilyResponse>('Tavily', 'https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        search_depth: 'advanced',
        include_raw_content: false,
        max_results: maxResults,
      }),
    });

    return normalizeRawSearchItems(
      (data.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.content,
        publishedDate: item.published_date,
      }))
    );
  }
}

export class BraveSearchClient implements ISearchClient {
  readonly name = 'brave';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new UpstreamServiceError('Web search provider is not configured');
    }

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', maxResults.toString());

    interface BraveResponse {
      web?: {
        results?: Array<{ title?: string; url?: string; description?: string; page_age?: string }>;
      };
    }

    const data = await fetchJsonWithTimeout<BraveResponse>('Brave', url.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': this.apiKey,
      },
    });

    return normalizeRawSearchItems(
      (data.web?.results || []).map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.description,
        publishedDate: item.page_age,
      }))
    );
  }
}

