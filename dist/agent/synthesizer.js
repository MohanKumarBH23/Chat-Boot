export class AnswerSynthesizer {
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    /**
     * Formats the numbered source bibliography for prompt grounding.
     */
    formatSourcesForPrompt(sources) {
        if (sources.length === 0)
            return 'No web search sources retrieved.';
        return sources
            .map((s, idx) => {
            const num = idx + 1;
            const dateStr = s.publishedDate ? ` (Published: ${s.publishedDate})` : '';
            return `[${num}] ${s.title}${dateStr}\nURL: ${s.url}\nDomain: ${s.domain}\nContent Snippet: ${s.snippet}\n`;
        })
            .join('\n');
    }
    /**
     * Builds the system instructions for grounded, citation-backed streaming synthesis.
     */
    buildSystemPrompt(plan, sources) {
        const { temporalContext, priorContextSummary, intent } = plan;
        return `You are an elite, highly precise research and search agent.
Your mission is to deliver fast, authoritative, citation-grounded answers.

CURRENT TEMPORAL CONTEXT:
- Today's Date: ${temporalContext.currentDateFormatted} (${temporalContext.currentDateIso})
${temporalContext.referenceDateFormatted ? `- Comparison Baseline Date: ${temporalContext.referenceDateFormatted} (${temporalContext.relativePeriodDescription})` : ''}

${priorContextSummary ? `HISTORICAL BASELINE CONTEXT (What was previously asked or discussed):\n${priorContextSummary}\n` : ''}

STRICT GROUNDING & CITATION RULES:
1. CITATION FORMAT: Every factual claim, price, release note, or feature derived from web search MUST include an inline citation in square brackets matching the source index, e.g. [1] or [2][3].
2. FIRST-SENTENCE DIRECTNESS: Answer the user's core question directly in the very first sentence. Never start with generic pleasantries ("Sure! Here is the information...").
3. TEMPORAL DELTA LOGIC (When comparing past vs present):
   - Explicitly contrast what was recorded on the baseline date vs what is true TODAY.
   - Use a clear markdown comparison table or structured bullet list detailing:
     * Entity / Product Name
     * Baseline (as of ${temporalContext.referenceDateFormatted || 'prior date'})
     * Current Status (as of ${temporalContext.currentDateFormatted})
     * Any pricing changes or major shipped features
     * Source citation [X]
4. NEGATIVE VERIFICATION / EPISTEMIC HONESTY:
   - If a company did NOT change pricing or announce new features, say so explicitly: "Confirmed: Pricing remains unchanged at $X [1]". Do NOT invent or hallucinate price changes or updates.
5. CONCISENESS & CLARITY:
   - Be thorough yet dense with information.
   - Use bold text for key figures, metrics, and tiers.
   - Provide a high-level summary followed by granular details.

RETRIEVED WEB SOURCES:
${this.formatSourcesForPrompt(sources)}`;
    }
    /**
     * Synthesize the final answer and stream tokens.
     */
    async synthesizeStream(plan, sources, userMessage, history, onToken) {
        const systemPrompt = this.buildSystemPrompt(plan, sources);
        // Filter relevant recent conversation history (last 4 messages)
        const recentHistory = history.slice(-4).map((m) => ({
            role: (m.role === 'assistant' ? 'assistant' : 'user'),
            content: m.content,
        }));
        const messages = [
            { role: 'system', content: systemPrompt },
            ...recentHistory,
            { role: 'user', content: userMessage },
        ];
        return await this.llm.streamChat(messages, {
            temperature: 0.15,
            onToken,
        });
    }
}
