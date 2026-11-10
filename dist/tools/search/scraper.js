import * as cheerio from 'cheerio';
/**
 * Lightweight web content reader to extract dense clean text from high-value pages.
 */
export async function scrapePageContent(url, maxChars = 2500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
        const resp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,text/plain',
            },
            signal: controller.signal,
        });
        if (!resp.ok) {
            return { url, title: '', textContent: '', success: false };
        }
        const html = await resp.text();
        const $ = cheerio.load(html);
        // Remove noisy elements
        $('script, style, noscript, nav, footer, header, svg, iframe, form').remove();
        const title = $('title').text().trim() || $('h1').first().text().trim() || url;
        // Extract text from main content if available, else body
        const mainEl = $('main, article, #content, .content, [role="main"]').first();
        const rawText = (mainEl.length ? mainEl.text() : $('body').text())
            .replace(/\s+/g, ' ')
            .trim();
        return {
            url,
            title,
            textContent: rawText.slice(0, maxChars),
            success: true,
        };
    }
    catch {
        return { url, title: '', textContent: '', success: false };
    }
    finally {
        clearTimeout(timeout);
    }
}
