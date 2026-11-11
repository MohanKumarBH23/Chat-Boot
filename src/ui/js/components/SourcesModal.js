/**
 * Sources & query log inspector modal component.
 * @module ui/components/SourcesModal
 */
import { createQueryLine, createSourceAnchor, qs } from '../utils/dom.js';

/**
 * Mounts the Sources Inspector dialog.
 * @param {{
 *   store: import('../state/store.js').store,
 *   onClose: () => void
 * }} deps
 */
export function mountSourcesModal({ store, onClose }) {
  const modal = qs('inspectorModal');
  const closeBtn = qs('closeInspectorBtn');
  const content = qs('inspectorContent');

  let wasOpen = false;

  closeBtn.addEventListener('click', onClose);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      onClose();
    }
  });

  function renderInspectorBody(conversation) {
    content.replaceChildren();
    if (!conversation) {
      const empty = document.createElement('p');
      empty.className = 'empty-inspector';
      empty.textContent = 'No sources retrieved in the current thread.';
      content.appendChild(empty);
      return;
    }

    const turns = conversation.messages.filter(
      (m) => m.role === 'assistant' && ((m.sources && m.sources.length > 0) || (m.queries && m.queries.length > 0))
    );

    if (turns.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-inspector';
      empty.textContent = 'No sources retrieved in the current thread.';
      content.appendChild(empty);
      return;
    }

    for (const turn of turns) {
      const block = document.createElement('div');
      block.className = 'inspector-turn';

      if (Array.isArray(turn.queries) && turn.queries.length > 0) {
        const qRow = document.createElement('div');
        qRow.className = 'ledger-queries';
        for (const q of turn.queries) {
          qRow.appendChild(createQueryLine(q));
        }
        block.appendChild(qRow);
      }

      if (Array.isArray(turn.sources)) {
        for (const source of turn.sources) {
          block.appendChild(createSourceAnchor(source, true));
        }
      }

      content.appendChild(block);
    }
  }

  function render(state) {
    const isOpen = state.activeModal === 'inspector';
    if (isOpen && !wasOpen) {
      renderInspectorBody(state.activeConversation);
      modal.hidden = false;
      closeBtn.focus();
    } else if (!isOpen && wasOpen) {
      modal.hidden = true;
    }
    wasOpen = isOpen;
  }

  store.subscribe(render);
  render(store.getState());
}

