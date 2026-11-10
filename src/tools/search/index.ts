import { ISearchProvider, SearchOptions, deduplicateResults } from './provider.js';
import { TavilySearchProvider } from './tavily.js';
import { BraveSearchProvider } from './brave.js';
import { SerperSearchProvider } from './serper.js';
import { DuckDuckGoSearchProvider } from './duckduckgo.js';
import { MockSearchProvider } from './mock.js';
import { SearchResult, SearchProviderType } from '../../types/index.js';
import { scrapePageContent, ScrapedPage } from './scraper.js';

export interface SearchExecutionMetrics {
  durationMs: number;
  provider: string;
  query: string;
  count: number;
}

/**
 * The unified Web Search Tool.
 * Provides resilient, multi-provider web search with automatic fallback,
 * parallel query execution, deduplication, and optional page scraping.
 */
export class WebSearchTool {
  private activeProvider: ISearchProvider;
  private fallbackProvider: ISearchProvider;
  private providerName: SearchProviderType;

  constructor(preferredProvider?: SearchProviderType) {
    this.fallbackProvider = new DuckDuckGoSearchProvider();

    if (preferredProvider === 'mock') {
      this.activeProvider = new MockSearchProvider();
      this.providerName = 'mock';
      return;
    }

    if (preferredProvider === 'tavily') {
      this.activeProvider = new TavilySearchProvider();
      this.providerName = 'tavily';
      return;
    }

    if (preferredProvider === 'brave') {
      this.activeProvider = new BraveSearchProvider();
      this.providerName = 'brave';
      return;
    }

    if (preferredProvider === 'serper') {
      this.activeProvider = new SerperSearchProvider();
      this.providerName = 'serper';
      return;
    }

    // Auto-detect based on available environment variables
    if (process.env.TAVILY_API_KEY) {
      this.activeProvider = new TavilySearchProvider();
      this.providerName = 'tavily';
    } else if (process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY) {
      this.activeProvider = new BraveSearchProvider();
      this.providerName = 'brave';
    } else if (process.env.SERPER_API_KEY) {
      this.activeProvider = new SerperSearchProvider();
      this.providerName = 'serper';
    } else if (process.env.USE_MOCK_SEARCH === 'true') {
      this.activeProvider = new MockSearchProvider();
      this.providerName = 'mock';
    } else {
      this.activeProvider = this.fallbackProvider;
      this.providerName = 'duckduckgo';
    }
  }

  getProviderName(): string {
    return this.providerName;
  }

  /**
   * Execute a single web search query.
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    try {
      if (this.activeProvider.isAvailable()) {
        const results = await this.activeProvider.search(cleanQuery, options);
        if (results && results.length > 0) {
          return results;
        }
      }
    } catch (err) {
      console.warn(`[WebSearchTool] ${this.providerName} failed, falling back to DuckDuckGo:`, (err as Error).message);
    }

    // Fallback if primary fails or is unavailable
    if (this.activeProvider !== this.fallbackProvider) {
      try {
        return await this.fallbackProvider.search(cleanQuery, options);
      } catch (fallbackErr) {
        console.error('[WebSearchTool] Fallback search also failed:', (fallbackErr as Error).message);
        return [];
      }
    }

    return [];
  }

  /**
   * Execute multiple search queries in parallel with deduplication.
   * This is key to answering fast: instead of sequential tool calls taking 15+ seconds,
   * parallel multi-query search completes in ~1-2 seconds total!
   */
  async searchParallel(
    queries: string[],
    options?: SearchOptions,
    onProgress?: (query: string, resultsCount: number, durationMs: number) => void
  ): Promise<{ results: SearchResult[]; metrics: SearchExecutionMetrics[] }> {
    const uniqueQueries = Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean)));
    if (uniqueQueries.length === 0) {
      return { results: [], metrics: [] };
    }

    const startTime = Date.now();
    const metrics: SearchExecutionMetrics[] = [];

    const searchPromises = uniqueQueries.map(async (query) => {
      const qStart = Date.now();
      try {
        const results = await this.search(query, options);
        const qDuration = Date.now() - qStart;
        metrics.push({
          durationMs: qDuration,
          provider: this.providerName,
          query,
          count: results.length,
        });
        onProgress?.(query, results.length, qDuration);
        return results;
      } catch {
        const qDuration = Date.now() - qStart;
        metrics.push({
          durationMs: qDuration,
          provider: this.providerName,
          query,
          count: 0,
        });
        onProgress?.(query, 0, qDuration);
        return [];
      }
    });

    const nestedResults = await Promise.all(searchPromises);
    const flattened = nestedResults.flat();
    const deduplicated = deduplicateResults(flattened);

    return {
      results: deduplicated,
      metrics,
    };
  }

  /**
   * Optionally read full page text for in-depth verification of official documentation or pricing.
   */
  async readPage(url: string, maxChars?: number): Promise<ScrapedPage> {
    return await scrapePageContent(url, maxChars);
  }
}

