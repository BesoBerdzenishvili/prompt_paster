import { h, $ } from './dom.js';
import { icon } from '../icons.js';
import { state, toggleExpanded, renameFolder, deleteFolder, deletePrompt, duplicatePrompt, addFolder, moveNode, expand } from '../store.js';
import { buildTree, buildFavs, buildRecent, passingIds, isFiltering, folderPath } from '../lib/sort.js';
import { extractVars } from '../lib/vars.js';
import { confirmDialog } from './modal.js';
import { openPromptModal } from './promptModal.js';

let onPaste = () => {};
export const setPasteHandler = (fn) => { onPaste = fn; };

const catOf = (id) => state.categories.find((c) => c.id === id);
let drag = null; // {kind,id}
let expandTimer;

export function renderList() {
  const root = $('#list');
  const scroll = $('#body').scrollTop;
  const pass = passingIds(state);
  const free = state.view.mode === 'free' && state.view.tab === 'main' && !isFiltering(state);
  root.classList.toggle('free', free);
  root.replaceChildren();
  let count = 0;

  if (state.view.tab === 'main') {
    const tree = buildTree(state, pass);
    const forceOpen = isFiltering(state);
    const walk = (nodes, depth, parent) => nodes.forEach((n) => {
      if (n.type === 'folder') {
        const open = forceOpen || state.view.expanded.includes(n.folder.id);
        parent.append(folderRow(n, depth, open, free));
        if (open && n.children.length) {
          const box = h('div', { class: 'children' });
          parent.append(box);
          walk(n.children, depth + 1, box);
        } else if (open && !forceOpen) {
          parent.append(h('div', { class: 'empty-folder', style: `margin-left:${14 + depth * 14}px` }, 'Empty folder'));
        }
      } else { count++; parent.append(itemRow(n.prompt, free, false)); }
    });
    walk(tree, 0, root);
    if (free) addRootDropZone(root);
    if (!tree.length) root.append(emptyState());
  } else {
    const list = state.view.tab === 'favs' ? buildFavs(state, pass) : buildRecent(state, pass);
    list.forEach((p) => { count++; root.append(itemRow(p, false, true)); });
    if (!list.length) root.append(emptyState());
  }
  $('#body').scrollTop = scroll;
  const rename = $('.folder-name-input', root);
  if (rename) { rename.focus(); rename.select(); }
}

function emptyState() {
  const tab = state.view.tab;
  const filtering = isFiltering(state);
  const msg = filtering ? ['No matches', 'Try a different search or clear the category filter.']
    : tab === 'favs' ? ['No favourites yet', 'Your most used prompts will show up here.']
    : tab === 'recent' ? ['Nothing used recently', 'Prompts you paste will show up here.']
    : ['No prompts yet', 'Press ＋ to create your first prompt.'];
  return h('div', { class: 'empty' }, h('div', { class: 'empty-icon', html: icon(tab === 'main' && !filtering ? 'prompt' : 'search', 28) }), h('strong', {}, msg[0]), h('span', {}, msg[1]));
}

function itemRow(p, free, showPath) {
  const cat = catOf(p.category);
  const vars = extractVars(p.body).length;
  const el = h('div', { class: 'item', tabIndex: 0, role: 'button', dataset: { kind: 'prompt', id: p.id }, draggable: free,
    onclick: (e) => { if (!e.target.closest('.item-actions')) onPaste(p); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === el) { e.preventDefault(); onPaste(p); } } },
    free && h('span', { class: 'grip', html: icon('grip', 16) }),
    h('div', { class: 'item-main' },
      h('div', { class: 'item-title' }, p.title),
      state.prefs.expandAll && h('div', { class: 'item-body' }, p.body),
      h('div', { class: 'item-meta' },
        cat && h('span', { class: 'chip cat' }, h('i', { style: `background:${cat.color}` }), cat.name),
        p.platform && h('span', { class: 'chip' }, p.platform),
        vars > 0 && h('span', { class: 'chip var', title: `${vars} variable${vars > 1 ? 's' : ''}`, html: `${icon('braces', 12)}${vars}` }),
        showPath && p.folderId && h('span', { class: 'chip ghost' }, folderPath(state, p.folderId)))),
    h('div', { class: 'item-actions' },
      iconBtn('edit', 'Edit', () => openPromptModal({ prompt: p })),
      iconBtn('copy', 'Duplicate', () => duplicatePrompt(p.id)),
      iconBtn('trash', 'Delete', async () => {
        if (await confirmDialog({ title: 'Delete prompt?', message: `“${p.title}” will be permanently deleted.` })) deletePrompt(p.id);
      }, 'danger')));
  if (free) wireDnd(el, { kind: 'prompt', id: p.id }, false);
  return el;
}

function folderRow(n, depth, open, free) {
  const f = n.folder;
  const renaming = state.ui.renamingFolder === f.id;
  const finish = (save, input) => renameFolder(f.id, save ? input.value : f.name);
  const nameEl = renaming
    ? h('input', { class: 'folder-name-input', value: f.name, maxLength: 80,
        onclick: (e) => e.stopPropagation(),
        onkeydown: (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true, e.target); if (e.key === 'Escape') finish(false, e.target); },
        onblur: (e) => { if (state.ui.renamingFolder === f.id) finish(true, e.target); } })
    : h('span', { class: 'folder-name', ondblclick: (e) => { e.stopPropagation(); state.ui.renamingFolder = f.id; renderList(); } }, f.name);
  const el = h('div', { class: `folder ${open ? 'open' : ''}`, tabIndex: 0, dataset: { kind: 'folder', id: f.id }, draggable: free && !renaming,
    onclick: (e) => { if (!e.target.closest('.item-actions') && !renaming) toggleExpanded(f.id); },
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === el) toggleExpanded(f.id); } },
    free && h('span', { class: 'grip', html: icon('grip', 16) }),
    h('span', { class: 'chev', html: icon('chevron', 16) }),
    h('span', { class: 'folder-ico', html: icon('folder', 18) }),
    nameEl,
    h('span', { class: 'count' }, String(n.count)),
    h('div', { class: 'item-actions' },
      iconBtn('prompt', 'New prompt here', () => openPromptModal({ folderId: f.id })),
      iconBtn('folderPlus', 'New subfolder', () => addFolder(f.id)),
      iconBtn('edit', 'Rename', () => { state.ui.renamingFolder = f.id; renderList(); }),
      iconBtn('trash', 'Delete folder', () => askDeleteFolder(n), 'danger')));
  el.style.setProperty('--depth', depth);
  if (free) wireDnd(el, { kind: 'folder', id: f.id }, true);
  return el;
}

async function askDeleteFolder(n) {
  const f = n.folder;
  const empty = n.count === 0 && n.children.length === 0;
  const res = await confirmDialog({
    title: 'Delete folder?',
    message: empty ? `Folder “${f.name}” is empty and will be deleted.`
      : `“${f.name}” contains ${n.count} prompt${n.count === 1 ? '' : 's'}. Delete everything inside, or keep the contents by moving them up one level?`,
    confirmLabel: empty ? 'Delete' : 'Delete all',
    alt: empty ? null : { label: 'Keep contents', value: 'keep' },
  });
  if (res === true) deleteFolder(f.id, 'all');
  else if (res === 'keep') deleteFolder(f.id, 'keep');
}

const iconBtn = (name, title, fn, cls = '') =>
  h('button', { class: `icon-btn xs ${cls}`, type: 'button', title, 'aria-label': title, html: icon(name, 15), onclick: (e) => { e.stopPropagation(); fn(); } });

// ── drag & drop (free mode) ──
function zone(e, el, isFolder) {
  const r = el.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  if (isFolder) return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into';
  return y < 0.5 ? 'before' : 'after';
}
const clearMarks = () => document.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-into'));

function parentOf(ref) {
  const x = ref.kind === 'folder' ? state.folders.find((f) => f.id === ref.id) : state.prompts.find((p) => p.id === ref.id);
  return x ? (ref.kind === 'folder' ? x.parentId : x.folderId) : null;
}
function siblingIndex(parentId, ref) {
  const kids = [...state.folders.filter((f) => f.parentId === parentId).map((f) => ({ kind: 'folder', id: f.id, order: f.order })),
    ...state.prompts.filter((p) => p.folderId === parentId).map((p) => ({ kind: 'prompt', id: p.id, order: p.order }))].sort((a, b) => a.order - b.order);
  return kids.findIndex((k) => k.kind === ref.kind && k.id === ref.id);
}

function wireDnd(el, ref, isFolder) {
  el.addEventListener('dragstart', (e) => { drag = ref; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ref.id); setTimeout(() => el.classList.add('dragging'), 0); });
  el.addEventListener('dragend', () => { drag = null; el.classList.remove('dragging'); clearMarks(); clearTimeout(expandTimer); });
  el.addEventListener('dragover', (e) => {
    if (!drag || (drag.kind === ref.kind && drag.id === ref.id)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    clearMarks();
    const z = zone(e, el, isFolder);
    el.classList.add(`drop-${z}`);
    clearTimeout(expandTimer);
    if (isFolder && z === 'into' && !state.view.expanded.includes(ref.id)) expandTimer = setTimeout(() => expand(ref.id), 650);
  });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) el.classList.remove('drop-before', 'drop-after', 'drop-into'); });
  el.addEventListener('drop', (e) => {
    if (!drag) return;
    e.preventDefault(); e.stopPropagation();
    const z = zone(e, el, isFolder);
    const d = drag; drag = null; clearMarks();
    if (z === 'into') {
      const kids = state.folders.filter((f) => f.parentId === ref.id).length + state.prompts.filter((p) => p.folderId === ref.id).length;
      moveNode(d, ref.id, kids);
    } else {
      const parentId = parentOf(ref);
      const idx = siblingIndex(parentId, ref);
      moveNode(d, parentId, z === 'before' ? idx : idx + 1);
    }
  });
}

function addRootDropZone(root) {
  const zoneEl = h('div', { class: 'root-drop' }, 'Drop here to move to top level');
  zoneEl.addEventListener('dragover', (e) => { if (drag) { e.preventDefault(); zoneEl.classList.add('drop-into'); } });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drop-into'));
  zoneEl.addEventListener('drop', (e) => {
    if (!drag) return; e.preventDefault();
    const d = drag; drag = null; clearMarks();
    const kids = state.folders.filter((f) => !f.parentId).length + state.prompts.filter((p) => !p.folderId).length;
    moveNode(d, null, kids);
  });
  root.append(zoneEl);
}
