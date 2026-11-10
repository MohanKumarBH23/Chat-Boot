import 'dotenv/config';
import { MemoryStore } from './memory.js';
import { Conversation } from './types.js';

export function getBenchmarkSeedData(): Conversation[] {
  // Anchored relative to Tuesday, 10 November 2026
  // Monday = 2026-11-09
  // 3 November (Last Tuesday) = 2026-11-03

  const mondayCrmConv: Conversation = {
    id: 'conv-monday-crm-shortlist',
    title: 'Shortlist 5 CRM tools for 20-person sales team',
    createdAt: '2026-11-09T09:30:00.000Z',
    updatedAt: '2026-11-09T09:35:00.000Z',
    scenario: 'crm-shortlist',
    messages: [
      {
        id: 'msg-crm-u1',
        role: 'user',
        content: 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Can you summarize their pricing tiers and capabilities?',
        timestamp: '2026-11-09T09:30:00.000Z',
      },
      {
        id: 'msg-crm-a1',
        role: 'assistant',
        content: `Here is the shortlist of 5 CRM tools evaluated for your 20-person sales team, along with verified baseline pricing and capabilities as of Monday, 9 November 2026:

1. **HubSpot Sales Hub**
   - **Pricing**: Starter is $15/seat/month; Professional is $90/seat/month billed annually.
   - **Key Features**: Inbound marketing alignment, visual deal pipeline, automated email sequences.

2. **Pipedrive**
   - **Pricing**: Essential at $14/user/mo, Advanced at $29/user/mo, Professional at $49/user/mo.
   - **Key Features**: Activity-based selling, pipeline stages, low administrative overhead.

3. **Salesforce Sales Cloud**
   - **Pricing**: Starter Suite at $25/user/month; Pro Suite at $100/user/month; Enterprise at $165/user/month.
   - **Key Features**: Deep ecosystem, customizable workflow rules, enterprise forecasting.

4. **Freshsales (Freshworks CRM)**
   - **Pricing**: Growth at $9/user/mo, Pro at $39/user/mo, Enterprise at $59/user/mo (annual billing).
   - **Key Features**: Freddy AI lead scoring, built-in cloud telephony, deal analytics.

5. **Close CRM**
   - **Pricing**: Startup plan at $49/month (includes 3 seats, $16.33/user equivalent); Professional at $299/month.
   - **Key Features**: Built for high-velocity inside sales teams with multi-channel sequences and calling.`,
        timestamp: '2026-11-09T09:35:00.000Z',
        metadata: {
          entities: ['HubSpot Sales Hub', 'Pipedrive', 'Salesforce Sales Cloud', 'Freshsales', 'Close CRM'],
          topic: 'CRM Shortlist for 20-person sales team',
        },
      },
    ],
  };

  const nov3PostgresConv: Conversation = {
    id: 'conv-nov3-postgres-hosting',
    title: 'Managed Postgres Hosting Comparison',
    createdAt: '2026-11-03T14:15:00.000Z',
    updatedAt: '2026-11-03T14:20:00.000Z',
    scenario: 'postgres-hosting',
    messages: [
      {
        id: 'msg-pg-u1',
        role: 'user',
        content: 'Can you compare managed Postgres hosting providers with focus on compute pricing and database branching?',
        timestamp: '2026-11-03T14:15:00.000Z',
      },
      {
        id: 'msg-pg-a1',
        role: 'assistant',
        content: `Here is the comparison of managed Postgres hosting options as of Tuesday, 3 November 2026:

1. **Supabase**
   - **Compute Pricing**: Free tier includes 500MB database; Pro tier at $25/month includes $10 compute credit; Team tier at $599/month. Additional micro compute at ~$0.01344/hr (~$10/month).
   - **Branching**: Branching preview available for Pro plans.

2. **Neon Serverless Postgres**
   - **Compute Pricing**: Free tier with 0.5 GiB storage; Launch tier at $19/mo; Scale tier at $69/mo. Compute units bill at $0.16/CU-hour.
   - **Branching**: Instant copy-on-write database branching for preview environments and CI/CD.

3. **Crunchy Bridge**
   - **Compute Pricing**: Hobby instances start at $10/mo (1GB RAM); Standard production tiers start at $35/mo.
   - **Branching**: Ephemeral database forks and disaster recovery failover.

4. **AWS RDS for PostgreSQL**
   - **Compute Pricing**: db.t4g.micro starts at $0.016/hour (~$11.52/month on-demand); General Purpose SSD (gp3) at $0.115/GB-mo.
   - **Branching**: No instant zero-copy branching; relies on read replicas and snapshot restores.`,
        timestamp: '2026-11-03T14:20:00.000Z',
        metadata: {
          entities: ['Supabase', 'Neon', 'Crunchy Bridge', 'AWS RDS'],
          topic: 'Managed Postgres Hosting Comparison',
        },
      },
    ],
  };

  return [mondayCrmConv, nov3PostgresConv];
}

export function runSeed(customPath?: string): void {
  const store = new MemoryStore(customPath);
  const data = getBenchmarkSeedData();
  for (const conv of data) {
    // Upsert conversation
    const existing = store.getConversation(conv.id);
    if (!existing) {
      store.createConversation(conv.id, conv.title, conv.scenario);
      for (const msg of conv.messages) {
        store.addMessage(conv.id, msg);
      }
    }
  }
  console.log(`[Seed] Successfully seeded ${data.length} benchmark conversations into ${store['filePath']}`);
}

// Execute if run directly
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed();
}

