import { h, $ } from './dom.js';
import { icon } from '../icons.js';
import { state, setView, addCategory, renameCategory, deleteCategory } from '../store.js';
import { SORT_FIELDS, NO_CATEGORY } from '../lib/sort.js';
import { confirmDialog } from './modal.js';
import { pushLayer } from './layers.js';

let open = null; // {close, render}
let editingCat = null;
let adding = false;

export const isSortOpen = () => !!open;
export const refreshSortPopup = () => open?.render();

export function toggleSortPopup(anchorBtn) {
  if (open) { open.close(); return; }
  const root = $('#popover-root');
  const backdrop = h('div', { class: 'popover-backdrop' });
  const pop = h('div', { class: 'popover glass-strong sort-pop' });
  backdrop.append(pop);
  root.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  anchorBtn.classList.add('active');
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  const unlayer = pushLayer(() => close());
  function close() {
    unlayer(); open = null; editingCat = null; adding = false;
    anchorBtn.classList.remove('active');
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 180);
  }
  open = { close, render: () => render(pop) };
  render(pop);
}

function render(pop) {
  const v = state.view;
  const seg = (id, label) => h('button', { type: 'button', class: v.mode === id ? 'on' : '', onclick: () => setView({ mode: id }) }, label);
  pop.replaceChildren(...[
    h('div', { class: 'pop-title' }, 'Arrange'),
    h('div', { class: 'segmented' }, seg('sort', 'Sort'), seg('category', 'Category'), seg('free', 'Free')),
    v.mode !== 'free' && h('div', { class: 'pop-section' },
      h('div', { class: 'pop-label' }, 'Order by'),
      h('div', { class: 'chips-row' },
        SORT_FIELDS.map((f) => h('button', { type: 'button', class: `pill ${v.sortField === f.id ? 'on' : ''}`, onclick: () => setView({ sortField: f.id }) }, f.label)),
        h('button', { type: 'button', class: 'pill dir', title: v.sortDir === 'asc' ? 'Ascending' : 'Descending',
          html: icon(v.sortDir === 'asc' ? 'up' : 'down', 14) + (v.sortDir === 'asc' ? 'Asc' : 'Desc'),
          onclick: () => setView({ sortDir: v.sortDir === 'asc' ? 'desc' : 'asc' }) }))),
    v.mode === 'category' && categorySection(),
    v.mode === 'free' && h('p', { class: 'pop-note' }, 'Drag folders and prompts by the handle to put them in any order, or onto a folder to move them inside. Your order is remembered.'),
    v.mode === 'sort' && h('p', { class: 'pop-note' }, 'Folders always come first. Switch to Free to arrange things by hand.')].filter(Boolean));
  pop.querySelector('[data-autofocus]')?.focus();
}

function categorySection() {
  const v = state.view;
  const counts = new Map();
  state.prompts.forEach((p) => counts.set(p.category || NO_CATEGORY, (counts.get(p.category || NO_CATEGORY) || 0) + 1));
  const toggle = (id) => setView({ categoryFilter: v.categoryFilter.includes(id) ? v.categoryFilter.filter((x) => x !== id) : [...v.categoryFilter, id] });
  const check = (id, label, color, count) => h('label', { class: 'cat-row' },
    h('input', { type: 'checkbox', checked: v.categoryFilter.includes(id), onchange: () => toggle(id) }),
    h('span', { class: 'check', html: icon('check', 13) }),
    color && h('i', { class: 'dot', style: `background:${color}` }),
    h('span', { class: 'cat-name' }, label),
    h('span', { class: 'count' }, String(count)));

  const rows = state.categories.map((c) => {
    if (editingCat === c.id) {
      const input = h('input', { class: 'field sm', value: c.name, 'data-autofocus': true, maxLength: 40,
        onkeydown: (e) => { if (e.key === 'Enter') { const val = e.target.value; editingCat = null; renameCategory(c.id, val); } if (e.key === 'Escape') { e.stopPropagation(); editingCat = null; refreshSortPopup(); } } });
      return h('div', { class: 'cat-row editing' }, h('i', { class: 'dot', style: `background:${c.color}` }), input,
        h('button', { class: 'icon-btn xs', type: 'button', title: 'Save', html: icon('check', 15), onclick: () => { const val = input.value; editingCat = null; renameCategory(c.id, val); } }));
    }
    const row = check(c.id, c.name, c.color, counts.get(c.id) || 0);
    row.append(h('span', { class: 'row-actions' },
      h('button', { class: 'icon-btn xs', type: 'button', title: 'Rename category', html: icon('edit', 14), onclick: (e) => { e.preventDefault(); editingCat = c.id; refreshSortPopup(); } }),
      h('button', { class: 'icon-btn xs danger', type: 'button', title: 'Delete category', html: icon('trash', 14), onclick: async (e) => {
        e.preventDefault();
        if (await confirmDialog({ title: 'Delete category?', message: `“${c.name}” will be removed. Prompts in it become uncategorised (they are not deleted).` })) deleteCategory(c.id);
      } })));
    return row;
  });

  const addRow = adding
    ? h('div', { class: 'cat-row editing' }, h('input', { class: 'field sm', placeholder: 'Category name', 'data-autofocus': true, maxLength: 40,
        onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { const val = e.target.value; adding = false; addCategory(val); } if (e.key === 'Escape') { e.stopPropagation(); adding = false; refreshSortPopup(); } } }))
    : h('button', { class: 'add-cat', type: 'button', html: icon('plus', 15) + 'Add category', onclick: () => { adding = true; refreshSortPopup(); } });

  return h('div', { class: 'pop-section' },
    h('div', { class: 'pop-label' }, 'Show only', h('button', { class: 'link', type: 'button', onclick: () => setView({ categoryFilter: [] }) }, 'Clear')),
    h('div', { class: 'cat-list' }, rows, counts.get(NO_CATEGORY) ? check(NO_CATEGORY, 'Uncategorised', null, counts.get(NO_CATEGORY)) : null),
    addRow,
    h('p', { class: 'pop-note' }, v.categoryFilter.length ? 'Only checked categories are shown.' : 'Nothing checked – everything is shown.'));
}
