import 'dotenv/config';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearchClient } from './search.js';
import { MemoryStore } from './memory.js';
import { SearchAgent } from './agent.js';
import { seedDataset } from './seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function resolveUiDir(): string {
  const localUi = path.join(__dirname, 'ui');
  if (fs.existsSync(localUi)) return localUi;
  return path.resolve(process.cwd(), 'src', 'ui');
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function serveStatic(res: ServerResponse, uiDir: string, reqPath: string): void {
  const cleanRel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const safePath = path.normalize(cleanRel).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(uiDir, safePath);

  if (!fullPath.startsWith(uiDir) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    const indexFallback = path.join(uiDir, 'index.html');
    if (fs.existsSync(indexFallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      fs.createReadStream(indexFallback).pipe(res);
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const ext = path.extname(fullPath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(fullPath).pipe(res);
}

export function createAppServer(options?: {
  port?: number;
  memoryStore?: MemoryStore;
  searchProvider?: string;
  simulatedDate?: Date;
}) {
  const memoryStore = options?.memoryStore ?? new MemoryStore();
  seedDataset(memoryStore, false);
  const searchClient = createSearchClient(options?.searchProvider);
  const agent = new SearchAgent({
    searchClient,
    memoryStore,
    simulatedDate: options?.simulatedDate,
  });
  const uiDir = resolveUiDir();

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;

    try {
      if (method === 'GET' && pathname === '/api/health') {
        const anchor = agent.getTemporalAnchor('');
        sendJson(res, 200, {
          status: 'ok',
          searchProvider: agent.searchProviderName,
          llmConfigured: agent.isLlmConfigured,
          model: agent.modelName,
          currentDateIso: anchor.currentDateIso,
          currentFormatted: anchor.currentFormatted,
          conversationCount: memoryStore.listConversations().length,
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/conversations') {
        sendJson(res, 200, memoryStore.listConversations());
        return;
      }

      if (method === 'POST' && pathname === '/api/conversations') {
        const body = await readJsonBody(req);
        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'New thread';
        const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const conv = memoryStore.createConversation(id, title);
        sendJson(res, 201, conv);
        return;
      }

      const convMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
      if (convMatch) {
        const convId = decodeURIComponent(convMatch[1]);
        if (method === 'GET') {
          const conv = memoryStore.getConversation(convId);
          if (!conv) {
            sendJson(res, 404, { error: 'Conversation not found' });
            return;
          }
          sendJson(res, 200, conv);
          return;
        }
        if (method === 'DELETE') {
          const deleted = memoryStore.deleteConversation(convId);
          if (!deleted) {
            sendJson(res, 404, { error: 'Conversation not found' });
            return;
          }
          sendJson(res, 200, { success: true });
          return;
        }
      }

      const msgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
      if (method === 'POST' && msgMatch) {
        const convId = decodeURIComponent(msgMatch[1]);
        const body = await readJsonBody(req);
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) {
          sendJson(res, 400, { error: 'Message content is required' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        try {
          await agent.processWithEvents(content, convId, (event) => {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          });
        } catch (err) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
        } finally {
          res.end();
        }
        return;
      }

      if (method === 'POST' && pathname === '/api/search') {
        const body = await readJsonBody(req);
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (!query) {
          sendJson(res, 400, { error: 'Query is required' });
          return;
        }
        const maxResults = typeof body.maxResults === 'number' ? body.maxResults : 5;
        const results = await searchClient.search(query, maxResults);
        sendJson(res, 200, { query, provider: searchClient.name, results });
        return;
      }

      if (method === 'GET' && !pathname.startsWith('/api/')) {
        serveStatic(res, uiDir, pathname);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message || 'Internal server error' });
    }
  };

  const server = http.createServer((req, res) => {
    void handleRequest(req, res);
  });

  return { server, handleRequest, agent, memoryStore };
}

const isEntrypoint =
  process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');

if (isEntrypoint) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const { server, agent } = createAppServer({ port });
  server.listen(port, () => {
    console.log(
      `DeltaCheck listening on http://localhost:${port} (${agent.searchProviderName} · ${agent.modelName})`
    );
  });
}

