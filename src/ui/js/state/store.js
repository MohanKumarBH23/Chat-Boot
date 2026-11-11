/**
 * Centralized observable state store for the DeltaCheck web workspace.
 * Components subscribe to state snapshots and dispatch focused state transitions.
 * @module ui/state/store
 */
import { formatDateStamp } from '../utils/format.js';

const INITIAL_ACTIVITY = Object.freeze({
  visible: false,
  statusText: 'Resolving temporal reference',
  referenceDateIso: null,
  deltaDays: null,
  queries: [],
});

function createInitialState() {
  return {
    health: null,
    auth: {
      authenticated: false,
      setupRequired: false,
      registrationEnabled: false,
      user: null,
      csrfToken: '',
      capabilities: { llmConfigured: false },
    },
    conversations: [],
    activeConversationId: null,
    activeConversation: null,
    isSending: false,
    activity: { ...INITIAL_ACTIVITY },
    errorBanner: null,
    activeModal: null, // 'inspector' | 'admin' | null
    adminState: {
      loading: false,
      error: null,
      overview: null,
      users: [],
    },
  };
}

class AppStore {
  constructor() {
    this._state = createInitialState();
    this._listeners = new Set();
  }

  /**
   * Returns current immutable state snapshot reference.
   */
  getState() {
    return this._state;
  }

  /**
   * Subscribes to state updates. Immediately invokes listener if requested.
   * @param {(state: ReturnType<AppStore['getState']>) => void} listener
   * @returns {() => void} Unsubscribe callback.
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  _update(patchOrFn) {
    const nextPatch = typeof patchOrFn === 'function' ? patchOrFn(this._state) : patchOrFn;
    this._state = { ...this._state, ...nextPatch };
    for (const listener of this._listeners) {
      listener(this._state);
    }
  }

  setHealth(health) {
    this._update({ health });
  }

  setAuthState(authPayload) {
    this._update({
      auth: {
        authenticated: Boolean(authPayload.authenticated && authPayload.user),
        setupRequired: Boolean(authPayload.setupRequired),
        registrationEnabled: Boolean(authPayload.registrationEnabled),
        user: authPayload.user || null,
        csrfToken: typeof authPayload.csrfToken === 'string' ? authPayload.csrfToken : '',
        capabilities: authPayload.capabilities || { llmConfigured: false },
      },
    });
  }

  clearAuthenticatedWorkspace() {
    this._update((prev) => ({
      auth: {
        ...prev.auth,
        authenticated: false,
        user: null,
        csrfToken: '',
      },
      conversations: [],
      activeConversationId: null,
      activeConversation: null,
      isSending: false,
      activity: { ...INITIAL_ACTIVITY },
      activeModal: null,
      adminState: { loading: false, error: null, overview: null, users: [] },
    }));
  }

  setConversations(conversations) {
    this._update({ conversations: Array.isArray(conversations) ? conversations : [] });
  }

  setActiveConversation(conversation) {
    this._update({
      activeConversation: conversation || null,
      activeConversationId: conversation ? conversation.id : null,
    });
  }

  setSending(isSending) {
    this._update({ isSending: Boolean(isSending) });
  }

  setActivity(activityPatch) {
    this._update((prev) => ({
      activity: { ...prev.activity, visible: true, ...activityPatch },
    }));
  }

  hideActivity() {
    this._update({ activity: { ...INITIAL_ACTIVITY } });
  }

  setError(message) {
    this._update({ errorBanner: message ? String(message) : null });
  }

  clearError() {
    this._update({ errorBanner: null });
  }

  setModal(modalName) {
    this._update({ activeModal: modalName });
  }

  setAdminState(adminPatch) {
    this._update((prev) => ({
      adminState: { ...prev.adminState, ...adminPatch },
    }));
  }
}

export const store = new AppStore();

/**
 * Pure selector deriving continuum ruler labels and live status from state.
 * @param {ReturnType<AppStore['getState']>} state
 */
export function selectContinuumTicks(state) {
  const todayIso = state.health?.currentDateIso || '';
  const dates = state.conversations
    .map((c) => (c.updatedAt || c.createdAt || '').split('T')[0])
    .filter(Boolean)
    .sort();
  const earliestIso = dates[0] || todayIso;
  const latestIso = dates[dates.length - 1] || todayIso;

  let anchorIso = latestIso;
  let anchorTag = 'Latest note';
  let hasVerifiedLive = false;

  const conv = state.activeConversation;
  if (conv && Array.isArray(conv.messages)) {
    const assistantTurns = conv.messages.filter((m) => m.role === 'assistant');
    const anchoredTurn = [...assistantTurns].reverse().find((m) => m.metadata?.referenceDateIso);
    if (anchoredTurn) {
      anchorIso = anchoredTurn.metadata.referenceDateIso;
      anchorTag = 'Anchor';
    } else if (conv.createdAt) {
      anchorIso = conv.createdAt.split('T')[0];
      anchorTag = 'Baseline';
    }
    hasVerifiedLive = assistantTurns.some((m) => typeof m.latencyMs === 'number');
  }

  return {
    earliestText: formatDateStamp(earliestIso, todayIso, 'Earliest'),
    anchorText: formatDateStamp(anchorIso, todayIso, anchorTag),
    liveText: `${todayIso || '--'} · ${hasVerifiedLive ? 'Verified live' : 'Live check'}`,
    hasVerifiedLive,
  };
}

/**
 * Pure selector returning total citation count for the active conversation.
 * @param {ReturnType<AppStore['getState']>} state
 * @returns {number}
 */
export function selectSourceCount(state) {
  const messages = state.activeConversation?.messages;
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const msg of messages) {
    if (Array.isArray(msg.sources)) {
      total += msg.sources.length;
    }
  }
  return total;
}

