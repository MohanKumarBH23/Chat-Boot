import { ISearchProvider, SearchOptions, extractDomain } from './provider.js';
import { SearchResult } from '../../types/index.js';

export class TavilySearchProvider implements ISearchProvider {
  readonly name = 'tavily';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.isAvailable()) {
      throw new Error('Tavily API key not configured. Set TAVILY_API_KEY in .env');
    }

    const maxResults = options?.maxResults ?? 5;
    const body: Record<string, unknown> = {
      api_key: this.apiKey,
      query,
      search_depth: 'advanced',
      include_answer: false,
      include_raw_content: false,
      max_results: maxResults,
    };

    if (options?.timeRange) {
      body.time_range = options.timeRange;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Tavily search failed (${resp.status}): ${errorText}`);
      }

      interface TavilyResultItem {
        title: string;
        url: string;
        content: string;
        score?: number;
        published_date?: string;
      }

      const data = (await resp.json()) as { results?: TavilyResultItem[] };
      const items = data.results || [];

      return items.map((item) => ({
        title: item.title || 'Untitled',
        url: item.url,
        snippet: item.content || '',
        score: item.score,
        publishedDate: item.published_date,
        domain: extractDomain(item.url),
        sourceProvider: 'tavily' as const,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }
}

