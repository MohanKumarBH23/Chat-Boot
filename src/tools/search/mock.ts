import { ISearchProvider, SearchOptions, extractDomain } from './provider.js';
import { SearchResult } from '../../types/index.js';

export class MockSearchProvider implements ISearchProvider {
  readonly name = 'mock';

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, _options?: SearchOptions): Promise<SearchResult[]> {
    const q = query.toLowerCase();

    // CRM Tools Shortlist Mock Data
    if (q.includes('crm') || q.includes('hubspot') || q.includes('salesforce') || q.includes('pipedrive')) {
      return [
        {
          title: 'HubSpot Sales Hub - Pricing & Product Changelog 2026',
          url: 'https://www.hubspot.com/pricing/sales-hub',
          snippet:
            'HubSpot Sales Hub pricing: Starter tier begins at $15/seat/month; Professional tier at $90/seat/month. Recent updates introduced Breeze AI Copilot integration for automated deal scoring, with no tier price increases this week.',
          publishedDate: '2026-11-09',
          domain: 'hubspot.com',
          sourceProvider: 'mock',
        },
        {
          title: 'Pipedrive Pricing Plans - Sales Pipeline CRM for Growing Teams',
          url: 'https://www.pipedrive.com/en/pricing',
          snippet:
            'Pipedrive pricing: Essential is $14/user/mo, Advanced is $29/user/mo, and Professional is $49/user/mo billed annually. No price changes occurred since early November. Shipped AI Smart Docs v2.',
          publishedDate: '2026-11-08',
          domain: 'pipedrive.com',
          sourceProvider: 'mock',
        },
        {
          title: 'Salesforce Sales Cloud Pricing & Release Notes',
          url: 'https://www.salesforce.com/editions-pricing/sales-cloud',
          snippet:
            'Salesforce Starter Suite remains at $25/user/month; Pro Suite at $100/user/month. Enterprise at $165/user/month. Agentforce sales SDR autonomous agents deployed to general availability.',
          publishedDate: '2026-11-07',
          domain: 'salesforce.com',
          sourceProvider: 'mock',
        },
        {
          title: 'Zoho CRM Pricing Plans & Features 2026',
          url: 'https://www.zoho.com/crm/zohocrm-pricing.html',
          snippet:
            'Zoho CRM Standard at $14/user/mo, Professional at $23/user/mo, and Enterprise at $40/user/mo. Pricing stable; recently announced enhanced Zia AI conversational analytics.',
          publishedDate: '2026-11-06',
          domain: 'zoho.com',
          sourceProvider: 'mock',
        },
        {
          title: 'Close CRM Pricing - Built for Inside Sales Teams',
          url: 'https://www.close.com/pricing',
          snippet:
            'Close CRM Startup plan starts at $49/month (includes 3 users, $16.33/user equivalent), Professional at $299/month (includes 3 users). Pricing remains steady.',
          publishedDate: '2026-11-05',
          domain: 'close.com',
          sourceProvider: 'mock',
        },
      ];
    }

    // Postgres Hosting Mock Data
    if (q.includes('postgres') || q.includes('neon') || q.includes('supabase') || q.includes('rds')) {
      return [
        {
          title: 'Supabase Pricing - Open Source Firebase Alternative with Postgres',
          url: 'https://supabase.com/pricing',
          snippet:
            'Supabase Free tier (500MB database, 50k MAU), Pro tier $25/mo includes $10 compute credits with pooled IPv4, Team tier $599/mo. Compute pricing unchanged; branch preview limits unchanged.',
          publishedDate: '2026-11-08',
          domain: 'supabase.com',
          sourceProvider: 'mock',
        },
        {
          title: 'Neon Serverless Postgres Pricing & Autoscaling Rates',
          url: 'https://neon.tech/pricing',
          snippet:
            'Neon Serverless Postgres: Free tier with 0.5 GiB storage; Launch plan at $19/mo; Scale plan at $69/mo. Compute billed per compute unit ($0.16/CU-hour). No pricing modifications recorded since last week.',
          publishedDate: '2026-11-09',
          domain: 'neon.tech',
          sourceProvider: 'mock',
        },
        {
          title: 'AWS RDS for PostgreSQL Pricing - Amazon Web Services',
          url: 'https://aws.amazon.com/rds/postgresql/pricing',
          snippet:
            'Amazon RDS for PostgreSQL: On-demand db.t4g.micro starts at $0.016/hour ($11.50/mo). Multi-AZ replication doubles compute cost. Storage $0.115/GB-mo for gp3. No pricing change in November.',
          publishedDate: '2026-11-04',
          domain: 'aws.amazon.com',
          sourceProvider: 'mock',
        },
        {
          title: 'Render PostgreSQL Managed Database Pricing',
          url: 'https://render.com/pricing#databases',
          snippet:
            'Render Managed PostgreSQL: Starter DB at $7/mo (1GB RAM, 1GB disk); Standard DB at $35/mo (4GB RAM). Point-in-time recovery included on standard plans. Unchanged.',
          publishedDate: '2026-11-05',
          domain: 'render.com',
          sourceProvider: 'mock',
        },
      ];
    }

    // Generic Mock Data
    return [
      {
        title: `Search results for: ${query}`,
        url: `https://example.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Latest comprehensive web indexing and official updates regarding ${query}. All specifications, changelogs, and documentation verified up to current date.`,
        publishedDate: '2026-11-10',
        domain: 'example.com',
        sourceProvider: 'mock',
      },
    ];
  }
}

