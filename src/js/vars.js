// Entry for the small "fill in variables" window.
import { api, listen } from './api.js';
import { fillVars } from './lib/vars.js';
import { h } from './ui/dom.js';
import { icon } from './icons.js';

const box = document.getElementById('vbox');
let current = null;

function render(p) {
  current = p;
  const inputs = p.vars.map((name) => h('input', { type: 'text', name, spellcheck: false, autocomplete: 'off', placeholder: 'leave empty to keep {' + name + '}' }));
  const rows = p.vars.map((name, i) => h('label', { class: 'vrow' }, h('span', { class: 'vname' }, name), inputs[i]));
  const head = h('div', { class: 'vhead', 'data-tauri-drag-region': true },
      h('span', { class: 'vico', html: icon('braces', 16) }),
      h('div', {}, h('div', { class: 'vtitle' }, 'Fill in the variables'), h('div', { class: 'vsub' }, p.title)));
  const list = h('div', { class: 'vrows' }, rows);
  const foot = h('div', { class: 'vfoot' },
      h('span', { class: 'vhint' }, h('kbd', {}, 'Tab'), ' next  ', h('kbd', {}, '↵'), ' paste  ', h('kbd', {}, 'Esc'), ' cancel'),
      h('button', { class: 'vbtn', type: 'submit' }, 'Paste'));
  box.replaceChildren(head, list, foot);
  requestAnimationFrame(() => {
    inputs[0]?.focus();
    // Natural height = header + ALL rows (scrollHeight, even if currently clipped) + footer + padding/gaps.
    // The backend grows the window to this, capped at the screen height; beyond that the rows scroll.
    const cs = getComputedStyle(box);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), gap = parseFloat(cs.rowGap) || 0;
    api.presentVars(Math.ceil(head.offsetHeight + list.scrollHeight + foot.offsetHeight + pad + gap * 2 + 2));
  });
}

box.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const values = {};
  new FormData(box).forEach((v, k) => { values[k] = String(v); });
  const { body, id, restore } = current;
  current = null;
  await api.pasteText(fillVars(body, values), restore, id);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); current = null; api.hideWindows(); }
});

listen('vars:open', (e) => render(e.payload));
