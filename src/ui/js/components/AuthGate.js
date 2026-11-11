/**
 * Authentication gate modal component (`setup` | `login` | `register`).
 * @module ui/components/AuthGate
 */
import { qs } from '../utils/dom.js';

/**
 * Mounts the authentication gate dialog and connects auth actions.
 * @param {{
 *   store: import('../state/store.js').store,
 *   onSubmitCredentials: (mode: 'setup' | 'login' | 'register', username: string, password: string) => Promise<void>
 * }} deps
 */
export function mountAuthGate({ store, onSubmitCredentials }) {
  const authGate = qs('authGate');
  const authTitle = qs('authTitle');
  const authSubtitle = qs('authSubtitle');
  const authForm = qs('authForm');
  const authUsername = /** @type {HTMLInputElement} */ (qs('authUsername'));
  const authPassword = /** @type {HTMLInputElement} */ (qs('authPassword'));
  const authHint = qs('authHint');
  const authError = qs('authError');
  const authSubmitBtn = /** @type {HTMLButtonElement} */ (qs('authSubmitBtn'));
  const authSwitchRow = qs('authSwitchRow');
  const authSwitchText = qs('authSwitchText');
  const authToggleBtn = qs('authToggleBtn');

  let authMode = 'login';
  let lastAuthSignature = '';

  function showAuthError(message) {
    authError.textContent = message;
    authError.hidden = false;
  }

  function applyMode(mode, registrationEnabled) {
    authMode = mode;
    authError.hidden = true;

    if (mode === 'setup') {
      authTitle.textContent = 'Initial administrator setup';
      authSubtitle.textContent = 'Create the primary administrator account to lock down this workspace.';
      authPassword.autocomplete = 'new-password';
      authHint.hidden = false;
      authSubmitBtn.textContent = 'Create admin account';
      authSwitchRow.hidden = true;
    } else if (mode === 'register') {
      authTitle.textContent = 'Create researcher account';
      authSubtitle.textContent = 'Register a private workspace isolated to your saved baselines.';
      authPassword.autocomplete = 'new-password';
      authHint.hidden = false;
      authSubmitBtn.textContent = 'Create account';
      authSwitchText.textContent = 'Already have an account?';
      authToggleBtn.textContent = 'Sign in';
      authSwitchRow.hidden = false;
    } else {
      authTitle.textContent = 'Sign in to DeltaCheck';
      authSubtitle.textContent = 'Authenticate to access your private research baseline threads.';
      authPassword.autocomplete = 'current-password';
      authHint.hidden = true;
      authSubmitBtn.textContent = 'Sign in';
      authSwitchText.textContent = 'Need an account?';
      authToggleBtn.textContent = 'Create account';
      authSwitchRow.hidden = !registrationEnabled;
    }
  }

  authToggleBtn.addEventListener('click', () => {
    const { setupRequired, registrationEnabled } = store.getState().auth;
    if (setupRequired) return;
    applyMode(authMode === 'login' ? 'register' : 'login', registrationEnabled);
    authError.hidden = true;
    authUsername.focus();
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = authUsername.value.trim();
    const password = authPassword.value;
    if (!username || !password) {
      showAuthError('Enter both username and password.');
      return;
    }

    authSubmitBtn.disabled = true;
    authError.hidden = true;
    try {
      await onSubmitCredentials(/** @type {'setup' | 'login' | 'register'} */ (authMode), username, password);
      authPassword.value = '';
    } catch (err) {
      showAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      authSubmitBtn.disabled = false;
    }
  });

  function render(state) {
    const { authenticated, setupRequired, registrationEnabled } = state.auth;
    const signature = `${authenticated}:${setupRequired}:${registrationEnabled}`;
    if (signature === lastAuthSignature) return;
    lastAuthSignature = signature;

    if (authenticated) {
      authGate.hidden = true;
      authError.hidden = true;
      return;
    }

    applyMode(setupRequired ? 'setup' : 'login', registrationEnabled);
    authGate.hidden = false;
    authUsername.focus();
  }

  store.subscribe(render);

  return {
    openLoginPrompt() {
      const { setupRequired, registrationEnabled } = store.getState().auth;
      applyMode(setupRequired ? 'setup' : 'login', registrationEnabled);
      authGate.hidden = false;
      authUsername.focus();
    },
  };
}

