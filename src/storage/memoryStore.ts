import { AuthorizationError } from '../security/errors.js';
import { resolveSafeStoragePath } from '../security/validation.js';
import { ChatMessage, Conversation, MemoryMatch } from '../types/index.js';
import {
  ensurePrivateDirectory,
  readEncryptedJsonFile,
  writeEncryptedJsonFile,
} from './jsonPersistence.js';

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
 * Persistent conversation and episodic memory repository with tenant ownership isolation
 * and optional AES-256-GCM encryption at rest.
 */
export class MemoryStore {
  public readonly filePath: string;
  private readonly persist: boolean;
  private readonly encryptionKey: Buffer | null;
  private conversations: Map<string, Conversation> = new Map();

  constructor(
    customPath = './data/agent_memory.json',
    persist = true,
    encryptionKey: Buffer | null = null
  ) {
    this.filePath = resolveSafeStoragePath(customPath);
    this.persist = persist;
    this.encryptionKey = encryptionKey;
    if (this.persist) {
      ensurePrivateDirectory(this.filePath);
    }
    this.load();
  }

  load(): void {
    const parsed = readEncryptedJsonFile<unknown>(this.filePath, this.encryptionKey);
    if (!parsed) return;

    if (!Array.isArray(parsed)) {
      console.warn('[MemoryStore] Memory file payload is not an array, ignoring.');
      return;
    }

    this.conversations.clear();
    for (const c of parsed) {
      if (c && typeof c === 'object' && typeof (c as Conversation).id === 'string') {
        const conv = c as Conversation;
        this.conversations.set(conv.id, conv);
      }
    }
  }

  save(): void {
    if (!this.persist) return;
    const list = Array.from(this.conversations.values());
    writeEncryptedJsonFile(this.filePath, list, this.encryptionKey);
  }

  listConversations(ownerId?: string): Conversation[] {
    return Array.from(this.conversations.values())
      .filter((c) => ownerId === undefined || c.ownerId === ownerId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  getConversationCount(ownerId?: string): number {
    if (ownerId === undefined) return this.conversations.size;
    let count = 0;
    for (const c of this.conversations.values()) {
      if (c.ownerId === ownerId) count += 1;
    }
    return count;
  }

  getTotalMessageCount(): number {
    let total = 0;
    for (const c of this.conversations.values()) {
      total += c.messages.length;
    }
    return total;
  }

  getConversation(id: string, ownerId?: string): Conversation | undefined {
    const conv = this.conversations.get(id);
    if (!conv) return undefined;
    if (ownerId !== undefined && conv.ownerId !== ownerId) {
      return undefined;
    }
    return conv;
  }

  createConversation(
    id: string,
    title: string,
    scenario?: string,
    timestamps?: { createdAt?: string; updatedAt?: string },
    ownerId?: string
  ): Conversation {
    const existing = this.conversations.get(id);
    if (existing && ownerId !== undefined && existing.ownerId !== ownerId) {
      throw new AuthorizationError('Access denied for this conversation ID');
    }

    const now = new Date().toISOString();
    const conv: Conversation = {
      id,
      ...(ownerId !== undefined ? { ownerId } : {}),
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

  deleteConversation(id: string, ownerId?: string): boolean {
    const existing = this.conversations.get(id);
    if (!existing) return false;
    if (ownerId !== undefined && existing.ownerId !== ownerId) {
      return false;
    }
    const deleted = this.conversations.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  deleteConversationsByOwner(ownerId: string): number {
    let count = 0;
    for (const [id, conv] of this.conversations.entries()) {
      if (conv.ownerId === ownerId) {
        this.conversations.delete(id);
        count += 1;
      }
    }
    if (count > 0) {
      this.save();
    }
    return count;
  }

  addMessage(
    conversationId: string,
    message: ChatMessage,
    preserveUpdatedAt = false,
    ownerId?: string
  ): void {
    let conv = this.conversations.get(conversationId);
    if (conv && ownerId !== undefined && conv.ownerId !== ownerId) {
      throw new AuthorizationError('Access denied to conversation');
    }
    if (!conv) {
      const initialTitle =
        message.role === 'user' ? MemoryStore.summarizeTitle(message.content) : 'New thread';
      conv = this.createConversation(conversationId, initialTitle, undefined, undefined, ownerId);
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
   * or token overlap across conversations accessible to ownerId.
   */
  findTurnByDateOrEntity(
    query: string,
    targetDateIso?: string,
    excludeConversationId?: string,
    ownerId?: string
  ): MemoryMatch | null {
    const allConvs = Array.from(this.conversations.values()).filter(
      (c) =>
        (!excludeConversationId || c.id !== excludeConversationId) &&
        (ownerId === undefined || c.ownerId === ownerId)
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

  ensureSeeded(seedFn: () => Conversation[]): boolean {
    if (this.conversations.size > 0) return false;
    for (const conv of seedFn()) {
      this.conversations.set(conv.id, conv);
    }
    this.save();
    return true;
  }
}

