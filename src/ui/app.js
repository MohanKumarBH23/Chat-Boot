// Antigravity Search Agent Web Client

let currentConversationId = null;
let currentConversation = null;
let activeEventSource = null;
let lastExecutedPlan = null;
let lastRetrievedSources = [];

// DOM Elements
const sidebar = document.getElementById('sidebar');
const conversationsList = document.getElementById('conversationsList');
const newChatBtn = document.getElementById('newChatBtn');
const currentChatTitle = document.getElementById('currentChatTitle');
const messagesViewport = document.getElementById('messagesViewport');
const messagesList = document.getElementById('messagesList');
const welcomeBanner = document.getElementById('welcomeBanner');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const agentActivity = document.getElementById('agentActivity');
const activityStatusText = document.getElementById('activityStatusText');
const activityTags = document.getElementById('activityTags');
const telemetryProvider = document.getElementById('telemetryProvider');
const telemetryLlm = document.getElementById('telemetryLlm');
const inspectorModal = document.getElementById('inspectorModal');
const closeInspectorBtn = document.getElementById('closeInspectorBtn');
const viewSearchLogsBtn = document.getElementById('viewSearchLogsBtn');
const inspectorContent = document.getElementById('inspectorContent');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await fetchTelemetry();
  await loadConversations();
});

function setupEventListeners() {
  newChatBtn.addEventListener('click', () => createNewChat());

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Benchmark scenario cards
  document.querySelectorAll('.bench-card').forEach((card) => {
    card.addEventListener('click', () => {
      const bench = card.getAttribute('data-bench');
      loadBenchmarkScenario(bench);
    });
  });

  // Prompt chips in welcome banner
  document.querySelectorAll('.prompt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-query');
      if (query) {
        messageInput.value = query;
        handleSendMessage();
      }
    });
  });

  // Inspector modal
  viewSearchLogsBtn.addEventListener('click', () => {
    renderInspectorContent();
    inspectorModal.style.display = 'flex';
  });

  closeInspectorBtn.addEventListener('click', () => {
    inspectorModal.style.display = 'none';
  });

  inspectorModal.addEventListener('click', (e) => {
    if (e.target === inspectorModal) {
      inspectorModal.style.display = 'none';
    }
  });
}

async function fetchTelemetry() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      if (data.searchProvider) telemetryProvider.textContent = data.searchProvider.toUpperCase();
      if (data.llmModel) telemetryLlm.textContent = data.llmModel;
    }
  } catch (err) {
    console.warn('Telemetry fetch error:', err);
  }
}

async function loadConversations() {
  try {
    const res = await fetch('/api/conversations');
    if (!res.ok) return;

    const convs = await res.json();
    renderConversationsList(convs);

    if (convs.length > 0 && !currentConversationId) {
      // Pick first benchmark or active conversation
      const benchConv = convs.find((c) => c.benchmarkScenario === 'crm-shortlist') || convs[0];
      await selectConversation(benchConv.id);
    }
  } catch (err) {
    console.error('Failed to load conversations:', err);
  }
}

function renderConversationsList(convs) {
  conversationsList.innerHTML = '';

  convs.forEach((c) => {
    const item = document.createElement('div');
    item.className = `conv-item ${c.id === currentConversationId ? 'active' : ''}`;
    item.innerHTML = `
      <span class="conv-title">${escapeHtml(c.title || 'Untitled')}</span>
      <button class="btn-del-conv" title="Delete conversation" data-id="${c.id}">&times;</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-del-conv')) {
        e.stopPropagation();
        deleteConversation(c.id);
        return;
      }
      selectConversation(c.id);
    });

    conversationsList.appendChild(item);
  });
}

async function selectConversation(id) {
  currentConversationId = id;
  try {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;

    currentConversation = await res.json();
    currentChatTitle.textContent = currentConversation.title || 'Conversation';

    document.querySelectorAll('.conv-item').forEach((el) => {
      el.classList.toggle('active', el.querySelector('.btn-del-conv')?.getAttribute('data-id') === id);
    });

    renderMessages(currentConversation.messages || []);
  } catch (err) {
    console.error('Failed to select conversation:', err);
  }
}

async function createNewChat() {
  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Conversation' }),
    });

    if (res.ok) {
      const conv = await res.json();
      await loadConversations();
      await selectConversation(conv.id);
      messageInput.focus();
    }
  } catch (err) {
    console.error('Failed to create new chat:', err);
  }
}

async function deleteConversation(id) {
  try {
    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (currentConversationId === id) {
        currentConversationId = null;
      }
      await loadConversations();
    }
  } catch (err) {
    console.error('Failed to delete conversation:', err);
  }
}

async function loadBenchmarkScenario(scenarioKey) {
  // Find conversation matching the scenario
  const res = await fetch('/api/conversations');
  if (!res.ok) return;

  const convs = await res.json();
  const matched = convs.find((c) => c.benchmarkScenario === scenarioKey || c.id.includes(scenarioKey));

  if (matched) {
    await selectConversation(matched.id);

    // Prepopulate benchmark evaluation question
    if (scenarioKey === 'crm-shortlist') {
      messageInput.value = 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?';
    } else if (scenarioKey === 'nov-3-answer') {
      messageInput.value = 'What did I ask you on 3 November? Is your answer still correct today?';
    } else if (scenarioKey === 'postgres-hosting') {
      messageInput.value = 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?';
    }
    messageInput.focus();
  }
}

function renderMessages(messages) {
  messagesList.innerHTML = '';

  if (messages.length === 0) {
    welcomeBanner.style.display = 'flex';
  } else {
    welcomeBanner.style.display = 'none';
    messages.forEach((msg) => appendMessageElement(msg));
  }

  scrollToBottom();
}

function appendMessageElement(msg) {
  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  row.id = `msg-${msg.id}`;

  if (msg.role === 'user') {
    row.innerHTML = `
      <div class="message-meta">${escapeHtml(msg.formattedDate || '')}</div>
      <div class="bubble">${escapeHtml(msg.content)}</div>
    `;
  } else {
    const renderedMarkdown = renderMarkdownWithCitations(msg.content, msg.sources || []);
    let sourcesHtml = '';

    if (msg.sources && msg.sources.length > 0) {
      sourcesHtml = `
        <div class="sources-strip">
          <div class="sources-strip-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            Verified Sources (${msg.sources.length})
          </div>
          <div class="sources-grid">
            ${msg.sources.map((s, idx) => `
              <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="source-card">
                <div class="source-card-top">
                  <span class="source-domain">${escapeHtml(s.domain || 'web')}</span>
                  <span class="source-num">[${idx + 1}]</span>
                </div>
                <div class="source-title">${escapeHtml(s.title || 'Source')}</div>
                <div class="source-snippet">${escapeHtml(s.snippet || '')}</div>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }

    let metricsHtml = '';
    if (msg.metrics) {
      const durSec = (msg.metrics.totalDurationMs / 1000).toFixed(2);
      const searchSec = msg.metrics.searchDurationMs ? (msg.metrics.searchDurationMs / 1000).toFixed(2) : '0';
      metricsHtml = `
        <div class="metrics-footer">
          <span>⚡ ${durSec}s total</span>
          <span>🔍 ${searchSec}s search (${msg.metrics.searchQueryCount || 0} queries)</span>
          <span>📚 ${msg.sources?.length || 0} sources</span>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="message-meta">
        <span class="author-badge">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="12 6 12 12 16 14"></polygon>
          </svg>
          Antigravity Search Agent
        </span>
        <span>${escapeHtml(msg.formattedDate || '')}</span>
      </div>
      <div class="bubble-assistant markdown-body">${renderedMarkdown}</div>
      ${sourcesHtml}
      ${metricsHtml}
    `;
  }

  messagesList.appendChild(row);
  return row;
}

function renderMarkdownWithCitations(markdownText, sources = []) {
  if (!window.marked) return escapeHtml(markdownText);

  // Parse markdown to HTML
  let html = window.marked.parse(markdownText);

  // Convert [1], [2], [1][2] into interactive citation pills
  html = html.replace(/\[(\d+)\]/g, (match, p1) => {
    const idx = parseInt(p1, 10) - 1;
    const source = sources[idx];
    const url = source ? source.url : '#';
    const title = source ? `${source.title} (${source.domain})` : `Source ${p1}`;

    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="cite-pill" title="${escapeHtml(title)}">[${p1}]</a>`;
  });

  return html;
}

async function handleSendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  if (!currentConversationId) {
    await createNewChat();
  }

  welcomeBanner.style.display = 'none';
  messageInput.value = '';
  sendBtn.disabled = true;

  // Append user bubble immediately
  const tempUserMsg = {
    id: `temp-${Date.now()}`,
    role: 'user',
    content: text,
    formattedDate: 'Just now',
  };
  appendMessageElement(tempUserMsg);
  scrollToBottom();

  // Create temporary assistant bubble for streaming
  const assistantRow = document.createElement('div');
  assistantRow.className = 'message-row assistant';
  assistantRow.innerHTML = `
    <div class="message-meta">
      <span class="author-badge">Antigravity Search Agent</span>
      <span>Generating...</span>
    </div>
    <div class="bubble-assistant markdown-body" id="streamingContent"></div>
    <div id="streamingSources"></div>
  `;
  messagesList.appendChild(assistantRow);
  const streamingContent = assistantRow.querySelector('#streamingContent');
  const streamingSources = assistantRow.querySelector('#streamingSources');

  // Show Agent Activity
  agentActivity.style.display = 'flex';
  activityStatusText.textContent = 'Analyzing query & resolving temporal memory...';
  activityTags.innerHTML = '';

  let accumulatedText = '';
  let activeSources = [];

  try {
    const resp = await fetch(`/api/conversations/${currentConversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });

    if (!resp.ok) {
      throw new Error(`Server returned HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'status') {
              activityStatusText.textContent = event.message;
            } else if (event.type === 'plan') {
              lastExecutedPlan = event.plan;
              activityTags.innerHTML = '';

              if (event.plan.temporalContext.relativePeriodDescription) {
                const tag = document.createElement('span');
                tag.className = 'activity-tag';
                tag.textContent = `📅 ${event.plan.temporalContext.relativePeriodDescription}`;
                activityTags.appendChild(tag);
              }

              if (event.plan.queries) {
                event.plan.queries.forEach((q) => {
                  const tag = document.createElement('span');
                  tag.className = 'activity-tag';
                  tag.textContent = `🔎 ${q}`;
                  activityTags.appendChild(tag);
                });
              }
            } else if (event.type === 'sources_ready') {
              activeSources = event.sources;
              lastRetrievedSources = event.sources;
            } else if (event.type === 'token') {
              accumulatedText += event.token;
              streamingContent.innerHTML = renderMarkdownWithCitations(accumulatedText, activeSources);
              scrollToBottom();
            } else if (event.type === 'complete') {
              agentActivity.style.display = 'none';
              // Re-render final message cleanly
              assistantRow.remove();
              appendMessageElement(event.message);
              scrollToBottom();
            } else if (event.type === 'error') {
              activityStatusText.textContent = `Error: ${event.message}`;
            }
          } catch {
            // ignore non-json SSE lines
          }
        }
      }
    }
  } catch (err) {
    console.error('Streaming error:', err);
    streamingContent.innerHTML += `<p style="color: #ef4444;">Error generating response: ${escapeHtml(err.message)}</p>`;
  } finally {
    agentActivity.style.display = 'none';
    sendBtn.disabled = false;
    messageInput.focus();
    loadConversations();
  }
}

function renderInspectorContent() {
  if (!lastExecutedPlan && lastRetrievedSources.length === 0) {
    inspectorContent.innerHTML = '<p class="empty-state">No search operations executed in this session yet.</p>';
    return;
  }

  let html = '';

  if (lastExecutedPlan) {
    html += `
      <div class="inspector-section">
        <h4>Search Strategy & Temporal Grounding</h4>
        <div class="inspector-query-item">
          <div><strong>Intent:</strong> ${lastExecutedPlan.intent}</div>
          <div><strong>Reasoning:</strong> ${lastExecutedPlan.reasoning}</div>
          <div><strong>Current Date:</strong> ${lastExecutedPlan.temporalContext.currentDateFormatted}</div>
          ${lastExecutedPlan.temporalContext.referenceDateFormatted ? `<div><strong>Baseline Date:</strong> ${lastExecutedPlan.temporalContext.referenceDateFormatted}</div>` : ''}
          ${lastExecutedPlan.resolvedEntities?.length ? `<div><strong>Resolved Entities:</strong> ${lastExecutedPlan.resolvedEntities.join(', ')}</div>` : ''}
        </div>
      </div>
      <div class="inspector-section">
        <h4>Parallel Search Queries Dispatched</h4>
        ${(lastExecutedPlan.queries || []).map((q, i) => `
          <div class="inspector-query-item">[Query ${i + 1}] ${escapeHtml(q)}</div>
        `).join('')}
      </div>
    `;
  }

  if (lastRetrievedSources.length > 0) {
    html += `
      <div class="inspector-section">
        <h4>Retrieved Grounding Sources (${lastRetrievedSources.length})</h4>
        ${lastRetrievedSources.map((s, idx) => `
          <div class="inspector-query-item">
            <div><strong>[${idx + 1}] ${escapeHtml(s.title)}</strong></div>
            <div style="color: var(--accent-cyan);">${escapeHtml(s.url)}</div>
            <div style="margin-top: 4px; color: var(--text-muted);">${escapeHtml(s.snippet)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  inspectorContent.innerHTML = html;
}

function scrollToBottom() {
  messagesViewport.scrollTop = messagesViewport.scrollHeight;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

