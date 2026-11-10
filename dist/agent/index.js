import { WebSearchTool } from '../tools/search/index.js';
import { UniversalLLMClient } from '../llm/index.js';
import { ConversationStore } from '../memory/store.js';
import { TemporalReasoner } from './temporal.js';
import { QueryPlanner } from './planner.js';
import { AnswerSynthesizer } from './synthesizer.js';
/**
 * The State-of-the-Art Search Chat Agent Orchestrator.
 * Coordinates episodic memory recall, temporal grounding, parallel web search,
 * and citation-backed streaming synthesis.
 */
export class SearchAgent {
    memoryStore;
    searchTool;
    llm;
    temporalReasoner;
    planner;
    synthesizer;
    constructor(options) {
        this.memoryStore = options?.conversationStore || new ConversationStore();
        this.searchTool = options?.webSearchTool || new WebSearchTool();
        this.llm = options?.llmClient || new UniversalLLMClient();
        this.temporalReasoner = options?.temporalReasoner || new TemporalReasoner();
        this.planner = new QueryPlanner(this.llm, this.temporalReasoner, this.memoryStore);
        this.synthesizer = new AnswerSynthesizer(this.llm);
    }
    /**
     * Main entrypoint: Streams an agent execution for an incoming user message.
     */
    async *chatStream(conversationId, userMessageText) {
        const startTime = Date.now();
        let searchStartTime = 0;
        let searchDurationMs = 0;
        let synthesisStartTime = 0;
        let synthesisDurationMs = 0;
        // Retrieve or create conversation
        let conv = this.memoryStore.getConversation(conversationId);
        if (!conv) {
            conv = this.memoryStore.createConversation();
            conversationId = conv.id;
        }
        // Record user message
        const now = new Date();
        const userMsg = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: userMessageText,
            timestamp: now.toISOString(),
            formattedDate: this.temporalReasoner.formatHuman(now),
        };
        this.memoryStore.addMessage(conversationId, userMsg);
        yield {
            type: 'status',
            phase: 'init',
            message: 'Analyzing request and temporal anchors...',
        };
        // Phase 1: Planning & Memory Resolution
        yield {
            type: 'status',
            phase: 'memory',
            message: 'Checking conversation history and reference dates...',
        };
        const plan = await this.planner.plan(conversationId, userMessageText);
        yield { type: 'plan', plan };
        if (plan.resolvedEntities.length > 0) {
            yield {
                type: 'delta_context',
                baselineDate: plan.temporalContext.referenceDateFormatted || 'baseline',
                entities: plan.resolvedEntities,
            };
        }
        let sources = [];
        let searchQueries = [];
        // Phase 2: Parallel Web Search
        if (plan.shouldSearch && plan.queries.length > 0) {
            searchStartTime = Date.now();
            searchQueries = plan.queries;
            yield {
                type: 'status',
                phase: 'search',
                message: `Dispatching ${plan.queries.length} parallel web search queries across ${this.searchTool.getProviderName()}...`,
            };
            const { results } = await this.searchTool.searchParallel(plan.queries, {
                maxResults: 4,
                timeRange: plan.temporalContext.deltaDays && plan.temporalContext.deltaDays <= 7 ? 'week' : undefined,
            }, (query, count, dur) => {
                // Progress callback
            });
            sources = results;
            searchDurationMs = Date.now() - searchStartTime;
            yield { type: 'sources_ready', sources };
        }
        // Phase 3: Grounded Streaming Synthesis
        yield {
            type: 'status',
            phase: 'synthesizing',
            message: 'Synthesizing response with inline citations and delta verification...',
        };
        synthesisStartTime = Date.now();
        let accumulatedContent = '';
        const assistantMsgId = `asst-${Date.now()}`;
        // Helper generator bridge
        const tokens = [];
        let streamComplete = false;
        let streamError = null;
        const synthesisPromise = this.synthesizer.synthesizeStream(plan, sources, userMessageText, conv.messages, (token) => {
            tokens.push(token);
        }).then((finalText) => {
            streamComplete = true;
            accumulatedContent = finalText;
        }).catch((err) => {
            streamComplete = true;
            streamError = err;
        });
        // Stream tokens to client as they arrive
        while (!streamComplete || tokens.length > 0) {
            if (tokens.length > 0) {
                const tok = tokens.shift();
                yield { type: 'token', token: tok };
            }
            else {
                await new Promise((r) => setTimeout(r, 15));
            }
        }
        await synthesisPromise;
        if (streamError) {
            yield { type: 'error', message: streamError.message };
            throw streamError;
        }
        synthesisDurationMs = Date.now() - synthesisStartTime;
        const totalDurationMs = Date.now() - startTime;
        // Final Assistant Message Object
        const assistantMsg = {
            id: assistantMsgId,
            role: 'assistant',
            content: accumulatedContent,
            timestamp: new Date().toISOString(),
            formattedDate: this.temporalReasoner.formatHuman(new Date()),
            sources: sources.slice(0, 10),
            searchQueries,
            metrics: {
                totalDurationMs,
                searchDurationMs,
                synthesisDurationMs,
                searchQueryCount: searchQueries.length,
                sourcesCount: sources.length,
            },
            metadata: {
                intent: plan.intent,
                resolvedEntities: plan.resolvedEntities,
                temporalAnchor: plan.temporalContext.currentDateIso,
            },
        };
        // Store in conversation history
        this.memoryStore.addMessage(conversationId, assistantMsg);
        yield {
            type: 'complete',
            message: assistantMsg,
        };
        return assistantMsg;
    }
}
