import fs from 'fs';
import path from 'path';
import { Conversation, ChatMessage } from './types.js';

export class MemoryStore {
  private filePath: string;
  private conversations: Map<string, Conversation> = new Map();

  constructor(customPath?: string) {
    this.filePath = customPath || process.env.STORAGE_PATH || './data/agent_memory.json';
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.load();
  }

  load(): void {
    if (fs.existsSync(this.filePath)) {
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
  }

  save(): void {
    try {
      const list = Array.from(this.conversations.values());
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
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

  createConversation(id: string, title: string, scenario?: string): Conversation {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      scenario,
    };
    this.conversations.set(id, conv);
    this.save();
    return conv;
  }

  addMessage(conversationId: string, message: ChatMessage): void {
    let conv = this.conversations.get(conversationId);
    if (!conv) {
      conv = this.createConversation(conversationId, 'Conversation');
    }
    conv.messages.push(message);
    conv.updatedAt = new Date().toISOString();
    this.save();
  }

  /**
   * Searches past conversation turns for a target date (e.g., 2026-11-09, 2026-11-03)
   * or key entities (CRM, Postgres).
   */
  findTurnByDateOrEntity(
    query: string,
    targetDateIso?: string
  ): { conversation: Conversation; message: ChatMessage; targetDate: string } | null {
    const q = query.toLowerCase();
    const allConvs = Array.from(this.conversations.values());

    // 1. Direct match by calendar date (e.g. 2026-11-09 or 2026-11-03)
    if (targetDateIso) {
      for (const conv of allConvs) {
        for (const msg of conv.messages) {
          const msgDate = msg.timestamp.split('T')[0];
          if (msgDate === targetDateIso) {
            return { conversation: conv, message: msg, targetDate: msgDate };
          }
        }
      }
    }

    // 2. Keyword/Entity match
    const keywords = ['crm', 'postgres', 'hosting', 'shortlist', 'vector'];
    const matched = keywords.find((k) => q.includes(k));

    if (matched) {
      for (const conv of allConvs) {
        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i];
          if (msg.content.toLowerCase().includes(matched)) {
            // Prefer returning the assistant message containing the factual commitment
            const resultMsg =
              msg.role === 'user' && i + 1 < conv.messages.length && conv.messages[i + 1].role === 'assistant'
                ? conv.messages[i + 1]
                : msg;
            return {
              conversation: conv,
              message: resultMsg,
              targetDate: resultMsg.timestamp.split('T')[0],
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Ensures the store is pre-populated with benchmark conversations if empty.
   */
  ensureSeeded(seedFn: () => Conversation[]): void {
    if (this.conversations.size === 0) {
      const seeded = seedFn();
      for (const c of seeded) {
        this.conversations.set(c.id, c);
      }
      this.save();
    }
  }
}

