/**
 * Shared domain and transport TypeScript contracts for DeltaCheck.
 */

export type SearchProviderName = 'tavily' | 'brave' | 'mock';

export type EnvPresenceSummary = Record<string, 'SET' | 'EMPTY'>;

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
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
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
    referenceDateIso?: string;
    relativeDescription?: string;
    deltaDays?: number;
    historicalTopicFound?: string | null;
    topic?: string;
    [key: string]: unknown;
  };
}

export type UserRole = 'user' | 'admin';

export interface UserRecord {
  id: string;
  username: string;
  role: UserRole;
  passwordHash: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  createdAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
}

export interface Conversation {
  id: string;
  ownerId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  scenario?: string;
}

export interface TemporalAnchor {
  currentIsoTimestamp: string;
  currentDateIso: string;
  currentDayOfWeek: string;
  currentFormatted: string;
  referenceDateIso?: string;
  referenceFormatted?: string;
  relativeDescription?: string;
  deltaDays?: number;
}

export interface MemoryMatch {
  conversation: Conversation;
  userMessage?: ChatMessage;
  assistantMessage?: ChatMessage;
  targetDate: string;
}

/**
 * Structured Stage 1 router output and resolved temporal/memory context.
 */
export interface RouterDecision {
  temporalContext: string;
  historicalTopicFound: string | null;
  requiresSearch: boolean;
  searchQueries: string[];
  temporalAnchor: TemporalAnchor;
  resolvedEntities: string[];
  historicalBaseline?: string;
  historicalUserPrompt?: string;
  sessionHistory?: string;
}

export interface AgentResponse {
  content: string;
  sources: SearchResult[];
  queries: string[];
  latencyMs: number;
  routerDecision: RouterDecision;
}

export type StreamEvent =
  | { type: 'stage'; stage: 'route'; decision: RouterDecision }
  | { type: 'stage'; stage: 'search'; queries: string[]; sources: SearchResult[] }
  | { type: 'done'; response: AgentResponse; conversation: Conversation }
  | { type: 'error'; message: string };

