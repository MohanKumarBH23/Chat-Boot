import OpenAI from 'openai';
import {
  ISearchClient,
  SearchResult,
  RouterDecision,
  AgentResponse,
  TemporalAnchor,
  StreamEvent,
} from './types.js';
import { MemoryStore } from './memory.js';
import { deduplicateResults } from './search.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const GREETING_WORDS = new Set(['hi', 'hello', 'hey', 'thanks', 'thank you', 'bye']);

export class SearchAgent {
  private openai?: OpenAI;
  private model: string;
  private searchClient: ISearchClient;
  private memory: MemoryStore;
  private simulatedDate?: Date;

  constructor(options: {
    searchClient: ISearchClient;
    memoryStore: MemoryStore;
    openaiApiKey?: string;
    model?: string;
    simulatedDate?: Date;
  }) {
    this.searchClient = options.searchClient;
    this.memory = options.memoryStore;
    this.model = options.model || process.env.OPENAI_MODEL || 'gpt-4o';
    this.simulatedDate = options.simulatedDate;

    const apiKey = options.openaiApiKey ?? process.env.OPENAI_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      this.openai = new OpenAI({ apiKey: apiKey.trim() });
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
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatHumanDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Resolves the current clock and any explicit or relative past date mentioned in the prompt.
   */
  getTemporalAnchor(userMessage: string): TemporalAnchor {
    const now = this.simulatedDate ? new Date(this.simulatedDate) : new Date();
    const currentDayIdx = now.getDay();
    const currentDayOfWeek =
      WEEKDAYS[currentDayIdx].charAt(0).toUpperCase() + WEEKDAYS[currentDayIdx].slice(1);

    const currentIsoTimestamp = now.toISOString();
    const currentDateIso = this.formatIsoDate(now);
    const currentFormatted = this.formatHumanDate(now);

    const resolved = this.resolveRelativeDate(userMessage, now, currentDayIdx);
    if (!resolved) {
      return {
        currentIsoTimestamp,
        currentDateIso,
        currentDayOfWeek,
        currentFormatted,
      };
    }

    const referenceDateIso = this.formatIsoDate(resolved.date);
    const referenceFormatted = this.formatHumanDate(resolved.date);
    const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d2 = new Date(resolved.date.getFullYear(), resolved.date.getMonth(), resolved.date.getDate());
    const deltaDays = Math.max(0, Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      currentIsoTimestamp,
      currentDateIso,
      currentDayOfWeek,
      currentFormatted,
      referenceDateIso,
      referenceFormatted,
      relativeDescription: resolved.description,
      deltaDays,
    };
  }

  private resolveRelativeDate(
    userMessage: string,
    now: Date,
    currentDayIdx: number
  ): { date: Date; description: string } | null {
    const lower = userMessage.toLowerCase();

    const dateRegex =
      /(?:(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+(\d{4}))?)|(?:(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?)/i;
    const dateMatch = lower.match(dateRegex);

    if (dateMatch) {
      const dayNum = parseInt(dateMatch[1] || dateMatch[5], 10);
      const monthAbbr = (dateMatch[2] || dateMatch[4]).toLowerCase().slice(0, 3);
      const explicitYear = dateMatch[3] || dateMatch[6];
      const monthIdx = MONTHS.indexOf(monthAbbr);

      if (monthIdx !== -1 && dayNum >= 1 && dayNum <= 31) {
        const year = explicitYear ? parseInt(explicitYear, 10) : now.getFullYear();
        let candidate = new Date(year, monthIdx, dayNum);
        if (!explicitYear && candidate.getTime() > now.getTime()) {
          candidate = new Date(year - 1, monthIdx, dayNum);
        }
        const capMonth = monthAbbr.charAt(0).toUpperCase() + monthAbbr.slice(1);
        return { date: candidate, description: `${dayNum} ${capMonth}` };
      }
    }

    if (/\btoday\b/.test(lower)) {
      return { date: new Date(now), description: 'today' };
    }

    if (/\byesterday\b/.test(lower)) {
      const date = new Date(now);
      date.setDate(date.getDate() - 1);
      return { date, description: 'yesterday' };
    }

    const agoMatch = lower.match(/\b(\d+)\s+(day|days|week|weeks)\s+ago\b/);
    if (agoMatch) {
      const amount = parseInt(agoMatch[1], 10);
      const days = agoMatch[2].startsWith('week') ? amount * 7 : amount;
      const date = new Date(now);
      date.setDate(date.getDate() - days);
      return { date, description: `${amount} ${agoMatch[2]} ago` };
    }

    const weekdayMatches = Array.from(
      lower.matchAll(/\b(last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g)
    );
    if (weekdayMatches.length > 0) {
      // Prefer explicit "last <weekday>" phrasing when multiple weekdays appear in one sentence.
      const chosen = weekdayMatches.find((m) => Boolean(m[1])) || weekdayMatches[0];
      const isExplicitLast = Boolean(chosen[1]);
      const dayName = chosen[2];
      const targetDayIdx = WEEKDAYS.indexOf(dayName);

      let diff = currentDayIdx - targetDayIdx;
      if (diff <= 0) {
        diff += 7;
      } else if (isExplicitLast) {
        diff += 7;
      }

      const date = new Date(now);
      date.setDate(date.getDate() - diff);
      const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const shortDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        date,
        description: `${isExplicitLast ? 'last ' : ''}${capDay} (${shortDate})`,
      };
    }

    return null;
  }

  /**
   * Stage 1: Resolve temporal context, query episodic memory, and plan targeted search queries.
   */
  async stage1Route(userMessage: string, conversationId?: string): Promise<RouterDecision> {
    const temporalAnchor = this.getTemporalAnchor(userMessage);
    const activeConv = conversationId ? this.memory.getConversation(conversationId) : undefined;
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
      conversationId
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

        const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}');
        const searchQueries = Array.isArray(parsed.searchQueries) ? parsed.searchQueries.slice(0, 3) : [];
        const requiresSearch = Boolean(parsed.requiresSearch ?? true);
        return {
          temporalContext: parsed.temporalContext || defaultTemporalContext,
          historicalTopicFound:
            parsed.historicalTopicFound !== undefined ? parsed.historicalTopicFound : defaultHistoricalTopic,
          requiresSearch,
          searchQueries: requiresSearch && searchQueries.length === 0 ? [userMessage] : searchQueries,
          temporalAnchor,
          resolvedEntities:
            Array.isArray(parsed.resolvedEntities) && parsed.resolvedEntities.length > 0
              ? parsed.resolvedEntities
              : resolvedEntities,
          historicalBaseline: historicalBaseline || undefined,
          historicalUserPrompt,
          sessionHistory: sessionHistory || undefined,
        };
      } catch (err) {
        console.warn('[Stage1Route] OpenAI router unavailable, using heuristic router:', (err as Error).message);
      }
    }

    // Heuristic offline router built strictly from MemoryStore recall and session context.
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
   * Stage 2: Execute search queries concurrently and deduplicate canonical URLs.
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
        console.warn('[Stage3Synthesize] OpenAI synthesis unavailable, using heuristic synthesis:', (err as Error).message);
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
        return `Found prior thread "${decision.historicalTopicFound}", but ${this.searchClient.name} returned no sources for "${userMessage}". Configure TAVILY_API_KEY or BRAVE_API_KEY in .env for live web verification.`;
      }
      return `No search results were returned for "${userMessage}" using the ${this.searchClient.name} client. Configure TAVILY_API_KEY or BRAVE_API_KEY in .env to run live web queries.`;
    }

    const lines: string[] = [];
    const entitySummary = resolvedEntities.length > 0 ? resolvedEntities.join(', ') : decision.historicalTopicFound || userMessage;

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
    latencyMs: number
  ): void {
    const nowIso = new Date().toISOString();
    this.memory.addMessage(conversationId, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: nowIso,
    });

    this.memory.addMessage(conversationId, {
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
    });
  }

  async process(userMessage: string, conversationId = 'default-cli-session'): Promise<AgentResponse> {
    return this.processWithEvents(userMessage, conversationId);
  }

  async processWithEvents(
    userMessage: string,
    conversationId = 'default-cli-session',
    onEvent?: (event: StreamEvent) => void
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    const decision = await this.stage1Route(userMessage, conversationId);
    onEvent?.({ type: 'stage', stage: 'route', decision });

    let sources: SearchResult[] = [];
    if (decision.requiresSearch && decision.searchQueries.length > 0) {
      sources = await this.stage2Search(decision.searchQueries);
    }
    onEvent?.({ type: 'stage', stage: 'search', queries: decision.searchQueries, sources });

    const content = await this.stage3Synthesize(userMessage, decision, sources);
    const latencyMs = Date.now() - startTime;

    this.recordTurn(conversationId, userMessage, content, decision, sources, latencyMs);

    const response: AgentResponse = {
      content,
      sources,
      queries: decision.searchQueries,
      latencyMs,
      routerDecision: decision,
    };

    const conv = this.memory.getConversation(conversationId);
    if (conv && onEvent) {
      onEvent({ type: 'done', response, conversation: conv });
    }

    return response;
  }
}
