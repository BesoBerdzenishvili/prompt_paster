import { h, $ } from './dom.js';
import { icon } from '../icons.js';
import { pushLayer } from './layers.js';

/** Generic glass modal. Returns {close, card}. */
export function openModal({ title, body, footer, onClose, className = '' }) {
  const overlay = h('div', { class: 'overlay' });
  const closeBtn = h('button', { class: 'icon-btn sm', type: 'button', title: 'Close', html: icon('x', 16), onclick: () => close() });
  const card = h('div', { class: `modal glass-strong ${className}`, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'modal-head' }, h('h2', {}, title), closeBtn), body, footer);
  overlay.append(card);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  $('#modal-root').append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  let closed = false;
  const unlayer = pushLayer(() => close());
  function close(result) {
    if (closed) return;
    closed = true; unlayer();
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 180);
    onClose?.(result);
  }
  return { close, card };
}

/**
 * Confirmation prompt. Resolves to true (confirm), `alt.value` (alternate button) or false (cancel).
 * Every destructive action in the app goes through this.
 */
export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true, alt = null }) {
  return new Promise((resolve) => {
    let result = false;
    const done = (v) => { result = v; modal.close(); };
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Cancel');
    const ok = h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => done(true) }, confirmLabel);
    const altBtn = alt && h('button', { class: 'btn', type: 'button', onclick: () => done(alt.value) }, alt.label);
    const modal = openModal({
      title, className: 'confirm',
      body: h('p', { class: 'confirm-msg' }, message),
      footer: h('div', { class: 'modal-foot' }, cancel, altBtn, ok),
      onClose: () => resolve(result),
    });
    cancel.focus();
  });
}
