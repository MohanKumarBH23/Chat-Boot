import { ISearchClient, SearchProviderName } from '../../types/index.js';
import {
  BraveSearchClient,
  TavilySearchClient,
  canonicalizeUrl,
  deduplicateResults,
  extractDomain,
} from './httpSearchClients.js';
import { MockSearchClient } from './mockSearchClient.js';

export {
  BraveSearchClient,
  MockSearchClient,
  TavilySearchClient,
  canonicalizeUrl,
  deduplicateResults,
  extractDomain,
};

export interface SearchClientOptions {
  provider: SearchProviderName;
  tavilyApiKey?: string;
  braveApiKey?: string;
}

/**
 * Instantiates the configured search backend from explicit application configuration,
 * falling back cleanly to offline mock fixtures when keys are unset.
 */
export function createSearchClient(options: SearchClientOptions): ISearchClient {
  if (options.provider === 'mock') {
    return new MockSearchClient();
  }

  if (options.provider === 'brave') {
    if (options.braveApiKey) {
      return new BraveSearchClient(options.braveApiKey);
    }
    console.warn('[SearchFactory] BRAVE_API_KEY missing, falling back to MockSearchClient');
    return new MockSearchClient();
  }

  if (options.tavilyApiKey) {
    return new TavilySearchClient(options.tavilyApiKey);
  }

  return new MockSearchClient();
}

