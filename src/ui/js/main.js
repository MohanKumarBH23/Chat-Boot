/**
 * DeltaCheck frontend application bootstrap & workflow coordinator.
 * Connects centralized store, API transport, and modular view components.
 * @module ui/main
 */
import {
  ApiError,
  adminApi,
  authApi,
  configureApiClient,
  conversationsApi,
  healthApi,
} from './services/apiClient.js';
import { store } from './state/store.js';
import { truncateWords } from './utils/format.js';
import { mountAdminModal } from './components/AdminModal.js';
import { mountAuthGate } from './components/AuthGate.js';
import { mountChatView } from './components/ChatView.js';
import { mountErrorBanner } from './components/ErrorBanner.js';
import { mountSidebar } from './components/Sidebar.js';
import { mountSourcesModal } from './components/SourcesModal.js';

async function loadHealth() {
  try {
    const data = await healthApi.getStatus();
    store.setHealth(data);
  } catch (err) {
    store.setHealth(null);
    if (err instanceof ApiError) {
      store.setError(err.message);
    }
  }
}

async function refreshSessionState(authGate) {
  try {
    const data = await authApi.getSession();
    store.setAuthState(data);
    if (!data.authenticated || !data.user) {
      store.clearAuthenticatedWorkspace();
      return false;
    }
    return true;
  } catch {
    store.clearAuthenticatedWorkspace();
    authGate.openLoginPrompt();
    return false;
  }
}

async function loadConversations() {
  if (!store.getState().auth.authenticated) return;
  try {
    const list = await conversationsApi.list();
    store.setConversations(list);
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) {
      store.setError(err.message);
    }
  }
}

async function openConversation(convId) {
  try {
    const conv = await conversationsApi.get(convId);
    store.setActiveConversation(conv);
    await loadConversations();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Unable to open thread.');
  }
}

async function deleteConversation(convId) {
  try {
    await conversationsApi.remove(convId);
    if (store.getState().activeConversationId === convId) {
      store.setActiveConversation(null);
    }
    await loadConversations();
  } catch (err) {
    store.setError(err instanceof Error ? err.message : 'Unable to delete thread.');
  }
}

async function loadAdminPanel() {
  store.setAdminState({ loading: true, error: null });
  try {
    const [overview, usersData] = await Promise.all([adminApi.getOverview(), adminApi.listUsers()]);
    store.setAdminState({
      loading: false,
      error: null,
      overview,
      users: Array.isArray(usersData.users) ? usersData.users : [],
    });
  } catch (err) {
    store.setAdminState({
      loading: false,
      error: err instanceof Error ? err.message : 'Error contacting administration endpoints.',
    });
  }
}

function initApp() {
  let chatView;
  let authGate;

  configureApiClient({
    getCsrfToken: () => store.getState().auth.csrfToken,
    onUnauthorized: async () => {
      store.clearAuthenticatedWorkspace();
      await refreshSessionState(authGate);
    },
  });

  mountErrorBanner({ store });

  authGate = mountAuthGate({
    store,
    async onSubmitCredentials(mode, username, password) {
      if (mode === 'setup') {
        await authApi.bootstrap(username, password);
      } else if (mode === 'register') {
        await authApi.register(username, password);
      } else {
        await authApi.login(username, password);
      }

      store.clearError();
      const authed = await refreshSessionState(authGate);
      if (authed) {
        await loadConversations();
        const saved = store.getState().conversations;
        if (saved.length > 0 && !store.getState().activeConversationId) {
          await openConversation(saved[0].id);
        } else {
          chatView.focusComposer();
        }
      }
    },
  });

  mountSidebar({
    store,
    onNewThread() {
      store.clearError();
      store.setActiveConversation(null);
      if (store.getState().auth.authenticated) {
        chatView.focusComposer();
        void loadConversations();
      }
    },
    onSelectConversation: openConversation,
    onDeleteConversation: deleteConversation,
  });

  chatView = mountChatView({
    store,
    async onSendPrompt(text) {
      if (store.getState().isSending || !store.getState().auth.authenticated) return;

      store.clearError();
      store.setSending(true);

      try {
        let convId = store.getState().activeConversationId;
        if (!convId) {
          const created = await conversationsApi.create(truncateWords(text, 56));
          store.setActiveConversation(created);
          convId = created.id;
        }

        chatView.appendTransientMessage({
          role: 'user',
          content: text,
          timestamp: new Date().toISOString(),
        });

        store.setActivity({
          statusText: 'Resolving temporal context and memory',
          referenceDateIso: null,
          deltaDays: null,
          queries: [],
        });

        await conversationsApi.sendMessageStream(convId, text, (event) => {
          if (event.type === 'stage' && event.stage === 'route') {
            const anchor = event.decision?.temporalAnchor || {};
            const queries = Array.isArray(event.decision?.searchQueries) ? event.decision.searchQueries : [];
            store.setActivity({
              referenceDateIso: anchor.referenceDateIso || null,
              deltaDays: typeof anchor.deltaDays === 'number' ? anchor.deltaDays : null,
              queries,
              statusText: queries.length > 0 ? `Searching ${queries.length} queries` : 'Synthesizing reply',
            });
          } else if (event.type === 'stage' && event.stage === 'search') {
            const count = Array.isArray(event.sources) ? event.sources.length : 0;
            store.setActivity({
              statusText: `Synthesizing from ${count} sources`,
            });
          } else if (event.type === 'done') {
            chatView.markScrollToEndOnNextConversation();
            store.setActiveConversation(event.conversation);
            store.hideActivity();
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Agent error');
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Request failed';
        store.hideActivity();
        store.setError(message);
        chatView.appendTransientMessage({
          role: 'assistant',
          content: `Request failed: ${message}`,
          timestamp: new Date().toISOString(),
        });
      } finally {
        store.setSending(false);
        store.hideActivity();
        await loadConversations();
        if (store.getState().auth.authenticated) {
          chatView.focusComposer();
        }
      }
    },
    async onLogout() {
      try {
        await authApi.logout();
      } catch {
        // Always clear client session state even if network call fails
      } finally {
        store.clearAuthenticatedWorkspace();
        await refreshSessionState(authGate);
      }
    },
    onOpenSources() {
      store.setModal('inspector');
    },
    async onOpenAdmin() {
      const user = store.getState().auth.user;
      if (!user || user.role !== 'admin') return;
      store.setModal('admin');
      await loadAdminPanel();
    },
  });

  mountSourcesModal({
    store,
    onClose() {
      store.setModal(null);
      chatView.focusSourcesBtn();
    },
  });

  mountAdminModal({
    store,
    onClose() {
      store.setModal(null);
      chatView.focusAdminBtn();
    },
    onRefresh: loadAdminPanel,
    async onSeed() {
      try {
        await adminApi.seedStarterData();
        await Promise.all([loadConversations(), loadAdminPanel()]);
      } catch (err) {
        store.setError(err instanceof Error ? err.message : 'Unable to seed starter data.');
      }
    },
    async onRemoveUser(userId) {
      try {
        await adminApi.removeUser(userId);
        await loadAdminPanel();
      } catch (err) {
        store.setError(err instanceof Error ? err.message : 'Unable to remove user.');
        throw err;
      }
    },
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const modal = store.getState().activeModal;
    if (modal === 'inspector') {
      store.setModal(null);
      chatView.focusSourcesBtn();
    } else if (modal === 'admin') {
      store.setModal(null);
      chatView.focusAdminBtn();
    }
  });

  void (async () => {
    await loadHealth();
    const isAuthed = await refreshSessionState(authGate);
    if (isAuthed) {
      await loadConversations();
      const initialThread = new URLSearchParams(window.location.search).get('thread');
      if (initialThread && /^[a-zA-Z0-9_-]{1,80}$/.test(initialThread)) {
        await openConversation(initialThread);
      }
    }
  })();
}

document.addEventListener('DOMContentLoaded', initApp);

