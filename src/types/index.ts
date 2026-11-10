/**
 * Core type definitions for the Search Chat Agent.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  publishedDate?: string;
  author?: string;
  domain: string;
  favicon?: string;
  sourceProvider: 'tavily' | 'brave' | 'serper' | 'duckduckgo' | 'scraper' | 'mock';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string; // ISO string
  formattedDate?: string; // Human readable, e.g. "Monday, Nov 9, 2026 2:15 PM"
  sources?: SearchResult[];
  searchQueries?: string[];
  metrics?: {
    totalDurationMs: number;
    searchDurationMs?: number;
    synthesisDurationMs?: number;
    searchQueryCount?: number;
    sourcesCount?: number;
  };
  metadata?: {
    entities?: string[];
    temporalAnchor?: string;
    isBenchmark?: boolean;
    [key: string]: unknown;
  };
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  pinned?: boolean;
  benchmarkScenario?: 'crm-shortlist' | 'nov-3-answer' | 'postgres-hosting';
}

export interface TemporalContext {
  currentDateIso: string;
  currentDateFormatted: string;
  referenceDateIso?: string;
  referenceDateFormatted?: string;
  relativePeriodDescription?: string; // e.g. "since Monday, Nov 9, 2026"
  deltaDays?: number;
}

export interface SearchPlan {
  shouldSearch: boolean;
  reasoning: string;
  intent: 'fresh_search' | 'delta_comparison' | 'fact_check' | 'conversational';
  queries: string[];
  resolvedEntities: string[];
  temporalContext: TemporalContext;
  priorContextSummary?: string;
}

export type AgentStreamEvent =
  | { type: 'status'; message: string; phase: 'init' | 'memory' | 'plan' | 'search' | 'synthesizing' | 'complete' }
  | { type: 'plan'; plan: SearchPlan }
  | { type: 'query_dispatched'; query: string; index: number; total: number }
  | { type: 'query_completed'; query: string; resultsCount: number; durationMs: number }
  | { type: 'sources_ready'; sources: SearchResult[] }
  | { type: 'delta_context'; baselineDate: string; entities: string[] }
  | { type: 'token'; token: string }
  | { type: 'complete'; message: ChatMessage }
  | { type: 'error'; message: string };

export type SearchProviderType = 'tavily' | 'brave' | 'serper' | 'duckduckgo' | 'mock';

export type LLMProviderType = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'ollama' | 'mock';

export interface AgentConfig {
  llmProvider: LLMProviderType;
  modelName: string;
  searchProvider: SearchProviderType;
  maxSearchResults: number;
  temperature: number;
  systemPrompt?: string;
}

