import { ISearchClient, SearchResult } from '../../types/index.js';

const CRM_FIXTURES: SearchResult[] = [
  {
    title: 'HubSpot Sales Hub - Official Pricing & Feature Release Notes 2026',
    url: 'https://www.hubspot.com/pricing/sales-hub',
    canonicalUrl: 'https://www.hubspot.com/pricing/sales-hub',
    snippet:
      'HubSpot Sales Hub: Starter remains at $15/seat/month; Professional remains at $90/seat/month billed annually. Shipped Breeze AI Copilot integration for automatic deal scoring. No base subscription price changes announced this week.',
    publishedDate: '2026-11-09',
    domain: 'hubspot.com',
  },
  {
    title: 'Pipedrive Pricing - Sales Pipeline CRM Plans',
    url: 'https://www.pipedrive.com/en/pricing',
    canonicalUrl: 'https://www.pipedrive.com/en/pricing',
    snippet:
      'Pipedrive pricing: Essential is $14/user/mo, Advanced is $29/user/mo, and Professional at $49/user/mo. Pricing has stayed unchanged since early November. Released Smart Docs 2.0 collaborative editor.',
    publishedDate: '2026-11-09',
    domain: 'pipedrive.com',
  },
  {
    title: 'Salesforce Sales Cloud Editions and Pricing',
    url: 'https://www.salesforce.com/editions-pricing/sales-cloud',
    canonicalUrl: 'https://www.salesforce.com/editions-pricing/sales-cloud',
    snippet:
      'Salesforce Sales Cloud: Starter Suite is $25/user/month; Pro Suite is $100/user/month; Enterprise is $165/user/month. Released Agentforce autonomous sales SDR agents to general availability. No tier price increases recorded.',
    publishedDate: '2026-11-08',
    domain: 'salesforce.com',
  },
  {
    title: 'Freshsales Pricing - Modern Sales CRM by Freshworks',
    url: 'https://www.freshworks.com/crm/sales/pricing',
    canonicalUrl: 'https://www.freshworks.com/crm/sales/pricing',
    snippet:
      'Freshsales pricing: Growth plan at $9/user/mo, Pro plan at $39/user/mo, Enterprise plan at $59/user/mo (billed annually). Pricing remains constant; Freddy AI automated lead scoring update deployed.',
    publishedDate: '2026-11-07',
    domain: 'freshworks.com',
  },
  {
    title: 'Close CRM Pricing - Built for Inside Sales Teams',
    url: 'https://www.close.com/pricing',
    canonicalUrl: 'https://www.close.com/pricing',
    snippet:
      'Close CRM: Startup tier at $49/month (includes 3 seats, $16.33/user equivalent); Professional at $299/month. Core pricing unchanged. Enhanced built-in SMS and multi-channel sequence engine.',
    publishedDate: '2026-11-06',
    domain: 'close.com',
  },
];

const POSTGRES_FIXTURES: SearchResult[] = [
  {
    title: 'Supabase Pricing - Managed Postgres & Storage',
    url: 'https://supabase.com/pricing',
    canonicalUrl: 'https://supabase.com/pricing',
    snippet:
      'Supabase Free plan (500MB database, 50k MAU); Pro plan at $25/month including $10 compute credit; Team plan at $599/month. Additional micro compute at $0.01344/hr (~$10/mo). Compute pricing and branching quotas remain identical to last week.',
    publishedDate: '2026-11-08',
    domain: 'supabase.com',
  },
  {
    title: 'Neon Serverless Postgres Pricing & Autoscaling Rates',
    url: 'https://neon.tech/pricing',
    canonicalUrl: 'https://neon.tech/pricing',
    snippet:
      'Neon Serverless Postgres: Free tier (0.5 GiB); Launch tier at $19/mo; Scale tier at $69/mo. Compute units cost $0.16/CU-hour. Copy-on-write branching remains free for development branches. No pricing changes since 3 November.',
    publishedDate: '2026-11-09',
    domain: 'neon.tech',
  },
  {
    title: 'Crunchy Bridge - Fully Managed Cloud Postgres Pricing',
    url: 'https://www.crunchydata.com/products/crunchy-bridge/pricing',
    canonicalUrl: 'https://www.crunchydata.com/products/crunchy-bridge/pricing',
    snippet:
      'Crunchy Bridge: Hobby instances start at $10/mo (1GB RAM); Standard production clusters start at $35/mo. Support for high availability failover and ephemeral forks. Pricing confirmed unchanged.',
    publishedDate: '2026-11-07',
    domain: 'crunchydata.com',
  },
  {
    title: 'Amazon RDS for PostgreSQL Pricing - AWS',
    url: 'https://aws.amazon.com/rds/postgresql/pricing',
    canonicalUrl: 'https://aws.amazon.com/rds/postgresql/pricing',
    snippet:
      'AWS RDS PostgreSQL: On-demand db.t4g.micro begins at $0.016/hour (~$11.52/month in us-east-1). General Purpose SSD (gp3) storage at $0.115/GB-month. No rate adjustments in November 2026.',
    publishedDate: '2026-11-05',
    domain: 'aws.amazon.com',
  },
];

function filterFixtures(
  fixtures: SearchResult[],
  queryLower: string,
  entityKeys: string[],
  maxResults: number
): SearchResult[] {
  const matchedKeys = entityKeys.filter((key) => queryLower.includes(key));
  if (matchedKeys.length === 0) {
    return fixtures.slice(0, maxResults);
  }
  const matched = fixtures.filter((item) => {
    const text = `${item.title} ${item.snippet} ${item.domain}`.toLowerCase();
    return matchedKeys.some((key) => text.includes(key));
  });
  return (matched.length > 0 ? matched : fixtures).slice(0, maxResults);
}

/**
 * Offline fixture search client returning empty results on unmatched topics
 * instead of fabricating synthetic URLs.
 */
export class MockSearchClient implements ISearchClient {
  readonly name = 'mock';

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const q = query.toLowerCase();
    const crmKeys = ['hubspot', 'pipedrive', 'salesforce', 'freshsales', 'close'];
    const pgKeys = ['supabase', 'neon', 'crunchy', 'rds'];

    if (q.includes('crm') || crmKeys.some((k) => q.includes(k))) {
      return filterFixtures(CRM_FIXTURES, q, crmKeys, maxResults);
    }

    if (q.includes('postgres') || pgKeys.some((k) => q.includes(k))) {
      return filterFixtures(POSTGRES_FIXTURES, q, pgKeys, maxResults);
    }

    return [];
  }
}

