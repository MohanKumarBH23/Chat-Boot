import { ISearchProvider, SearchOptions, extractDomain } from './provider.js';
import { SearchResult } from '../../types/index.js';

export class BraveSearchProvider implements ISearchProvider {
  readonly name = 'brave';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.isAvailable()) {
      throw new Error('Brave Search API key not configured. Set BRAVE_SEARCH_API_KEY in .env');
    }

    const count = options?.maxResults ?? 5;
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', count.toString());

    if (options?.timeRange) {
      // Brave supports freshness: pd (past day), pw (past week), pm (past month), py (past year)
      const freshnessMap: Record<string, string> = {
        day: 'pd',
        week: 'pw',
        month: 'pm',
        year: 'py',
      };
      if (freshnessMap[options.timeRange]) {
        url.searchParams.set('freshness', freshnessMap[options.timeRange]);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey,
        },
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Brave search failed (${resp.status}): ${errorText}`);
      }

      interface BraveWebItem {
        title: string;
        url: string;
        description: string;
        page_age?: string;
      }

      const data = (await resp.json()) as { web?: { results?: BraveWebItem[] } };
      const items = data.web?.results || [];

      return items.map((item) => ({
        title: item.title || 'Untitled',
        url: item.url,
        snippet: item.description || '',
        publishedDate: item.page_age,
        domain: extractDomain(item.url),
        sourceProvider: 'brave' as const,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }
}

