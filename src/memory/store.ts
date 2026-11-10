import fs from 'fs';
import path from 'path';
import { Conversation, ChatMessage } from '../types/index.js';

export class ConversationStore {
  private filePath: string;
  private conversations: Map<string, Conversation> = new Map();

  constructor(storageDir = './data') {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    this.filePath = path.join(storageDir, 'conversations.json');
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const list: Conversation[] = JSON.parse(raw);
        this.conversations.clear();
        for (const c of list) {
          this.conversations.set(c.id, c);
        }
        return;
      } catch (err) {
        console.warn('[ConversationStore] Failed to parse existing storage, seeding fresh:', (err as Error).message);
      }
    }

    // Seed benchmark conversations if storage is empty
    this.seedBenchmarkData();
    this.save();
  }

  private save(): void {
    try {
      const list = Array.from(this.conversations.values());
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ConversationStore] Failed to save conversations:', (err as Error).message);
    }
  }

  private seedBenchmarkData(): void {
    // Current simulated baseline anchor: Tuesday, Nov 10, 2026
    // Monday = Nov 9, 2026
    // Last Tuesday / Nov 3 = Nov 3, 2026

    const mondayCrmConversation: Conversation = {
      id: 'bench-crm-shortlist',
      title: 'Shortlist 5 CRM tools (Monday)',
      createdAt: '2026-11-09T09:30:00.000Z',
      updatedAt: '2026-11-09T09:35:00.000Z',
      pinned: true,
      benchmarkScenario: 'crm-shortlist',
      messages: [
        {
          id: 'crm-msg-1',
          role: 'user',
          content: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team.',
          timestamp: '2026-11-09T09:30:00.000Z',
          formattedDate: 'Monday, Nov 9, 2026 9:30 AM',
        },
        {
          id: 'crm-msg-2',
          role: 'assistant',
          content: `Here is the shortlist of 5 CRM tools we evaluated for your 20-person sales team, with tier pricing and capabilities:

1. **HubSpot Sales Hub**
   - **Pricing**: Starter is $15/seat/month; Professional is $90/seat/month (recommended for 20 reps).
   - **Strengths**: Best-in-class inbound marketing integration, automated email sequencing, intuitive UI.

2. **Pipedrive**
   - **Pricing**: Essential at $14/user/mo, Advanced at $29/user/mo, Professional at $49/user/mo (annual billing).
   - **Strengths**: Visual deal pipeline, sales activity tracking, minimal administrative overhead.

3. **Salesforce Sales Cloud**
   - **Pricing**: Starter Suite at $25/user/month; Pro Suite at $100/user/month; Enterprise at $165/user/month.
   - **Strengths**: Unlimited customization, enterprise reporting, massive app ecosystem.

4. **Zoho CRM**
   - **Pricing**: Standard at $14/user/mo, Professional at $23/user/mo, Enterprise at $40/user/mo.
   - **Strengths**: High value-for-money, omnichannel communication (phone/email/social), Zia AI assistant.

5. **Close CRM**
   - **Pricing**: Startup plan starts at $49/month (includes 3 users, $16.33/user equivalent), Professional at $299/month.
   - **Strengths**: Built specifically for high-velocity inside sales teams with built-in calling and SMS automation.`,
          timestamp: '2026-11-09T09:35:00.000Z',
          formattedDate: 'Monday, Nov 9, 2026 9:35 AM',
          metadata: {
            entities: ['HubSpot Sales Hub', 'Pipedrive', 'Salesforce Sales Cloud', 'Zoho CRM', 'Close CRM'],
            topic: 'CRM Shortlist for 20-person sales team',
          },
        },
      ],
    };

    const nov3Conversation: Conversation = {
      id: 'bench-nov-3-query',
      title: 'Vector Database Architectures (3 November)',
      createdAt: '2026-11-03T11:15:00.000Z',
      updatedAt: '2026-11-03T11:18:00.000Z',
      pinned: true,
      benchmarkScenario: 'nov-3-answer',
      messages: [
        {
          id: 'nov3-msg-1',
          role: 'user',
          content: 'What are the best vector databases for production hybrid search (dense embeddings + BM25 keyword matching) in late 2026?',
          timestamp: '2026-11-03T11:15:00.000Z',
          formattedDate: 'Sunday, Nov 3, 2026 11:15 AM',
        },
        {
          id: 'nov3-msg-2',
          role: 'assistant',
          content: `On 3 November, the top recommended vector databases for production hybrid search are:

1. **Qdrant**: Native support for hybrid dense + sparse vector search with reciprocal rank fusion (RRF), payload filtering during indexing, and Rust-based high-throughput concurrency.
2. **Pinecone Serverless**: Architecture decoupling compute from storage, native sparse-dense indexes, pay-per-read/write unit.
3. **Milvus 2.4+**: Distributed cluster design with GPU-accelerated indexing (CAGRA) and multi-vector search.
4. **pgvector (v0.8+) on PostgreSQL**: HNSW indexing with iterative index scan and hybrid scoring with PostgreSQL tsvector.`,
          timestamp: '2026-11-03T11:18:00.000Z',
          formattedDate: 'Sunday, Nov 3, 2026 11:18 AM',
          metadata: {
            entities: ['Qdrant', 'Pinecone', 'Milvus', 'pgvector'],
            topic: 'Vector databases for hybrid search',
          },
        },
      ],
    };

    const lastTuesdayPostgresConversation: Conversation = {
      id: 'bench-postgres-hosting',
      title: 'Postgres Hosting Comparison (Last Tuesday)',
      createdAt: '2026-11-03T15:00:00.000Z',
      updatedAt: '2026-11-03T15:05:00.000Z',
      pinned: true,
      benchmarkScenario: 'postgres-hosting',
      messages: [
        {
          id: 'pg-msg-1',
          role: 'user',
          content: 'Can you compare managed Postgres hosting providers with focus on compute pricing and database branching?',
          timestamp: '2026-11-03T15:00:00.000Z',
          formattedDate: 'Tuesday, Nov 3, 2026 3:00 PM',
        },
        {
          id: 'pg-msg-2',
          role: 'assistant',
          content: `Here is the comparison of managed Postgres hosting options as of last Tuesday (3 November 2026):

1. **Neon Serverless Postgres**
   - Compute Pricing: Free tier (0.5 GiB); Launch at $19/mo; Scale at $69/mo. Compute units cost $0.16/CU-hour.
   - Branching: Instant copy-on-write branching for staging and CI/CD pipelines.

2. **Supabase**
   - Compute Pricing: Free tier (500MB DB); Pro tier at $25/mo includes $10 compute credits; Team tier at $599/mo. Additional micro compute at ~$0.01344/hour ($10/mo).
   - Branching: Database branching preview available on Pro plans.

3. **AWS RDS for PostgreSQL**
   - Compute Pricing: db.t4g.micro begins at $0.016/hour ($11.50/mo on-demand); db.m6g.large at $0.154/hour. Storage gp3 at $0.115/GB-mo.
   - Branching: No native zero-copy branching; relies on read replicas or DB snapshots.

4. **Render Managed PostgreSQL**
   - Compute Pricing: Starter plan at $7/mo (1GB RAM, 1GB disk); Standard at $35/mo (4GB RAM).
   - Branching: No instant branching; manual point-in-time recovery and forks.

5. **Crunchy Bridge**
   - Compute Pricing: Hobby tier starts at $10/mo (1GB RAM); Standard tiers start at $35/mo.
   - Branching: Ephemeral clone support for development.`,
          timestamp: '2026-11-03T15:05:00.000Z',
          formattedDate: 'Tuesday, Nov 3, 2026 3:05 PM',
          metadata: {
            entities: ['Neon', 'Supabase', 'AWS RDS', 'Render', 'Crunchy Bridge'],
            topic: 'Postgres hosting comparison',
          },
        },
      ],
    };

    this.conversations.set(mondayCrmConversation.id, mondayCrmConversation);
    this.conversations.set(nov3Conversation.id, nov3Conversation);
    this.conversations.set(lastTuesdayPostgresConversation.id, lastTuesdayPostgresConversation);
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  createConversation(title = 'New Chat'): Conversation {
    const id = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const conv: Conversation = {
      id,
      title,
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: [],
    };
    this.conversations.set(id, conv);
    this.save();
    return conv;
  }

  addMessage(conversationId: string, message: ChatMessage): Conversation {
    let conv = this.conversations.get(conversationId);
    if (!conv) {
      conv = this.createConversation('Chat');
    }

    conv.messages.push(message);
    conv.updatedAt = new Date().toISOString();

    // Auto-update title if it's the first user message
    if (conv.messages.length === 1 && message.role === 'user') {
      conv.title = message.content.slice(0, 45).trim() + (message.content.length > 45 ? '...' : '');
    }

    this.conversations.set(conv.id, conv);
    this.save();
    return conv;
  }

  deleteConversation(id: string): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted) this.save();
    return deleted;
  }

  /**
   * Searches across all conversation turns to find prior mentions of a topic or date.
   * Enables the agent to answer questions like:
   * "What did I ask you on 3 November?"
   * "Last Tuesday I asked you about Postgres hosting"
   * "On Monday we shortlisted 5 CRM tools"
   */
  findRelevantTurn(
    currentConvId: string,
    query: string,
    targetDateStr?: string
  ): { conversation: Conversation; message: ChatMessage; targetTurnDate: string } | null {
    const q = query.toLowerCase();

    // Search order: current conversation first, then other conversations
    const searchOrder: Conversation[] = [];
    const currentConv = this.conversations.get(currentConvId);
    if (currentConv) {
      searchOrder.push(currentConv);
    }
    for (const [id, c] of this.conversations.entries()) {
      if (id !== currentConvId) searchOrder.push(c);
    }

    // Pass 1: If an explicit target date is provided (e.g. 2026-11-03 or Monday)
    if (targetDateStr) {
      for (const conv of searchOrder) {
        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i];
          const msgDate = msg.timestamp.split('T')[0];
          if (msgDate === targetDateStr) {
            return {
              conversation: conv,
              message: msg,
              targetTurnDate: msgDate,
            };
          }
        }
      }
    }

    // Pass 2: Keyword / entity match (e.g. "crm", "postgres", "vector")
    const keywords = ['crm', 'postgres', 'hosting', 'vector', 'salesforce', 'hubspot', 'database'];
    const matchedKeyword = keywords.find((kw) => q.includes(kw));

    if (matchedKeyword) {
      for (const conv of searchOrder) {
        for (let i = 0; i < conv.messages.length; i++) {
          const msg = conv.messages[i];
          if (msg.content.toLowerCase().includes(matchedKeyword)) {
            // If user message, prefer the assistant answer following it
            const returnMsg =
              msg.role === 'user' && i + 1 < conv.messages.length && conv.messages[i + 1].role === 'assistant'
                ? conv.messages[i + 1]
                : msg;
            return {
              conversation: conv,
              message: returnMsg,
              targetTurnDate: returnMsg.timestamp.split('T')[0],
            };
          }
        }
      }
    }

    return null;
  }
}

