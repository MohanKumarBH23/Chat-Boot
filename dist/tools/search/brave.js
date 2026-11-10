import { extractDomain } from './provider.js';
export class BraveSearchProvider {
    name = 'brave';
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || '';
    }
    isAvailable() {
        return Boolean(this.apiKey && this.apiKey.trim().length > 0);
    }
    async search(query, options) {
        if (!this.isAvailable()) {
            throw new Error('Brave Search API key not configured. Set BRAVE_SEARCH_API_KEY in .env');
        }
        const count = options?.maxResults ?? 5;
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', query);
        url.searchParams.set('count', count.toString());
        if (options?.timeRange) {
            // Brave supports freshness: pd (past day), pw (past week), pm (past month), py (past year)
            const freshnessMap = {
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
            const data = (await resp.json());
            const items = data.web?.results || [];
            return items.map((item) => ({
                title: item.title || 'Untitled',
                url: item.url,
                snippet: item.description || '',
                publishedDate: item.page_age,
                domain: extractDomain(item.url),
                sourceProvider: 'brave',
            }));
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
