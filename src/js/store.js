// Single source of truth for prompts/folders/categories/prefs/view. Persists to the backend.
import { api } from './api.js';
import { DEFAULT_PREFS, DEFAULT_VIEW, CATEGORY_COLORS, SCHEMA, normalizeData, mergeData } from './lib/data.js';
import { descendantFolderIds } from './lib/sort.js';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export const state = {
  folders: [], prompts: [], categories: [],
  prefs: { ...DEFAULT_PREFS }, view: { ...DEFAULT_VIEW },
  ui: { search: '', page: 'list', renamingFolder: null },
  device: {},
};

const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
let timer;
const notify = () => listeners.forEach((f) => f());
function commit() { notify(); clearTimeout(timer); timer = setTimeout(flush, 350); }
/** UI-only change (search text, page): re-render but don't persist. */
export function touchUi() { notify(); }

export const exportable = () => ({ schema: SCHEMA, folders: state.folders, prompts: state.prompts, categories: state.categories, prefs: state.prefs, view: state.view });
export const serialize = (extra = {}) => JSON.stringify({ ...extra, ...exportable() });
export async function flush() { clearTimeout(timer); try { await api.saveData(serialize(), state.prefs.autoExport); } catch (e) { console.error('save failed', e); } }

function adopt(d) { state.folders = d.folders; state.prompts = d.prompts; state.categories = d.categories; state.prefs = d.prefs; state.view = d.view; }

export async function load() {
  state.device = (await api.device()) || {};
  const raw = await api.loadData();
  if (raw) { try { adopt(normalizeData(JSON.parse(raw))); } catch (e) { console.error('bad data file', e); } }
}

const siblingsMax = (parentId) => Math.max(-1, ...state.folders.filter((f) => f.parentId === parentId).map((f) => f.order),
  ...state.prompts.filter((p) => p.folderId === parentId).map((p) => p.order)) + 1;

// ── prompts ──
export function addPrompt({ title, body, category = null, platform = '', folderId = null }) {
  const t = Date.now();
  const p = { id: uid(), title, body, category, platform, folderId, createdAt: t, modifiedAt: t, order: siblingsMax(folderId), useCount: 0, lastUsedAt: 0 };
  state.prompts.push(p);
  commit();
  return p;
}
export function updatePrompt(id, patch) {
  const p = state.prompts.find((x) => x.id === id);
  if (!p) return;
  if (patch.folderId !== undefined && patch.folderId !== p.folderId) patch.order = siblingsMax(patch.folderId);
  Object.assign(p, patch, { modifiedAt: Date.now() });
  commit();
}
export function deletePrompt(id) { state.prompts = state.prompts.filter((p) => p.id !== id); commit(); }
export function duplicatePrompt(id) {
  const p = state.prompts.find((x) => x.id === id);
  if (p) addPrompt({ title: p.title + ' (copy)', body: p.body, category: p.category, platform: p.platform, folderId: p.folderId });
}
export function recordUse(id) {
  const p = state.prompts.find((x) => x.id === id);
  if (!p) return;
  p.useCount = (p.useCount || 0) + 1; p.lastUsedAt = Date.now();
  commit();
}
export function clearUsage() { state.prompts.forEach((p) => { p.useCount = 0; p.lastUsedAt = 0; }); commit(); }

// ── folders ──
export function addFolder(parentId = null, name = 'New folder') {
  const t = Date.now();
  const f = { id: uid(), name, parentId, createdAt: t, modifiedAt: t, order: siblingsMax(parentId) };
  state.folders.push(f);
  if (parentId && !state.view.expanded.includes(parentId)) state.view.expanded.push(parentId);
  state.view.expanded.push(f.id);
  state.ui.renamingFolder = f.id;
  commit();
  return f;
}
export function renameFolder(id, name) {
  const f = state.folders.find((x) => x.id === id);
  state.ui.renamingFolder = null;
  if (f && name.trim()) { f.name = name.trim(); f.modifiedAt = Date.now(); }
  commit();
}
/** mode 'all' deletes the contents too; 'keep' moves them to the parent folder. */
export function deleteFolder(id, mode) {
  const f = state.folders.find((x) => x.id === id);
  if (!f) return;
  if (mode === 'all') {
    const ids = descendantFolderIds(state, id);
    state.folders = state.folders.filter((x) => !ids.has(x.id));
    state.prompts = state.prompts.filter((p) => !ids.has(p.folderId));
  } else {
    state.folders.forEach((x) => { if (x.parentId === id) { x.parentId = f.parentId; x.order = siblingsMax(f.parentId); } });
    state.prompts.forEach((p) => { if (p.folderId === id) { p.folderId = f.parentId; p.order = siblingsMax(f.parentId); } });
    state.folders = state.folders.filter((x) => x.id !== id);
  }
  state.view.expanded = state.view.expanded.filter((x) => state.folders.some((fo) => fo.id === x));
  commit();
}
export function toggleExpanded(id) {
  const e = state.view.expanded;
  state.view.expanded = e.includes(id) ? e.filter((x) => x !== id) : [...e, id];
  commit();
}
export function expand(id) { if (!state.view.expanded.includes(id)) { state.view.expanded.push(id); commit(); } }

/**
 * Free-mode drag & drop. `drag` = {kind,id}; place into `parentId` at `index` among that
 * parent's mixed children (folders + prompts). Rejects dropping a folder into itself.
 */
export function moveNode(drag, parentId, index) {
  if (drag.kind === 'folder' && parentId && descendantFolderIds(state, drag.id).has(parentId)) return false;
  const kids = [
    ...state.folders.filter((f) => f.parentId === parentId).map((f) => ({ kind: 'folder', id: f.id, ref: f, order: f.order })),
    ...state.prompts.filter((p) => p.folderId === parentId).map((p) => ({ kind: 'prompt', id: p.id, ref: p, order: p.order })),
  ].sort((a, b) => a.order - b.order);
  const dragged = (drag.kind === 'folder' ? state.folders : state.prompts).find((x) => x.id === drag.id);
  if (!dragged) return false;
  const fromIdx = kids.findIndex((k) => k.kind === drag.kind && k.id === drag.id);
  const rest = kids.filter((k) => !(k.kind === drag.kind && k.id === drag.id));
  let at = index;
  if (fromIdx !== -1 && fromIdx < index) at -= 1;
  rest.splice(Math.max(0, Math.min(at, rest.length)), 0, { kind: drag.kind, id: drag.id, ref: dragged });
  rest.forEach((k, i) => { k.ref.order = i; });
  if (drag.kind === 'folder') dragged.parentId = parentId; else dragged.folderId = parentId;
  dragged.modifiedAt = Date.now();
  if (parentId) expand(parentId);
  commit();
  return true;
}

// ── categories ──
export function addCategory(name) {
  name = name.trim();
  const same = state.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (same) return same;
  const c = { id: uid(), name, color: CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length] };
  state.categories.push(c);
  commit();
  return c;
}
export function renameCategory(id, name) { const c = state.categories.find((x) => x.id === id); if (c && name.trim()) { c.name = name.trim(); commit(); } }
export function deleteCategory(id) {
  state.categories = state.categories.filter((c) => c.id !== id);
  state.prompts.forEach((p) => { if (p.category === id) p.category = null; });
  state.view.categoryFilter = state.view.categoryFilter.filter((x) => x !== id);
  commit();
}

// ── prefs / view ──
export function setPref(key, value, { quiet = false } = {}) {
  state.prefs[key] = value;
  if (quiet) { clearTimeout(timer); timer = setTimeout(flush, 350); } else commit();
}
export function setView(patch) { Object.assign(state.view, patch); commit(); }

// ── import ──
export function importData(raw, mode) {
  const incoming = normalizeData(raw);
  if (mode === 'replace') adopt({ ...incoming, prefs: state.prefs, view: { ...state.view, expanded: [], categoryFilter: [] } });
  else { const m = mergeData(exportable(), incoming, uid); adopt({ ...m, prefs: state.prefs, view: state.view }); }
  commit();
  return incoming;
}
