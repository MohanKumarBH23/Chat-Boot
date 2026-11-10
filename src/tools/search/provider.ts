import { SearchResult } from '../../types/index.js';

export interface SearchOptions {
  maxResults?: number;
  recencyDays?: number;
  timeRange?: 'day' | 'week' | 'month' | 'year';
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface ISearchProvider {
  readonly name: string;
  isAvailable(): boolean;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

/**
 * Normalizes and extracts domain from any URL.
 */
export function extractDomain(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'web';
  }
}

/**
 * Deduplicates search results across multiple queries by URL.
 */
export function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const deduped: SearchResult[] = [];

  for (const item of results) {
    // Normalize URL: remove trailing slashes, tracking query params
    let normalized = item.url.trim().toLowerCase();
    try {
      const u = new URL(normalized);
      u.hash = '';
      u.searchParams.delete('utm_source');
      u.searchParams.delete('utm_medium');
      u.searchParams.delete('utm_campaign');
      normalized = u.origin + u.pathname;
    } catch {
      // Keep as-is
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      deduped.push(item);
    }
  }

  return deduped;
}

