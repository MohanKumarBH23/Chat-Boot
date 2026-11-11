/**
 * Administration diagnostics & user management modal component.
 * @module ui/components/AdminModal
 */
import { qs } from '../utils/dom.js';

/**
 * Mounts the Admin Panel modal component.
 * @param {{
 *   store: import('../state/store.js').store,
 *   onClose: () => void,
 *   onRefresh: () => Promise<void>,
 *   onSeed: () => Promise<void>,
 *   onRemoveUser: (userId: string) => Promise<void>
 * }} deps
 */
export function mountAdminModal({ store, onClose, onRefresh, onSeed, onRemoveUser }) {
  const modal = qs('adminModal');
  const closeBtn = qs('closeAdminBtn');
  const seedBtn = /** @type {HTMLButtonElement} */ (qs('adminSeedBtn'));
  const refreshBtn = qs('adminRefreshBtn');
  const content = qs('adminContent');

  let wasOpen = false;
  let lastAdminState = null;

  closeBtn.addEventListener('click', onClose);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      onClose();
    }
  });

  refreshBtn.addEventListener('click', () => {
    void onRefresh();
  });

  seedBtn.addEventListener('click', async () => {
    seedBtn.disabled = true;
    try {
      await onSeed();
    } finally {
      seedBtn.disabled = false;
    }
  });

  function renderAdminBody(adminState, currentUser) {
    content.replaceChildren();

    if (adminState.loading) {
      const loading = document.createElement('p');
      loading.className = 'empty-inspector';
      loading.textContent = 'Loading system diagnostics...';
      content.appendChild(loading);
      return;
    }

    if (adminState.error) {
      const errMsg = document.createElement('p');
      errMsg.className = 'empty-inspector';
      errMsg.textContent = adminState.error;
      content.appendChild(errMsg);
      return;
    }

    const overview = adminState.overview;
    if (!overview) return;

    const runtimeSec = document.createElement('section');
    runtimeSec.className = 'admin-section';
    const runtimeTitle = document.createElement('h3');
    runtimeTitle.className = 'admin-section-title';
    runtimeTitle.textContent = 'Runtime & storage posture';
    runtimeSec.appendChild(runtimeTitle);

    const grid = document.createElement('div');
    grid.className = 'admin-grid';
    const stats = [
      ['Environment', String(overview.nodeEnv || 'unknown')],
      ['Search provider', String(overview.searchProvider || 'mock')],
      ['Model', String(overview.model || 'none')],
      ['At-rest encryption', overview.encryptionAtRestEnabled ? 'AES-256-GCM' : 'File mode 0600'],
      ['Active sessions', String(overview.activeSessions ?? 0)],
      ['Stored threads', String(overview.totalConversations ?? 0)],
    ];
    for (const [label, val] of stats) {
      const card = document.createElement('div');
      card.className = 'admin-stat';
      const l = document.createElement('span');
      l.className = 'admin-stat-label';
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'admin-stat-val';
      v.textContent = val;
      card.appendChild(l);
      card.appendChild(v);
      grid.appendChild(card);
    }
    runtimeSec.appendChild(grid);
    content.appendChild(runtimeSec);

    const envSec = document.createElement('section');
    envSec.className = 'admin-section';
    const envTitle = document.createElement('h3');
    envTitle.className = 'admin-section-title';
    envTitle.textContent = 'Redacted environment variables (values never exposed)';
    envSec.appendChild(envTitle);

    const kvList = document.createElement('div');
    kvList.className = 'admin-kv-list';
    for (const [key, status] of Object.entries(overview.envStatus || {})) {
      const row = document.createElement('div');
      row.className = 'admin-kv-row';
      const keySpan = document.createElement('span');
      keySpan.textContent = key;
      const badge = document.createElement('span');
      badge.className = `admin-badge ${status === 'SET' ? 'ok' : 'warn'}`;
      badge.textContent = String(status);
      row.appendChild(keySpan);
      row.appendChild(badge);
      kvList.appendChild(row);
    }
    envSec.appendChild(kvList);
    content.appendChild(envSec);

    const users = Array.isArray(adminState.users) ? adminState.users : [];
    const usersSec = document.createElement('section');
    usersSec.className = 'admin-section';
    const usersTitle = document.createElement('h3');
    usersTitle.className = 'admin-section-title';
    usersTitle.textContent = `Registered accounts (${users.length})`;
    usersSec.appendChild(usersTitle);

    const usersList = document.createElement('div');
    usersList.className = 'admin-kv-list';
    for (const u of users) {
      const row = document.createElement('div');
      row.className = 'admin-user-row';

      const meta = document.createElement('div');
      meta.className = 'admin-user-meta';
      const nameEl = document.createElement('span');
      nameEl.className = 'admin-user-name';
      nameEl.textContent = u.username;
      const subEl = document.createElement('span');
      subEl.className = 'admin-user-sub';
      subEl.textContent = `${u.role} · created ${(u.createdAt || '').split('T')[0]}`;
      meta.appendChild(nameEl);
      meta.appendChild(subEl);
      row.appendChild(meta);

      if (currentUser && u.id !== currentUser.id) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'danger-btn';
        delBtn.textContent = 'Remove';
        delBtn.addEventListener('click', async () => {
          delBtn.disabled = true;
          try {
            await onRemoveUser(u.id);
          } catch {
            delBtn.disabled = false;
          }
        });
        row.appendChild(delBtn);
      } else {
        const selfTag = document.createElement('span');
        selfTag.className = 'admin-badge ok';
        selfTag.textContent = 'Active';
        row.appendChild(selfTag);
      }

      usersList.appendChild(row);
    }
    usersSec.appendChild(usersList);
    content.appendChild(usersSec);
  }

  function render(state) {
    const isOpen = state.activeModal === 'admin';
    if (isOpen && !wasOpen) {
      modal.hidden = false;
      closeBtn.focus();
      renderAdminBody(state.adminState, state.auth.user);
    } else if (!isOpen && wasOpen) {
      modal.hidden = true;
    } else if (isOpen && state.adminState !== lastAdminState) {
      renderAdminBody(state.adminState, state.auth.user);
    }
    wasOpen = isOpen;
    lastAdminState = state.adminState;
  }

  store.subscribe(render);
  render(store.getState());
}

