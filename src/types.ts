/**
 * Core type contracts for the CLI Search Agent.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  canonicalUrl: string;
  domain: string;
}

export interface ISearchClient {
  readonly name: string;
  search(query: string, limit?: number): Promise<SearchResult[]>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string; // ISO-8601
  sources?: SearchResult[];
  queries?: string[];
  latencyMs?: number;
  metadata?: {
    entities?: string[];
    temporalAnchor?: string;
    topic?: string;
    [key: string]: unknown;
  };
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  scenario?: string;
}

export interface TemporalAnchor {
  currentDateIso: string;
  currentDayOfWeek: string;
  currentFormatted: string;
  referenceDateIso?: string;
  referenceFormatted?: string;
  relativeDescription?: string;
  deltaDays?: number;
}

export interface RouterDecision {
  shouldSearch: boolean;
  reasoning: string;
  temporalAnchor: TemporalAnchor;
  resolvedEntities: string[];
  historicalBaseline?: string;
  queries: string[];
}

export interface AgentResponse {
  content: string;
  sources: SearchResult[];
  queries: string[];
  latencyMs: number;
  routerDecision: RouterDecision;
}

