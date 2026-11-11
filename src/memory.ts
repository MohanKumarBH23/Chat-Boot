import fs from 'fs';
import path from 'path';
import { Conversation, ChatMessage, MemoryMatch } from './types.js';

const STOPWORDS = new Set([
  'what', 'when', 'where', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'have', 'has', 'had', 'about', 'since', 'then', 'today', 'yesterday', 'monday',
  'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'last',
  'november', 'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'december', 'asked', 'answer', 'still', 'correct',
  'changed', 'change', 'pricing', 'price', 'shipped', 'something', 'anything', 'any',
  'them', 'your', 'you', 'our', 'for', 'with', 'from', 'into', 'are', 'was',
  'were', 'did', 'does', 'shortlisted', 'latest', 'release', 'released', 'update',
  'updates', 'version', 'features', 'current', 'compare', 'check',
]);

function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function scoreMessageMatch(conv: Conversation, msg: ChatMessage, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const titleAndEntities = `${conv.title} ${msg.metadata?.entities?.join(' ') || ''}`.toLowerCase();
  const body = msg.content.toLowerCase();
  let score = 0;
  for (const tok of tokens) {
    if (titleAndEntities.includes(tok)) {
      score += 2;
    } else if (body.includes(tok)) {
      score += 1;
    }
  }
  return score;
}

/**
 * JSON-backed conversation store with date and entity recall.
 */
export class MemoryStore {
  public readonly filePath: string;
  private readonly persist: boolean;
  private conversations: Map<string, Conversation> = new Map();

  constructor(customPath?: string, persist = true) {
    this.filePath = customPath || process.env.STORAGE_PATH || './data/agent_memory.json';
    this.persist = persist;
    if (this.persist) {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.load();
  }

  load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const list: Conversation[] = JSON.parse(raw);
      this.conversations.clear();
      for (const c of list) {
        this.conversations.set(c.id, c);
      }
    } catch (err) {
      console.warn('[MemoryStore] Failed to parse memory file, initializing empty store:', (err as Error).message);
    }
  }

  /**
   * Writes state via a temporary file and rename to avoid partial writes on crash.
   */
  save(): void {
    if (!this.persist) return;
    const tmpPath = `${this.filePath}.tmp`;
    try {
      const list = Array.from(this.conversations.values());
      fs.writeFileSync(tmpPath, JSON.stringify(list, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {
          // ignore cleanup failure
        }
      }
      console.error('[MemoryStore] Failed to write memory file:', (err as Error).message);
    }
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  createConversation(
    id: string,
    title: string,
    scenario?: string,
    timestamps?: { createdAt?: string; updatedAt?: string }
  ): Conversation {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id,
      title,
      createdAt: timestamps?.createdAt || now,
      updatedAt: timestamps?.updatedAt || timestamps?.createdAt || now,
      messages: [],
      scenario,
    };
    this.conversations.set(id, conv);
    this.save();
    return conv;
  }

  deleteConversation(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  addMessage(conversationId: string, message: ChatMessage, preserveUpdatedAt = false): void {
    let conv = this.conversations.get(conversationId);
    if (!conv) {
      const initialTitle =
        message.role === 'user' ? MemoryStore.summarizeTitle(message.content) : 'New thread';
      conv = this.createConversation(conversationId, initialTitle);
    } else if (
      (conv.title === 'New thread' || conv.title === 'Conversation') &&
      message.role === 'user' &&
      conv.messages.length === 0
    ) {
      conv.title = MemoryStore.summarizeTitle(message.content);
    }

    conv.messages.push(message);
    if (!preserveUpdatedAt) {
      conv.updatedAt = message.timestamp || new Date().toISOString();
    }
    this.save();
  }

  static summarizeTitle(text: string): string {
    const clean = text.trim().replace(/\s+/g, ' ');
    if (clean.length <= 56) return clean || 'New thread';
    return `${clean.slice(0, 53).trimEnd()}...`;
  }

  private extractTurnPair(conv: Conversation, index: number): MemoryMatch {
    const msg = conv.messages[index];
    let userMessage: ChatMessage | undefined;
    let assistantMessage: ChatMessage | undefined;

    if (msg.role === 'user') {
      userMessage = msg;
      if (index + 1 < conv.messages.length && conv.messages[index + 1].role === 'assistant') {
        assistantMessage = conv.messages[index + 1];
      }
    } else if (msg.role === 'assistant') {
      assistantMessage = msg;
      if (index - 1 >= 0 && conv.messages[index - 1].role === 'user') {
        userMessage = conv.messages[index - 1];
      }
    }

    return {
      conversation: conv,
      userMessage,
      assistantMessage,
      targetDate: (assistantMessage || userMessage || msg).timestamp.split('T')[0],
    };
  }

  /**
   * Finds the most relevant prior turn matching a calendar date (when given)
   * or token overlap across conversation content, entities, and titles.
   */
  findTurnByDateOrEntity(
    query: string,
    targetDateIso?: string,
    excludeConversationId?: string
  ): MemoryMatch | null {
    const allConvs = Array.from(this.conversations.values()).filter(
      (c) => !excludeConversationId || c.id !== excludeConversationId
    );
    const tokens = tokenizeQuery(query);

    if (targetDateIso) {
      const dateCandidates: Array<{ score: number; timestamp: number; match: MemoryMatch }> = [];

      for (const conv of allConvs) {
        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i];
          if (msg.timestamp.split('T')[0] === targetDateIso) {
            dateCandidates.push({
              score: scoreMessageMatch(conv, msg, tokens),
              timestamp: new Date(msg.timestamp).getTime(),
              match: this.extractTurnPair(conv, i),
            });
          }
        }
      }

      if (dateCandidates.length > 0) {
        dateCandidates.sort((a, b) => b.score - a.score || b.timestamp - a.timestamp);
        return dateCandidates[0].match;
      }
    }

    if (tokens.length === 0) return null;

    let bestMatch: { score: number; timestamp: number; match: MemoryMatch } | null = null;
    for (const conv of allConvs) {
      for (let i = 0; i < conv.messages.length; i++) {
        const msg = conv.messages[i];
        const score = scoreMessageMatch(conv, msg, tokens);
        const timestamp = new Date(msg.timestamp).getTime();
        // Without an explicit date anchor, require at least 2 points (e.g. a title/entity hit or two body matches).
        if (
          score >= 2 &&
          (!bestMatch || score > bestMatch.score || (score === bestMatch.score && timestamp > bestMatch.timestamp))
        ) {
          bestMatch = { score, timestamp, match: this.extractTurnPair(conv, i) };
        }
      }
    }

    return bestMatch ? bestMatch.match : null;
  }

  /**
   * Populates the store if empty while preserving original conversation timestamps.
   */
  ensureSeeded(seedFn: () => Conversation[]): boolean {
    if (this.conversations.size > 0) return false;
    for (const conv of seedFn()) {
      this.conversations.set(conv.id, conv);
    }
    this.save();
    return true;
  }
}
