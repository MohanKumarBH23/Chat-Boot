/**
 * Dismissible workspace notification banner bound to `store.errorBanner`.
 * @module ui/components/ErrorBanner
 */
import { qs } from '../utils/dom.js';

/**
 * Mounts the workspace error banner component.
 * @param {{ store: import('../state/store.js').store }} deps
 */
export function mountErrorBanner({ store }) {
  const banner = qs('errorBanner');
  const textEl = qs('errorBannerText');
  const dismissBtn = qs('errorBannerDismiss');

  dismissBtn.addEventListener('click', () => {
    store.clearError();
  });

  function render(state) {
    if (!state.errorBanner) {
      banner.hidden = true;
      textEl.textContent = '';
      return;
    }
    textEl.textContent = state.errorBanner;
    banner.hidden = false;
  }

  store.subscribe(render);
  render(store.getState());
}

