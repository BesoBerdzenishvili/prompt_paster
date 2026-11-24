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
  // Tauri only drags from the element that carries the attribute (not its children), so every part of the header has it.
  const D = { 'data-tauri-drag-region': true };
  const closeBtn = h('button', { class: 'icon-btn xs vclose', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', html: icon('x', 16),
      onclick: () => { current = null; api.hideVars(); } });
  const head = h('div', { class: 'vhead', ...D },
      h('span', { class: 'vico', html: icon('braces', 16), ...D }),
      h('div', { class: 'vtext', ...D }, h('div', { class: 'vtitle', ...D }, 'Fill in the variables'), h('div', { class: 'vsub', ...D }, p.title)),
      closeBtn);
  const list = h('div', { class: 'vrows' }, rows);
  const foot = h('div', { class: 'vfoot' },
      h('span', { class: 'vhint' }, h('kbd', {}, 'Tab'), ' next  ', h('kbd', {}, '↵'), ' paste  ', h('kbd', {}, 'Esc'), ' cancel'),
      h('button', { class: 'vbtn', type: 'submit' }, 'Paste'));
  const grip = h('div', { class: 'vgrip', title: 'Resize', onmousedown: (e) => { if (e.button === 0) { e.preventDefault(); api.startResize('SouthEast'); } } });
  box.replaceChildren(head, list, foot, grip);
  requestAnimationFrame(() => {
    inputs[0]?.focus();
    // Natural height = header + ALL rows (scrollHeight, even if currently clipped) + footer + padding/gaps.
    // The backend grows the window to this, capped at the screen height; beyond that the rows scroll.
    const cs = getComputedStyle(box);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), gap = parseFloat(cs.rowGap) || 0;
    api.presentVars(Math.ceil(head.offsetHeight + list.scrollHeight + foot.offsetHeight + pad + gap * 2 + 2)*1.3);
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
