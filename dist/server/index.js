import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { SearchAgent } from '../agent/index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
app.use(cors());
app.use(express.json());
// Serve static frontend UI
const uiPath = path.join(__dirname, '../ui');
app.use(express.static(uiPath));
// Initialize Search Agent
const agent = new SearchAgent();
// Health & Telemetry Endpoint
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        searchProvider: agent.searchTool.getProviderName(),
        llmProvider: agent.llm.getProvider(),
        llmModel: agent.llm.getModelName(),
        currentTimestamp: agent.temporalReasoner.getCurrentDate().toISOString(),
        formattedDate: agent.temporalReasoner.formatHuman(agent.temporalReasoner.getCurrentDate()),
    });
});
// List Conversations
app.get('/api/conversations', (_req, res) => {
    const conversations = agent.memoryStore.listConversations();
    res.json(conversations);
});
// Create Conversation
app.post('/api/conversations', (req, res) => {
    const title = req.body.title || 'New Conversation';
    const conv = agent.memoryStore.createConversation(title);
    res.status(201).json(conv);
});
// Get Conversation
app.get('/api/conversations/:id', (req, res) => {
    const convId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conv = agent.memoryStore.getConversation(convId);
    if (!conv) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
    }
    res.json(conv);
});
// Delete Conversation
app.delete('/api/conversations/:id', (req, res) => {
    const convId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deleted = agent.memoryStore.deleteConversation(convId);
    if (!deleted) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
    }
    res.json({ success: true });
});
// Send Message & Stream Agent Execution (SSE)
app.post('/api/conversations/:id/messages', async (req, res) => {
    const conversationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const userContent = req.body.content;
    if (!userContent || typeof userContent !== 'string' || !userContent.trim()) {
        res.status(400).json({ error: 'Message content is required' });
        return;
    }
    // Set SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    try {
        for await (const event of agent.chatStream(conversationId, userContent.trim())) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
    }
    catch (err) {
        const errorMsg = err.message || 'Internal agent error';
        res.write(`data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`);
    }
    finally {
        res.end();
    }
});
// Direct Web Search Tool Endpoint (for testing and tool inspection)
app.post('/api/search', async (req, res) => {
    const query = req.body.query;
    if (!query) {
        res.status(400).json({ error: 'Query is required' });
        return;
    }
    try {
        const results = await agent.searchTool.search(query, {
            maxResults: req.body.maxResults || 5,
        });
        res.json({
            query,
            provider: agent.searchTool.getProviderName(),
            results,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Fallback to index.html for SPA routing
app.get('*', (_req, res) => {
    res.sendFile(path.join(uiPath, 'index.html'));
});
// Start Server
app.listen(PORT, () => {
    console.log(`\n=========================================================`);
    console.log(`🚀 Antigravity Web Search Agent is running!`);
    console.log(`🌐 Web UI:        http://localhost:${PORT}`);
    console.log(`🔍 Search Tool:   ${agent.searchTool.getProviderName().toUpperCase()}`);
    console.log(`🤖 LLM Model:     ${agent.llm.getModelName()} (${agent.llm.getProvider()})`);
    console.log(`📅 Current Date:  ${agent.temporalReasoner.formatHuman(agent.temporalReasoner.getCurrentDate())}`);
    console.log(`=========================================================\n`);
});
