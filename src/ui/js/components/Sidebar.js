/**
 * Calibrated left history rail & telemetry footer component.
 * @module ui/components/Sidebar
 */
import { createSvgCloseIcon, qs } from '../utils/dom.js';

/**
 * Mounts the left rail sidebar component.
 * @param {{
 *   store: import('../state/store.js').store,
 *   onNewThread: () => void,
 *   onSelectConversation: (id: string) => Promise<void>,
 *   onDeleteConversation: (id: string) => Promise<void>
 * }} deps
 */
export function mountSidebar({ store, onNewThread, onSelectConversation, onDeleteConversation }) {
  const sidebar = qs('sidebar');
  const sidebarScrim = qs('sidebarScrim');
  const menuToggleBtn = qs('menuToggleBtn');
  const conversationsList = qs('conversationsList');
  const threadCount = qs('threadCount');
  const newChatBtn = qs('newChatBtn');
  const brandHomeLink = qs('brandHomeLink');
  const statusDot = qs('statusDot');
  const telemetryText = qs('telemetryText');
  const sidebarClock = qs('sidebarClock');

  let prevConversations = null;
  let prevActiveId = undefined;

  function closeSidebarMobile() {
    sidebar.classList.remove('open');
    sidebarScrim.hidden = true;
  }

  menuToggleBtn.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    sidebarScrim.hidden = !open;
  });

  sidebarScrim.addEventListener('click', closeSidebarMobile);

  newChatBtn.addEventListener('click', () => {
    onNewThread();
    closeSidebarMobile();
  });

  brandHomeLink.addEventListener('click', (event) => {
    event.preventDefault();
    onNewThread();
    closeSidebarMobile();
  });

  function renderThreads(list, activeId) {
    threadCount.textContent = String(list.length);
    conversationsList.replaceChildren();

    if (list.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'threads-empty';
      empty.textContent = 'No saved threads';
      conversationsList.appendChild(empty);
      return;
    }

    for (const conv of list) {
      const row = document.createElement('div');
      row.className = `thread-row${conv.id === activeId ? ' active' : ''}`;

      const dateOnly = (conv.updatedAt || conv.createdAt || '').split('T')[0];
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'thread-select-btn';

      const bodySpan = document.createElement('span');
      bodySpan.className = 'thread-row-body';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'thread-row-title';
      titleSpan.textContent = conv.title || 'Untitled';
      const dateSpan = document.createElement('span');
      dateSpan.className = 'thread-row-date';
      dateSpan.textContent = dateOnly;
      bodySpan.appendChild(titleSpan);
      bodySpan.appendChild(dateSpan);
      selectBtn.appendChild(bodySpan);

      selectBtn.addEventListener('click', () => {
        void onSelectConversation(conv.id);
        closeSidebarMobile();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'thread-del-btn';
      delBtn.type = 'button';
      delBtn.title = 'Delete thread';
      delBtn.setAttribute('aria-label', `Delete ${conv.title || 'thread'}`);
      delBtn.appendChild(createSvgCloseIcon());
      delBtn.addEventListener('click', async () => {
        await onDeleteConversation(conv.id);
      });

      row.appendChild(selectBtn);
      row.appendChild(delBtn);
      conversationsList.appendChild(row);
    }
  }

  function render(state) {
    if (state.conversations !== prevConversations || state.activeConversationId !== prevActiveId) {
      prevConversations = state.conversations;
      prevActiveId = state.activeConversationId;
      renderThreads(state.conversations, state.activeConversationId);
    }

    if (state.auth.authenticated && state.auth.user) {
      statusDot.classList.add('live');
      telemetryText.textContent = `${state.auth.user.username} · ${state.auth.user.role}`;
    } else {
      statusDot.classList.remove('live');
      telemetryText.textContent = 'Sign in required';
    }

    sidebarClock.textContent = state.health?.currentDateIso || '--';
  }

  store.subscribe(render);
  render(store.getState());
}

