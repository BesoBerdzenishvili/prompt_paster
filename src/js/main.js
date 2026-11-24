import { api, listen } from './api.js';
import { hydrateIcons, icon } from './icons.js';
import { h, $, $$ } from './ui/dom.js';
import { state, load, subscribe, touchUi, flush, serialize, addFolder, recordUse, setView, importData } from './store.js';
import { renderList, setPasteHandler } from './ui/list.js';
import { openPromptModal } from './ui/promptModal.js';
import { toggleSortPopup, isSortOpen, refreshSortPopup } from './ui/sortPopup.js';
import { renderSettings, openSettings, closeSettings } from './ui/settings.js';
import { applyTheme } from './ui/theme.js';
import { confirmDialog } from './ui/modal.js';
import { closeTopLayer, hasLayers, pushLayer } from './ui/layers.js';
import { toast } from './ui/toast.js';
import { extractVars, fillVars } from './lib/vars.js';
import { detectPlatform } from './lib/platform.js';

hydrateIcons();

// ── paste flow ─────────────────────────────────────────
async function pasteItem(p) {
  const vars = extractVars(p.body);
  if (vars.length) {
    await flush();
    await api.showVars({ id: p.id, title: p.title, body: p.body, vars, restore: state.prefs.restoreClipboard });
  } else {
    recordUse(p.id);
    await flush();
    await api.pasteText(fillVars(p.body, {}), state.prefs.restoreClipboard, null);
  }
}
setPasteHandler(pasteItem);

// ── tabs ───────────────────────────────────────────────
function renderTabs() {
  const tabs = ['main', 'favs', 'recent'];
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.view.tab));
  $('#tabs').style.setProperty('--i', tabs.indexOf(state.view.tab));
}
$$('#tabs button').forEach((b) => b.addEventListener('click', () => setView({ tab: b.dataset.tab })));

// ── toolbar ────────────────────────────────────────────
$('#btn-add').onclick = () => openPromptModal();
$('#btn-folder').onclick = () => { setView({ tab: 'main' }); addFolder(null); };
$('#btn-sort').onclick = (e) => toggleSortPopup(e.currentTarget);
$('#btn-settings').onclick = () => openSettings();
$('#btn-close').onclick = () => api.hideWindows();
let pinned = false;
$('#btn-pin').onclick = () => { pinned = !pinned; $('#btn-pin').classList.toggle('active', pinned); api.setPinned(pinned); toast(pinned ? 'Pinned – window stays open' : 'Unpinned'); };

// search (animated reveal from the button)
const bar = $('#searchbar'), input = $('#search-input'), wrap = $('#toolbar-wrap');
let removeSearchLayer = null;
function openSearch() {
  const b = $('#btn-search').getBoundingClientRect(), w = wrap.getBoundingClientRect();
  bar.style.setProperty('--sx', `${b.left - w.left + b.width / 2}px`);
  wrap.classList.add('searching'); bar.classList.add('open');
  removeSearchLayer ||= pushLayer(closeSearch);
  setTimeout(() => input.focus(), 120);
}
function closeSearch() {
  removeSearchLayer?.(); removeSearchLayer = null;
  wrap.classList.remove('searching'); bar.classList.remove('open');
  input.value = ''; input.blur();
  if (state.ui.search) { state.ui.search = ''; touchUi(); }
}
$('#btn-search').onclick = openSearch;
$('#search-close').onclick = closeSearch;
input.addEventListener('input', () => { state.ui.search = input.value; touchUi(); });
input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); $('#list .item, #list .folder')?.focus(); } });
$('#search-adv').onchange = (e) => setView({ advanced: e.target.checked });

// export: click = rewrite remembered file, hold 400ms = choose new location (fires at 400ms, not on release)
const exportBtn = $('#btn-export');
let holdTimer, held = false;
async function doExport(choose) {
  try {
    const path = await api.exportData(serialize({ app: 'prompt-paster', exportedAt: new Date().toISOString(), appVersion: state.device.version }), choose);
    if (path) { state.device.exportPath = path; toast(`Exported to ${path}`); }
  } catch (e) { toast(String(e), 'error'); }
}
exportBtn.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  held = false; exportBtn.classList.add('holding');
  holdTimer = setTimeout(() => { held = true; exportBtn.classList.remove('holding'); doExport(true); }, 400);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => exportBtn.addEventListener(ev, () => { clearTimeout(holdTimer); exportBtn.classList.remove('holding'); }));
exportBtn.addEventListener('click', () => { if (held) { held = false; return; } doExport(false); });

// import
$('#btn-import').onclick = async () => {
  try {
    const text = await api.importData();
    if (text == null) return;
    let raw; try { raw = JSON.parse(text); } catch { toast('That file is not valid JSON.', 'error'); return; }
    const n = (raw.prompts || []).length, f = (raw.folders || []).length;
    const choice = await confirmDialog({
      title: 'Import data?', confirmLabel: 'Replace everything', danger: true,
      message: `The file contains ${n} prompt${n === 1 ? '' : 's'} and ${f} folder${f === 1 ? '' : 's'}. Merge adds them to what you have; Replace deletes your current prompts and folders first.`,
      alt: { label: 'Merge', value: 'merge' },
    });
    if (!choice) return;
    importData(raw, choice === 'merge' ? 'merge' : 'replace');
    toast('Import complete');
  } catch (e) { toast(e.message || String(e), 'error'); }
};

// ── platform filter bar ────────────────────────────────
function renderPlatformBar(settings) {
  const el = $('#platform-bar');
  const name = settings ? null : detectPlatform(state);
  el.hidden = !name;
  if (!name) return;
  const all = !!state.ui.platformShowAll;
  el.replaceChildren(
    h('span', {}, all ? 'Showing all prompts' : [h('b', {}, name), ' prompts only']),
    h('button', { class: 'link', type: 'button', onclick: () => { state.ui.platformShowAll = !all; touchUi(); } }, all ? `Filter to ${name}` : 'Show all'));
}

// ── render ─────────────────────────────────────────────
function render() {
  const settings = state.ui.page === 'settings';
  $('#settings').hidden = !settings;
  $('#body').hidden = settings; $('#tabs').hidden = settings; $('#toolbar-wrap').hidden = settings;
  $('#search-adv').checked = !!state.view.advanced;
  $('#btn-sort').classList.toggle('filtered', state.view.mode === 'category' && state.view.categoryFilter.length > 0);
  renderTabs();
  renderPlatformBar(settings);
  if (!settings) renderList();
  if (isSortOpen()) refreshSortPopup();
}
subscribe(() => { render(); });

// ── keyboard ───────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (closeTopLayer()) return;
    if (state.ui.page === 'settings') { closeSettings(); return; }
    api.hideWindows();
    return;
  }
  if (hasLayers() && state.ui.page === 'list' && $('#modal-root').children.length) return;
  const items = $$('#list .item, #list .folder');
  const cur = items.indexOf(document.activeElement);
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && state.ui.page === 'list' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? Math.min(items.length - 1, cur + 1) : Math.max(0, cur - 1);
    items[next]?.focus();
  } else if (e.key === 'ArrowUp' && document.activeElement === input) {
    // fallthrough: keep default caret behaviour
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && state.ui.page === 'list'
    && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    openSearch(); input.value = ''; // type-to-search: the character lands in the field once focused
    setTimeout(() => { input.value = e.key; state.ui.search = e.key; touchUi(); }, 130);
  }
});

// ── lifecycle ──────────────────────────────────────────
listen('prompt:used', (e) => recordUse(e.payload));
listen('window:shown', (e) => {
  // Payload = the app that was in the foreground when the shortcut fired: { title, process } (Windows only).
  state.ui.foreground = e.payload || null; state.ui.platformShowAll = false;
  closeTopLayer(); while (hasLayers() && closeTopLayer());
  if (state.ui.page === 'settings') closeSettings();
  if (state.ui.search || bar.classList.contains('open')) closeSearch();
  touchUi();
  $('#body').scrollTop = 0;
  (document.activeElement)?.blur?.();
});

async function init() {
  await load();
  document.documentElement.dataset.os = state.device.os || 'windows';
  if (!window.__TAURI__) document.documentElement.dataset.env = 'browser';
  $('#hint-keys').replaceChildren(...(state.device.shortcut || 'Alt+W').split('+').flatMap((k, i) => [i ? ' + ' : '', h('kbd', {}, k)]));
  applyTheme(state.prefs);
  api.setBehavior(state.prefs.hideOnBlur);
  if (state.device.shortcutError) toast(state.device.shortcutError, 'error');
  render();
  if (state.ui.page === 'settings') renderSettings();
}
init();
export { icon };
