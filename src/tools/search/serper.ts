import { ISearchProvider, SearchOptions, extractDomain } from './provider.js';
import { SearchResult } from '../../types/index.js';

export class SerperSearchProvider implements ISearchProvider {
  readonly name = 'serper';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.SERPER_API_KEY || '';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (!this.isAvailable()) {
      throw new Error('Serper API key not configured. Set SERPER_API_KEY in .env');
    }

    const num = options?.maxResults ?? 5;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const resp = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey,
        },
        body: JSON.stringify({
          q: query,
          num,
          tbs: options?.timeRange === 'day' ? 'qdr:d' : options?.timeRange === 'week' ? 'qdr:w' : undefined,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Serper search failed (${resp.status}): ${errorText}`);
      }

      interface SerperOrganicItem {
        title: string;
        link: string;
        snippet: string;
        date?: string;
        position?: number;
      }

      const data = (await resp.json()) as { organic?: SerperOrganicItem[] };
      const items = data.organic || [];

      return items.map((item) => ({
        title: item.title || 'Untitled',
        url: item.link,
        snippet: item.snippet || '',
        publishedDate: item.date,
        domain: extractDomain(item.link),
        sourceProvider: 'serper' as const,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }
}

