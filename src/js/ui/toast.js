import { h, $ } from './dom.js';
let t;
export function toast(message, kind = 'info') {
  const root = $('#toast-root');
  root.replaceChildren(h('div', { class: `toast ${kind}` }, message));
  requestAnimationFrame(() => root.firstChild?.classList.add('show'));
  clearTimeout(t);
  t = setTimeout(() => root.firstChild?.classList.remove('show'), 2600);
}
