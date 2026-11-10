import { extractDomain } from './provider.js';
export class TavilySearchProvider {
    name = 'tavily';
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
    }
    isAvailable() {
        return Boolean(this.apiKey && this.apiKey.trim().length > 0);
    }
    async search(query, options) {
        if (!this.isAvailable()) {
            throw new Error('Tavily API key not configured. Set TAVILY_API_KEY in .env');
        }
        const maxResults = options?.maxResults ?? 5;
        const body = {
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
            const data = (await resp.json());
            const items = data.results || [];
            return items.map((item) => ({
                title: item.title || 'Untitled',
                url: item.url,
                snippet: item.content || '',
                score: item.score,
                publishedDate: item.published_date,
                domain: extractDomain(item.url),
                sourceProvider: 'tavily',
            }));
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
