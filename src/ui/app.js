let currentConversationId = null;
let currentConversation = null;
let isSending = false;

const sidebar = document.getElementById('sidebar');
const sidebarScrim = document.getElementById('sidebarScrim');
const menuToggleBtn = document.getElementById('menuToggleBtn');
const conversationsList = document.getElementById('conversationsList');
const threadCount = document.getElementById('threadCount');
const newChatBtn = document.getElementById('newChatBtn');
const brandHomeLink = document.getElementById('brandHomeLink');
const currentChatTitle = document.getElementById('currentChatTitle');
const currentDateBadge = document.getElementById('currentDateBadge');
const statusDot = document.getElementById('statusDot');
const telemetryText = document.getElementById('telemetryText');
const sidebarClock = document.getElementById('sidebarClock');
const composerToolLabel = document.getElementById('composerToolLabel');
const welcomeBanner = document.getElementById('welcomeBanner');
const messagesList = document.getElementById('messagesList');
const messagesViewport = document.getElementById('messagesViewport');
const agentActivity = document.getElementById('agentActivity');
const activityStatusText = document.getElementById('activityStatusText');
const activityRefBadge = document.getElementById('activityRefBadge');
const activityTags = document.getElementById('activityTags');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const viewSourcesBtn = document.getElementById('viewSourcesBtn');
const sourcesCountBadge = document.getElementById('sourcesCountBadge');
const inspectorModal = document.getElementById('inspectorModal');
const closeInspectorBtn = document.getElementById('closeInspectorBtn');
const inspectorContent = document.getElementById('inspectorContent');

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  await Promise.all([loadHealth(), loadConversations()]);
  const initialThread = new URLSearchParams(window.location.search).get('thread');
  if (initialThread) {
    await openConversation(initialThread);
  }
});

function bindEvents() {
  newChatBtn.addEventListener('click', () => {
    resetToNewThread();
    closeSidebarMobile();
  });

  brandHomeLink.addEventListener('click', (e) => {
    e.preventDefault();
    resetToNewThread();
    closeSidebarMobile();
  });

  menuToggleBtn.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    sidebarScrim.hidden = !open;
  });

  sidebarScrim.addEventListener('click', closeSidebarMobile);

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitPrompt();
  });

  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
  });

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitPrompt();
    }
  });

  document.querySelectorAll('.prompt-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      if (!q) return;
      messageInput.value = q;
      submitPrompt();
    });
  });

  viewSourcesBtn.addEventListener('click', () => {
    renderInspector();
    inspectorModal.hidden = false;
    closeInspectorBtn.focus();
  });

  closeInspectorBtn.addEventListener('click', () => {
    inspectorModal.hidden = true;
    viewSourcesBtn.focus();
  });

  inspectorModal.addEventListener('click', (e) => {
    if (e.target === inspectorModal) {
      inspectorModal.hidden = true;
      viewSourcesBtn.focus();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !inspectorModal.hidden) {
      inspectorModal.hidden = true;
      viewSourcesBtn.focus();
    }
  });
}

function closeSidebarMobile() {
  sidebar.classList.remove('open');
  sidebarScrim.hidden = true;
}

async function loadHealth() {
  try {
    const resp = await fetch('/api/health');
    if (!resp.ok) return;
    const data = await resp.json();
    currentDateBadge.textContent = data.currentFormatted || data.currentDateIso;
    sidebarClock.textContent = data.currentDateIso;
    telemetryText.textContent = `${data.searchProvider} · ${data.model}`;
    composerToolLabel.textContent = `Search: ${data.searchProvider}`;
    statusDot.classList.toggle('live', data.searchProvider !== 'mock');
  } catch {
    telemetryText.textContent = 'Offline';
  }
}

async function loadConversations() {
  try {
    const resp = await fetch('/api/conversations');
    if (!resp.ok) return;
    const list = await resp.json();
    renderConversationsList(list);
  } catch {
    // ignore transient error
  }
}

function renderConversationsList(list) {
  threadCount.textContent = String(list.length);
  conversationsList.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'threads-empty';
    empty.textContent = 'No saved threads';
    conversationsList.appendChild(empty);
    return;
  }

  for (const conv of list) {
    const row = document.createElement('div');
    row.className = `thread-row${conv.id === currentConversationId ? ' active' : ''}`;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    const dateOnly = (conv.updatedAt || conv.createdAt || '').split('T')[0];

    row.innerHTML = `
      <span class="thread-row-body">
        <span class="thread-row-title">${escapeHtml(conv.title || 'Untitled')}</span>
        <span class="thread-row-date">${escapeHtml(dateOnly)}</span>
      </span>
      <button class="thread-del-btn" type="button" title="Delete thread" aria-label="Delete thread">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12"></path>
        </svg>
      </button>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.thread-del-btn')) return;
      openConversation(conv.id);
      closeSidebarMobile();
    });

    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openConversation(conv.id);
        closeSidebarMobile();
      }
    });

    row.querySelector('.thread-del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteConversation(conv.id);
    });

    conversationsList.appendChild(row);
  }
}

async function openConversation(convId) {
  const resp = await fetch(`/api/conversations/${encodeURIComponent(convId)}`);
  if (!resp.ok) return;
  currentConversation = await resp.json();
  currentConversationId = currentConversation.id;
  currentChatTitle.textContent = currentConversation.title;
  renderThread();
  await loadConversations();
}

async function deleteConversation(convId) {
  const resp = await fetch(`/api/conversations/${encodeURIComponent(convId)}`, { method: 'DELETE' });
  if (!resp.ok) return;
  if (convId === currentConversationId) {
    resetToNewThread();
  }
  await loadConversations();
}

function resetToNewThread() {
  currentConversationId = null;
  currentConversation = null;
  currentChatTitle.textContent = 'New thread';
  messagesList.innerHTML = '';
  welcomeBanner.hidden = false;
  sourcesCountBadge.textContent = '0';
  messageInput.focus();
  loadConversations();
}

function renderThread() {
  if (!currentConversation || currentConversation.messages.length === 0) {
    welcomeBanner.hidden = false;
    messagesList.innerHTML = '';
    sourcesCountBadge.textContent = '0';
    return;
  }

  welcomeBanner.hidden = true;
  messagesList.innerHTML = '';

  let totalSources = 0;
  for (const msg of currentConversation.messages) {
    if (Array.isArray(msg.sources)) {
      totalSources += msg.sources.length;
    }
    messagesList.appendChild(buildMessageCard(msg));
  }

  sourcesCountBadge.textContent = String(totalSources);
  messagesViewport.scrollTop = messagesViewport.scrollHeight;
}

function buildMessageCard(msg) {
  const card = document.createElement('article');
  card.className = `message-card ${msg.role}`;

  const timestamp = (msg.timestamp || '').split('T')[0];
  const roleLabel = msg.role === 'user' ? 'You' : 'DeltaCheck';

  const header = document.createElement('div');
  header.className = 'message-header';

  const roleGroup = document.createElement('div');
  roleGroup.className = 'message-role-group';

  const roleSpan = document.createElement('span');
  roleSpan.className = 'message-role';
  roleSpan.textContent = roleLabel;
  roleGroup.appendChild(roleSpan);

  const meta = msg.metadata || {};
  if (msg.role === 'assistant' && meta.referenceDateIso) {
    const stamp = document.createElement('span');
    stamp.className = 'delta-stamp';
    const deltaLabel = typeof meta.deltaDays === 'number' ? ` · -${meta.deltaDays}d` : '';
    stamp.textContent = `${meta.referenceDateIso}${deltaLabel}`;
    roleGroup.appendChild(stamp);
  }

  header.appendChild(roleGroup);

  const rightMeta = document.createElement('span');
  rightMeta.className = 'message-meta';
  if (msg.role === 'assistant' && typeof msg.latencyMs === 'number') {
    const srcLen = Array.isArray(msg.sources) ? msg.sources.length : 0;
    rightMeta.textContent = `${(msg.latencyMs / 1000).toFixed(2)}s · ${srcLen} sources`;
  } else {
    rightMeta.textContent = timestamp;
  }
  header.appendChild(rightMeta);
  card.appendChild(header);

  if (msg.role === 'assistant' && (meta.historicalTopicFound || (msg.queries && msg.queries.length > 0))) {
    const ledger = document.createElement('div');
    ledger.className = 'ledger-strip';

    if (meta.historicalTopicFound) {
      const row = document.createElement('div');
      row.className = 'ledger-row';
      const base = document.createElement('div');
      base.className = 'ledger-baseline';
      const mark = document.createElement('span');
      mark.className = 'emit-mark';
      mark.setAttribute('aria-hidden', 'true');
      const topic = document.createElement('span');
      topic.className = 'ledger-topic';
      topic.textContent = `Baseline: ${meta.historicalTopicFound}`;
      base.appendChild(mark);
      base.appendChild(topic);
      row.appendChild(base);
      ledger.appendChild(row);
    }

    if (Array.isArray(msg.queries) && msg.queries.length > 0) {
      const queriesWrap = document.createElement('div');
      queriesWrap.className = 'ledger-queries';
      for (const q of msg.queries) {
        const chip = document.createElement('span');
        chip.className = 'query-chip';
        chip.textContent = q;
        queriesWrap.appendChild(chip);
      }
      ledger.appendChild(queriesWrap);
    }

    card.appendChild(ledger);
  }

  const body = document.createElement('div');
  body.className = 'markdown-body';
  body.innerHTML = msg.role === 'user' ? `<p>${escapeHtml(msg.content)}</p>` : renderMarkdown(msg.content);
  card.appendChild(body);

  if (msg.role === 'assistant' && Array.isArray(msg.sources) && msg.sources.length > 0) {
    const details = document.createElement('details');
    details.className = 'sources-details';

    const summary = document.createElement('summary');
    summary.className = 'sources-summary';
    summary.textContent = `Sources (${msg.sources.length})`;
    details.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'sources-list';
    for (const s of msg.sources) {
      const link = document.createElement('a');
      link.className = 'source-item';
      link.href = safeUrl(s.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = `
        <span class="source-item-title">${escapeHtml(s.title)}</span>
        <span class="source-item-meta">${escapeHtml(s.domain)}${s.publishedDate ? ` · ${escapeHtml(s.publishedDate)}` : ''}</span>
      `;
      list.appendChild(link);
    }
    details.appendChild(list);
    card.appendChild(details);
  }

  return card;
}

async function submitPrompt() {
  if (isSending) return;
  const text = messageInput.value.trim();
  if (!text) return;

  isSending = true;
  sendBtn.disabled = true;
  messageInput.value = '';
  messageInput.style.height = 'auto';

  try {
    if (!currentConversationId) {
      const createResp = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text.slice(0, 56) }),
      });
      if (!createResp.ok) throw new Error('Failed to create thread');
      currentConversation = await createResp.json();
      currentConversationId = currentConversation.id;
      currentChatTitle.textContent = currentConversation.title;
    }

    welcomeBanner.hidden = true;
    messagesList.appendChild(
      buildMessageCard({
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      })
    );

    showActivity('Resolving temporal context and memory');
    messagesViewport.scrollTop = messagesViewport.scrollHeight;

    const resp = await fetch(`/api/conversations/${encodeURIComponent(currentConversationId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });

    if (!resp.ok || !resp.body) {
      throw new Error('Request failed');
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;
        const event = JSON.parse(line.slice(5).trim());
        handleStreamEvent(event);
      }
    }
  } catch (err) {
    hideActivity();
    messagesList.appendChild(
      buildMessageCard({
        role: 'assistant',
        content: `Request failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      })
    );
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    hideActivity();
    await loadConversations();
    messageInput.focus();
  }
}

function handleStreamEvent(event) {
  if (event.type === 'stage' && event.stage === 'route') {
    const anchor = event.decision.temporalAnchor;
    if (anchor.referenceDateIso) {
      activityRefBadge.textContent = `${anchor.referenceDateIso} · -${anchor.deltaDays}d`;
      activityRefBadge.hidden = false;
    } else {
      activityRefBadge.hidden = true;
    }

    if (event.decision.searchQueries.length > 0) {
      activityStatusText.textContent = `Searching ${event.decision.searchQueries.length} queries`;
      activityTags.innerHTML = event.decision.searchQueries
        .map((q) => `<span class="query-chip">${escapeHtml(q)}</span>`)
        .join('');
    } else {
      activityStatusText.textContent = 'Synthesizing reply';
      activityTags.innerHTML = '';
    }
  } else if (event.type === 'stage' && event.stage === 'search') {
    activityStatusText.textContent = `Synthesizing from ${event.sources.length} sources`;
  } else if (event.type === 'done') {
    currentConversation = event.conversation;
    currentChatTitle.textContent = currentConversation.title;
    hideActivity();
    renderThread();
  } else if (event.type === 'error') {
    throw new Error(event.message || 'Agent error');
  }
}

function showActivity(label) {
  activityStatusText.textContent = label;
  activityRefBadge.hidden = true;
  activityTags.innerHTML = '';
  agentActivity.hidden = false;
}

function hideActivity() {
  agentActivity.hidden = true;
}

function renderInspector() {
  if (!currentConversation) {
    inspectorContent.innerHTML = '<p class="empty-inspector">No sources retrieved in the current thread.</p>';
    return;
  }

  const turns = currentConversation.messages.filter(
    (m) => m.role === 'assistant' && ((m.sources && m.sources.length > 0) || (m.queries && m.queries.length > 0))
  );

  if (turns.length === 0) {
    inspectorContent.innerHTML = '<p class="empty-inspector">No sources retrieved in the current thread.</p>';
    return;
  }

  inspectorContent.innerHTML = '';
  for (const turn of turns) {
    const block = document.createElement('div');
    block.className = 'ledger-strip';

    if (Array.isArray(turn.queries) && turn.queries.length > 0) {
      const qRow = document.createElement('div');
      qRow.className = 'ledger-queries';
      qRow.innerHTML = turn.queries.map((q) => `<span class="query-chip">${escapeHtml(q)}</span>`).join('');
      block.appendChild(qRow);
    }

    if (Array.isArray(turn.sources)) {
      for (const s of turn.sources) {
        const card = document.createElement('a');
        card.className = 'source-item';
        card.href = safeUrl(s.url);
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.innerHTML = `
          <div>
            <div class="source-item-title">${escapeHtml(s.title)}</div>
            <div class="inspector-snippet">${escapeHtml(s.snippet)}</div>
          </div>
          <span class="source-item-meta">${escapeHtml(s.domain)}${s.publishedDate ? ` · ${escapeHtml(s.publishedDate)}` : ''}</span>
        `;
        block.appendChild(card);
      }
    }

    inspectorContent.appendChild(block);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // ignore invalid URL
  }
  return '#';
}

function formatInline(raw) {
  let out = escapeHtml(raw);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, url) => {
    return `<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

function renderMarkdown(md) {
  const lines = String(md || '').split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (!line.trim()) {
      i++;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(4, Math.max(3, headingMatch[1].length));
      blocks.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Markdown table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      const headers = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${formatInline(h)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td>${formatInline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;
      blocks.push(`<div class="markdown-table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${formatInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${formatInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paraLines = [line.trim()];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s+|---+$|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])
    ) {
      if (lines[i].includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
        break;
      }
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push(`<p>${formatInline(paraLines.join(' '))}</p>`);
  }

  return blocks.join('');
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

