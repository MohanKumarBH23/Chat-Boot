import OpenAI from 'openai';
import { safeJsonParse } from '../../security/crypto.js';
import { ValidationError } from '../../security/errors.js';
import { sanitizeText } from '../../security/validation.js';
import { MemoryStore } from '../../storage/memoryStore.js';
import {
  AgentResponse,
  ISearchClient,
  RouterDecision,
  SearchResult,
  StreamEvent,
  TemporalAnchor,
} from '../../types/index.js';
import { deduplicateResults } from '../search/index.js';
import { formatHumanDate, formatIsoDate, resolveTemporalAnchor } from './temporal.js';

const GREETING_WORDS = new Set(['hi', 'hello', 'hey', 'thanks', 'thank you', 'bye']);

export interface SearchAgentOptions {
  searchClient: ISearchClient;
  memoryStore: MemoryStore;
  openaiApiKey?: string;
  model?: string;
  simulatedDate?: Date;
}

/**
 * Three-stage differential verification agent:
 *   1) Temporal grounding & isolated memory recall
 *   2) Concurrent web search fan-out & canonical deduplication
 *   3) Baseline-vs-current synthesis with citations
 */
export class SearchAgent {
  private readonly openai?: OpenAI;
  private readonly model: string;
  private readonly searchClient: ISearchClient;
  private readonly memory: MemoryStore;
  private readonly simulatedDate?: Date;

  constructor(options: SearchAgentOptions) {
    this.searchClient = options.searchClient;
    this.memory = options.memoryStore;
    this.model = (options.model || 'gpt-4o').trim() || 'gpt-4o';
    this.simulatedDate = options.simulatedDate;

    const apiKey = (options.openaiApiKey || '').trim();
    if (apiKey.length > 0) {
      this.openai = new OpenAI({ apiKey });
    }
  }

  get isLlmConfigured(): boolean {
    return Boolean(this.openai);
  }

  get modelName(): string {
    return this.openai ? this.model : 'heuristic';
  }

  get searchProviderName(): string {
    return this.searchClient.name;
  }

  get memoryStore(): MemoryStore {
    return this.memory;
  }

  formatIsoDate(date: Date): string {
    return formatIsoDate(date);
  }

  formatHumanDate(date: Date): string {
    return formatHumanDate(date);
  }

  getTemporalAnchor(userMessage: string): TemporalAnchor {
    return resolveTemporalAnchor(userMessage, this.simulatedDate);
  }

  /**
   * Stage 1: Resolve temporal context, recall tenant-owned baseline memory, and plan targeted search queries.
   */
  async stage1Route(userMessage: string, conversationId?: string, ownerId?: string): Promise<RouterDecision> {
    const temporalAnchor = this.getTemporalAnchor(userMessage);
    const activeConv = conversationId ? this.memory.getConversation(conversationId, ownerId) : undefined;
    const recentMessages = activeConv ? activeConv.messages.slice(-6) : [];
    const sessionHistory =
      recentMessages.length > 0
        ? recentMessages
            .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 400)}`)
            .join('\n')
        : '';

    const match = this.memory.findTurnByDateOrEntity(
      userMessage,
      temporalAnchor.referenceDateIso,
      conversationId,
      ownerId
    );
    let historicalBaseline = '';
    let historicalUserPrompt: string | undefined;
    const resolvedEntities: string[] = [];

    if (match) {
      const parts: string[] = [
        `Conversation: "${match.conversation.title}" (Date: ${match.targetDate})`,
      ];
      if (match.userMessage) {
        historicalUserPrompt = match.userMessage.content;
        parts.push(`User Asked (${match.targetDate}): "${match.userMessage.content}"`);
      }
      if (match.assistantMessage) {
        parts.push(`Assistant Answered (${match.targetDate}):\n${match.assistantMessage.content}`);
        if (Array.isArray(match.assistantMessage.metadata?.entities)) {
          resolvedEntities.push(...(match.assistantMessage.metadata.entities as string[]));
        }
      }
      historicalBaseline = parts.join('\n\n');
    } else if (recentMessages.length > 0) {
      for (const msg of [...recentMessages].reverse()) {
        if (Array.isArray(msg.metadata?.entities) && msg.metadata.entities.length > 0) {
          resolvedEntities.push(...(msg.metadata.entities as string[]));
          break;
        }
      }
    }

    const defaultTemporalContext = temporalAnchor.referenceDateIso
      ? `Clock: ${temporalAnchor.currentDateIso} (${temporalAnchor.currentDayOfWeek}) | Resolved "${temporalAnchor.relativeDescription}" -> ${temporalAnchor.referenceDateIso} (${temporalAnchor.deltaDays}d ago)`
      : `Clock: ${temporalAnchor.currentDateIso} (${temporalAnchor.currentDayOfWeek})`;
    const defaultHistoricalTopic: string | null = match
      ? `${match.conversation.title} (${match.targetDate})`
      : recentMessages.length > 0
        ? `${activeConv?.title || 'Active thread'} (active session)`
        : null;

    const [year] = temporalAnchor.currentDateIso.split('-');
    const monthName = new Date(temporalAnchor.currentIsoTimestamp).toLocaleDateString('en-US', {
      month: 'long',
      timeZone: 'UTC',
    });

    if (this.openai) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          messages: [
            {
              role: 'system',
              content: `You are Stage 1 (Temporal Grounder & Router) for DeltaCheck, a CLI and Web search agent.
LIVE SYSTEM CLOCK:
- ISO-8601 Timestamp: ${temporalAnchor.currentIsoTimestamp}
- Date & Day: ${temporalAnchor.currentDateIso} (${temporalAnchor.currentDayOfWeek})
${temporalAnchor.referenceDateIso ? `- Resolved Reference Date: ${temporalAnchor.referenceDateIso} (${temporalAnchor.relativeDescription}, ${temporalAnchor.deltaDays} days ago)` : ''}

${sessionHistory ? `ACTIVE SESSION HISTORY (Recent Turns):\n${sessionHistory}\n\n` : ''}${historicalBaseline ? `EPISODIC MEMORY RECALL:\n${historicalBaseline}\n` : 'EPISODIC MEMORY RECALL: No matching prior turns found.'}

INSTRUCTIONS:
1. Summarize the resolved temporal context ("temporalContext": string).
2. Name any recalled prior topic ("historicalTopicFound": string | null).
3. Decide if web search is required ("requiresSearch": boolean). Greetings/chitchat do not need search. Temporal delta checks, fact verification, pricing, and current updates DO need search.
4. Extract concrete entity names ("resolvedEntities": string[]), resolving pronouns from ACTIVE SESSION HISTORY or EPISODIC MEMORY when applicable.
5. Generate 1 to 3 targeted delta search queries ("searchQueries": string[]) checking pricing updates, changelogs, or releases since the reference date (e.g., "[Entity] pricing update ${monthName} ${year}", NOT generic overviews).

Return ONLY valid JSON:
{
  "temporalContext": string,
  "historicalTopicFound": string | null,
  "requiresSearch": boolean,
  "searchQueries": string[],
  "resolvedEntities": string[]
}`,
            },
            { role: 'user', content: userMessage },
          ],
        });

        const parsed = safeJsonParse<Record<string, unknown>>(
          completion.choices[0]?.message?.content || '{}'
        );
        const searchQueries = Array.isArray(parsed.searchQueries)
          ? parsed.searchQueries
              .filter((q): q is string => typeof q === 'string')
              .map((q) => sanitizeText(q, 240))
              .filter(Boolean)
              .slice(0, 3)
          : [];
        const parsedEntities = Array.isArray(parsed.resolvedEntities)
          ? parsed.resolvedEntities
              .filter((e): e is string => typeof e === 'string')
              .map((e) => sanitizeText(e, 100))
              .filter(Boolean)
          : [];
        const requiresSearch = Boolean(parsed.requiresSearch ?? true);
        return {
          temporalContext:
            typeof parsed.temporalContext === 'string'
              ? sanitizeText(parsed.temporalContext, 400)
              : defaultTemporalContext,
          historicalTopicFound:
            parsed.historicalTopicFound !== undefined
              ? typeof parsed.historicalTopicFound === 'string'
                ? sanitizeText(parsed.historicalTopicFound, 200)
                : null
              : defaultHistoricalTopic,
          requiresSearch,
          searchQueries: requiresSearch && searchQueries.length === 0 ? [userMessage] : searchQueries,
          temporalAnchor,
          resolvedEntities: parsedEntities.length > 0 ? parsedEntities : resolvedEntities,
          historicalBaseline: historicalBaseline || undefined,
          historicalUserPrompt,
          sessionHistory: sessionHistory || undefined,
        };
      } catch (err) {
        const status = (err as { status?: number })?.status;
        console.warn(`[Stage1Route] OpenAI router unavailable${status ? ` (HTTP ${status})` : ''}, using heuristic router.`);
      }
    }

    const lower = userMessage.toLowerCase().trim();
    const requiresSearch = !GREETING_WORDS.has(lower.replace(/[.!?]+$/, ''));
    const searchQueries = requiresSearch
      ? this.buildFallbackQueries(userMessage, resolvedEntities, match?.conversation.title, recentMessages, monthName, year)
      : [];

    return {
      temporalContext: defaultTemporalContext,
      historicalTopicFound: defaultHistoricalTopic,
      requiresSearch,
      searchQueries,
      temporalAnchor,
      resolvedEntities,
      historicalBaseline: historicalBaseline || undefined,
      historicalUserPrompt,
      sessionHistory: sessionHistory || undefined,
    };
  }

  private buildFallbackQueries(
    userMessage: string,
    resolvedEntities: string[],
    recalledTitle: string | undefined,
    recentMessages: Array<{ role: string; content: string }>,
    monthName: string,
    year: string
  ): string[] {
    if (resolvedEntities.length > 0) {
      const queries: string[] = [];
      const chunkSize = Math.ceil(resolvedEntities.length / 2);
      const firstGroup = resolvedEntities.slice(0, Math.min(3, chunkSize)).join(' ');
      const secondGroup = resolvedEntities.slice(Math.min(3, chunkSize)).join(' ');

      queries.push(`${firstGroup} pricing update ${monthName} ${year}`.trim());
      if (secondGroup.length > 0) {
        queries.push(`${secondGroup} pricing changelog ${monthName} ${year}`.trim());
      }
      return queries;
    }

    if (recalledTitle) {
      return [`${recalledTitle} updates ${monthName} ${year}`];
    }

    if (recentMessages.length > 0) {
      const hasFollowUpPronoun = /\b(it|its|they|their|them|that|those|these|what about|how about)\b/i.test(
        userMessage
      );
      if (hasFollowUpPronoun) {
        const lastUserTurn = [...recentMessages].reverse().find((m) => m.role === 'user');
        if (lastUserTurn) {
          return [`${lastUserTurn.content} ${userMessage}`];
        }
      }
    }

    return [userMessage];
  }

  /**
   * Stage 2: Execute planned search queries concurrently and deduplicate canonical URLs.
   */
  async stage2Search(queries: string[]): Promise<SearchResult[]> {
    if (queries.length === 0) return [];

    const nested = await Promise.all(
      queries.map(async (q) => {
        try {
          return await this.searchClient.search(q, 5);
        } catch (err) {
          console.warn(`[Stage2Search] Failed query "${q}":`, (err as Error).message);
          return [];
        }
      })
    );

    return deduplicateResults(nested.flat());
  }

  /**
   * Stage 3: Contrast retrieved web sources against recalled prior baselines.
   */
  async stage3Synthesize(
    userMessage: string,
    decision: RouterDecision,
    sources: SearchResult[]
  ): Promise<string> {
    const { temporalAnchor, historicalBaseline, historicalUserPrompt, resolvedEntities } = decision;

    const sourcesContext =
      sources.length > 0
        ? sources
            .map(
              (s, i) =>
                `[${i + 1}] Title: ${s.title}\nURL: ${s.url}\nPublished: ${s.publishedDate || 'Recent'}\nSnippet: ${s.snippet}`
            )
            .join('\n\n')
        : 'No web search sources retrieved.';

    if (this.openai) {
      try {
        const completion = await this.openai.chat.completions.create({
          model: this.model,
          temperature: 0.15,
          messages: [
            {
              role: 'system',
              content: `You are Stage 3 (Differential Synthesis) for DeltaCheck, a research assistant.
LIVE CLOCK: ${temporalAnchor.currentFormatted} (${temporalAnchor.currentIsoTimestamp})
${temporalAnchor.referenceFormatted ? `BASELINE DATE: ${temporalAnchor.referenceFormatted} (${temporalAnchor.relativeDescription})` : ''}

${decision.sessionHistory ? `ACTIVE SESSION HISTORY (Recent Turns):\n${decision.sessionHistory}\n\n` : ''}${historicalBaseline ? `HISTORICAL BASELINE FROM MEMORY:\n${historicalBaseline}\n` : ''}
LIVE WEB SOURCES:
${sourcesContext}

STRICT OUTPUT CONTRACT:
1. DIRECT VERDICT IN SENTENCE 1: Answer the user's core question immediately in the first sentence without throat-clearing ("Based on my search...", "I checked...", "Here is what I found...").
2. DIFFERENTIAL COMPARISON: Explicitly contrast past commitments/baselines vs. what the retrieved sources show today, clearly separating unchanged items from changed or newly shipped items.
3. EPISTEMIC HONESTY: If no sources were returned or pricing/recommendations did not change, state that explicitly. Never fabricate updates or citations.
4. CLEAN MARKDOWN CITATIONS: Cite sources cleanly using markdown links [Title](url).`,
            },
            { role: 'user', content: userMessage },
          ],
        });

        return (completion.choices[0]?.message?.content || '').trim();
      } catch (err) {
        const status = (err as { status?: number })?.status;
        console.warn(`[Stage3Synthesize] OpenAI synthesis unavailable${status ? ` (HTTP ${status})` : ''}, using heuristic synthesis.`);
      }
    }

    return this.synthesizeOffline(userMessage, decision, sources, historicalUserPrompt, resolvedEntities);
  }

  private synthesizeOffline(
    userMessage: string,
    decision: RouterDecision,
    sources: SearchResult[],
    historicalUserPrompt: string | undefined,
    resolvedEntities: string[]
  ): string {
    if (!decision.requiresSearch) {
      return 'Ready. Ask a question or reference a past date to verify details against web sources.';
    }

    const anchor = decision.temporalAnchor;
    const isAskingWhatWasAsked = /\bwhat did i ask\b/i.test(userMessage);

    if (sources.length === 0) {
      if (historicalUserPrompt && isAskingWhatWasAsked) {
        return `On ${anchor.referenceDateIso || 'that date'}, you asked: "${historicalUserPrompt}". No web search sources were returned in offline mode (${this.searchClient.name}) to verify whether details changed today.`;
      }
      if (decision.historicalTopicFound) {
        return `Found prior thread "${decision.historicalTopicFound}", but no search results were returned for your query. Contact an administrator to enable a live web search provider if external verification is needed.`;
      }
      return `No search results were returned for your query (${this.searchClient.name} client). Contact an administrator to configure a live web search provider if external verification is needed.`;
    }

    const lines: string[] = [];
    const entitySummary =
      resolvedEntities.length > 0 ? resolvedEntities.join(', ') : decision.historicalTopicFound || userMessage;

    if (historicalUserPrompt && isAskingWhatWasAsked) {
      lines.push(
        `On ${anchor.referenceDateIso || 'that date'}, you asked: "${historicalUserPrompt}", and the ${sources.length} retrieved sources remain consistent with the stored baseline.`
      );
    } else if (decision.historicalTopicFound) {
      lines.push(
        `Retrieved ${sources.length} current sources for ${entitySummary} against the ${anchor.referenceDateIso || 'stored'} baseline (${decision.historicalTopicFound}).`
      );
    } else {
      lines.push(`Retrieved ${sources.length} sources for ${entitySummary}.`);
    }

    lines.push('');
    lines.push('### Source findings');
    lines.push('');
    for (const s of sources) {
      const dateMeta = s.publishedDate ? ` (${s.publishedDate})` : '';
      lines.push(`- **${s.title}**${dateMeta}: ${s.snippet} ([${s.domain}](${s.url}))`);
    }

    return lines.join('\n');
  }

  private recordTurn(
    conversationId: string,
    userMessage: string,
    content: string,
    decision: RouterDecision,
    sources: SearchResult[],
    latencyMs: number,
    ownerId?: string
  ): void {
    const nowIso = new Date().toISOString();
    this.memory.addMessage(
      conversationId,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: nowIso,
      },
      false,
      ownerId
    );

    this.memory.addMessage(
      conversationId,
      {
        id: `asst-${Date.now() + 1}`,
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
        sources,
        queries: decision.searchQueries,
        latencyMs,
        metadata: {
          entities: decision.resolvedEntities,
          temporalAnchor: decision.temporalAnchor.currentDateIso,
          referenceDateIso: decision.temporalAnchor.referenceDateIso,
          relativeDescription: decision.temporalAnchor.relativeDescription,
          deltaDays: decision.temporalAnchor.deltaDays,
          historicalTopicFound: decision.historicalTopicFound,
        },
      },
      false,
      ownerId
    );
  }

  async process(
    userMessage: string,
    conversationId = 'default-cli-session',
    ownerId?: string
  ): Promise<AgentResponse> {
    return this.processWithEvents(userMessage, conversationId, undefined, ownerId);
  }

  async processWithEvents(
    userMessage: string,
    conversationId = 'default-cli-session',
    onEvent?: (event: StreamEvent) => void,
    ownerId?: string
  ): Promise<AgentResponse> {
    const cleanUserMessage = sanitizeText(userMessage, 4000, true);
    if (!cleanUserMessage) {
      throw new ValidationError('Message content is required');
    }

    const startTime = Date.now();
    const decision = await this.stage1Route(cleanUserMessage, conversationId, ownerId);
    onEvent?.({ type: 'stage', stage: 'route', decision });

    let sources: SearchResult[] = [];
    if (decision.requiresSearch && decision.searchQueries.length > 0) {
      sources = await this.stage2Search(decision.searchQueries);
    }
    onEvent?.({ type: 'stage', stage: 'search', queries: decision.searchQueries, sources });

    const content = await this.stage3Synthesize(cleanUserMessage, decision, sources);
    const latencyMs = Date.now() - startTime;

    this.recordTurn(conversationId, cleanUserMessage, content, decision, sources, latencyMs, ownerId);

    const response: AgentResponse = {
      content,
      sources,
      queries: decision.searchQueries,
      latencyMs,
      routerDecision: decision,
    };

    const conv = this.memory.getConversation(conversationId, ownerId);
    if (conv && onEvent) {
      onEvent({ type: 'done', response, conversation: conv });
    }

    return response;
  }
}

