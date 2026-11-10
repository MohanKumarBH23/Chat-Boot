import * as cheerio from 'cheerio';
import { extractDomain } from './provider.js';
export class DuckDuckGoSearchProvider {
    name = 'duckduckgo';
    isAvailable() {
        return true; // Zero-config fallback, always available
    }
    async search(query, options) {
        const maxResults = options?.maxResults ?? 5;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            // POST to DuckDuckGo HTML endpoint
            const bodyParams = new URLSearchParams();
            bodyParams.set('q', query);
            bodyParams.set('b', '');
            const resp = await fetch('https://html.duckduckgo.com/html/', {
                method: 'POST',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                body: bodyParams.toString(),
                signal: controller.signal,
            });
            if (!resp.ok) {
                throw new Error(`DuckDuckGo request returned HTTP ${resp.status}`);
            }
            const html = await resp.text();
            const $ = cheerio.load(html);
            const results = [];
            $('.result').each((_, element) => {
                if (results.length >= maxResults)
                    return;
                const titleEl = $(element).find('.result__title .result__a');
                const snippetEl = $(element).find('.result__snippet');
                const urlEl = $(element).find('.result__url');
                const title = titleEl.text().trim();
                let rawHref = titleEl.attr('href') || urlEl.text().trim();
                // DDG wraps external URLs in /l/?uddg=<url>
                if (rawHref.includes('uddg=')) {
                    try {
                        const matches = rawHref.match(/uddg=([^&]+)/);
                        if (matches && matches[1]) {
                            rawHref = decodeURIComponent(matches[1]);
                        }
                    }
                    catch {
                        // keep rawHref
                    }
                }
                const snippet = snippetEl.text().trim();
                if (title && rawHref && !rawHref.includes('duckduckgo.com')) {
                    results.push({
                        title,
                        url: rawHref.startsWith('http') ? rawHref : `https://${rawHref}`,
                        snippet: snippet || title,
                        domain: extractDomain(rawHref),
                        sourceProvider: 'duckduckgo',
                    });
                }
            });
            // If HTML returns empty (e.g. rate limit), try the Instant Answer API
            if (results.length === 0) {
                return await this.searchInstantApi(query, maxResults);
            }
            return results;
        }
        catch {
            // Fallback to Instant Answer API on any HTML fetch issue
            return await this.searchInstantApi(query, maxResults);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async searchInstantApi(query, maxResults) {
        try {
            const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
            const resp = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Node.js agent)' },
            });
            if (!resp.ok)
                return [];
            const data = (await resp.json());
            const results = [];
            if (data.AbstractText && data.AbstractURL) {
                results.push({
                    title: data.Heading || query,
                    url: data.AbstractURL,
                    snippet: data.AbstractText,
                    domain: extractDomain(data.AbstractURL),
                    sourceProvider: 'duckduckgo',
                });
            }
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                for (const topic of data.RelatedTopics) {
                    if (results.length >= maxResults)
                        break;
                    if (topic.Text && topic.FirstURL) {
                        results.push({
                            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 60),
                            url: topic.FirstURL,
                            snippet: topic.Text,
                            domain: extractDomain(topic.FirstURL),
                            sourceProvider: 'duckduckgo',
                        });
                    }
                }
            }
            return results;
        }
        catch {
            return [];
        }
    }
}
