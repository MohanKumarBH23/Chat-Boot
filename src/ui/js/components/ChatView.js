/**
 * Main workspace conversation stream, temporal continuum ruler, and prompt composer.
 * @module ui/components/ChatView
 */
import { selectContinuumTicks, selectSourceCount } from '../state/store.js';
import { createQueryLine, createSourceAnchor, qs } from '../utils/dom.js';
import { renderMarkdown } from '../utils/format.js';

/**
 * Renders one message specimen card (user or assistant) into a DOM article element.
 * @param {Record<string, any>} msg
 * @returns {HTMLElement}
 */
export function buildMessageCard(msg) {
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

  const rightGroup = document.createElement('div');
  rightGroup.className = 'message-meta-group';
  if (msg.role === 'assistant' && typeof msg.latencyMs === 'number') {
    const srcLen = Array.isArray(msg.sources) ? msg.sources.length : 0;
    const verified = document.createElement('span');
    verified.className = 'verified-stamp';
    verified.textContent = srcLen > 0 ? 'Verified live' : 'Checked';
    rightGroup.appendChild(verified);
    const timing = document.createElement('span');
    timing.className = 'message-meta';
    timing.textContent = `${(msg.latencyMs / 1000).toFixed(2)}s · ${srcLen} sources`;
    rightGroup.appendChild(timing);
  } else {
    const timing = document.createElement('span');
    timing.className = 'message-meta';
    timing.textContent = timestamp;
    rightGroup.appendChild(timing);
  }
  header.appendChild(rightGroup);
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
        queriesWrap.appendChild(createQueryLine(q));
      }
      ledger.appendChild(queriesWrap);
    }

    card.appendChild(ledger);
  }

  const body = document.createElement('div');
  body.className = 'markdown-body';
  if (msg.role === 'user') {
    const p = document.createElement('p');
    p.textContent = msg.content || '';
    body.appendChild(p);
  } else {
    body.innerHTML = renderMarkdown(msg.content);
  }
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
    for (const source of msg.sources) {
      list.appendChild(createSourceAnchor(source, false));
    }
    details.appendChild(list);
    card.appendChild(details);
  }

  return card;
}

/**
 * Mounts the workspace topbar, calibration ruler, conversation stream, and composer.
 * @param {{
 *   store: import('../state/store.js').store,
 *   onSendPrompt: (text: string) => Promise<void>,
 *   onLogout: () => Promise<void>,
 *   onOpenSources: () => void,
 *   onOpenAdmin: () => Promise<void>
 * }} deps
 */
export function mountChatView({ store, onSendPrompt, onLogout, onOpenSources, onOpenAdmin }) {
  const currentChatTitle = qs('currentChatTitle');
  const currentDateBadge = qs('currentDateBadge');
  const rulerEarliest = qs('rulerEarliest');
  const rulerAnchor = qs('rulerAnchor');
  const rulerLive = qs('rulerLive');
  const rulerLiveTick = qs('rulerLiveTick');
  const composerToolLabel = qs('composerToolLabel');
  const welcomeBanner = qs('welcomeBanner');
  const messagesList = qs('messagesList');
  const messagesViewport = qs('messagesViewport');
  const agentActivity = qs('agentActivity');
  const activityStatusText = qs('activityStatusText');
  const activityRefBadge = qs('activityRefBadge');
  const activityTags = qs('activityTags');
  const chatForm = qs('chatForm');
  const messageInput = /** @type {HTMLTextAreaElement} */ (qs('messageInput'));
  const sendBtn = /** @type {HTMLButtonElement} */ (qs('sendBtn'));
  const viewSourcesBtn = qs('viewSourcesBtn');
  const sourcesCountBadge = qs('sourcesCountBadge');
  const adminBtn = qs('adminBtn');
  const logoutBtn = qs('logoutBtn');

  let prevConversation = undefined;
  let scrollBottomNextRender = false;

  async function submitInput(rawText) {
    const text = String(rawText ?? messageInput.value).trim();
    if (!text || store.getState().isSending || !store.getState().auth.authenticated) return;

    messageInput.value = '';
    messageInput.style.height = 'auto';
    await onSendPrompt(text);
  }

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitInput();
  });

  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 160)}px`;
  });

  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitInput();
    }
  });

  document.querySelectorAll('.prompt-row').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      if (q) {
        void submitInput(q);
      }
    });
  });

  viewSourcesBtn.addEventListener('click', onOpenSources);
  adminBtn.addEventListener('click', () => {
    void onOpenAdmin();
  });
  logoutBtn.addEventListener('click', () => {
    void onLogout();
  });

  function render(state) {
    currentChatTitle.textContent = state.activeConversation?.title || 'New thread';
    currentDateBadge.textContent = state.health?.currentFormatted || state.health?.currentDateIso || '--';

    const ticks = selectContinuumTicks(state);
    rulerEarliest.textContent = ticks.earliestText;
    rulerAnchor.textContent = ticks.anchorText;
    rulerLive.textContent = ticks.liveText;
    rulerLiveTick.classList.toggle('tick-green', ticks.hasVerifiedLive);
    rulerLiveTick.classList.toggle('tick-cyan', !ticks.hasVerifiedLive);

    logoutBtn.hidden = !state.auth.authenticated;
    adminBtn.hidden = !state.auth.authenticated || state.auth.user?.role !== 'admin';
    composerToolLabel.textContent = !state.auth.authenticated
      ? 'Isolated workspace'
      : state.auth.capabilities?.llmConfigured
        ? 'Authenticated · LLM + search'
        : 'Authenticated · Heuristic + search';

    sendBtn.disabled = state.isSending;
    sourcesCountBadge.textContent = String(selectSourceCount(state));

    if (state.activeConversation !== prevConversation) {
      prevConversation = state.activeConversation;
      const messages = state.activeConversation?.messages || [];
      messagesList.replaceChildren();
      if (messages.length === 0) {
        welcomeBanner.hidden = false;
      } else {
        welcomeBanner.hidden = true;
        for (const msg of messages) {
          messagesList.appendChild(buildMessageCard(msg));
        }
        messagesViewport.scrollTop = scrollBottomNextRender ? messagesViewport.scrollHeight : 0;
        scrollBottomNextRender = false;
      }
    }

    const act = state.activity;
    agentActivity.hidden = !act.visible;
    if (act.visible) {
      activityStatusText.textContent = act.statusText;
      if (act.referenceDateIso) {
        activityRefBadge.textContent = `${act.referenceDateIso} · -${act.deltaDays}d`;
        activityRefBadge.hidden = false;
      } else {
        activityRefBadge.hidden = true;
      }
      activityTags.replaceChildren();
      for (const q of act.queries || []) {
        activityTags.appendChild(createQueryLine(q));
      }
    }
  }

  store.subscribe(render);
  render(store.getState());

  return {
    appendTransientMessage(msg) {
      welcomeBanner.hidden = true;
      messagesList.appendChild(buildMessageCard(msg));
      messagesViewport.scrollTop = messagesViewport.scrollHeight;
    },
    markScrollToEndOnNextConversation() {
      scrollBottomNextRender = true;
    },
    focusComposer() {
      messageInput.focus();
    },
    focusSourcesBtn() {
      viewSourcesBtn.focus();
    },
    focusAdminBtn() {
      adminBtn.focus();
    },
  };
}

