import { h, $ } from './dom.js';
import { icon } from '../icons.js';
import { state, setPref, clearUsage, touchUi } from '../store.js';
import { api } from '../api.js';
import { applyTheme, applyTint } from './theme.js';
import { confirmDialog } from './modal.js';
import { toast } from './toast.js';

const keycaps = (s) => h('span', { class: 'keycaps' }, s.split('+').map((k) => h('kbd', {}, k)));

/** Converts a keydown event to a global-shortcut string like "Alt+W", or null if incomplete. */
export function shortcutFromEvent(e) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  if (!mods.length) return null;
  let key = e.code;
  if (/^Key[A-Z]$/.test(key)) key = key.slice(3);
  else if (/^Digit\d$/.test(key)) key = key.slice(5);
  else if (/^Numpad\d$/.test(key)) key = key.replace('Numpad', 'Num');
  else if (/^(F\d{1,2}|Space|Enter|Tab|Backspace|Insert|Delete|Home|End|PageUp|PageDown)$/.test(key)) { /* as is */ }
  else if (/^Arrow/.test(key)) key = key.slice(5);
  else if (key === 'Minus' || key === 'Equal' || key === 'Comma' || key === 'Period' || key === 'Slash' || key === 'Backslash' || key === 'Semicolon' || key === 'Quote' || key === 'Backquote' || key === 'BracketLeft' || key === 'BracketRight') { /* as is */ }
  else return null;
  return [...mods, key].join('+');
}

function switchEl(checked, onchange) {
  return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked, onchange }), h('span', { class: 'track' }, h('span', { class: 'knob' })));
}
const toggle = (key, onChange) => switchEl(!!state.prefs[key], (e) => { setPref(key, e.target.checked, { quiet: true }); onChange?.(e.target.checked); });
const autostartToggle = (d) => switchEl(!!d.autostart, async (e) => {
  try { await api.setAutostart(e.target.checked); d.autostart = e.target.checked; }
  catch (err) { e.target.checked = !e.target.checked; toast(String(err), 'error'); }
});

const row = (title, desc, control) => h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('strong', {}, title), desc && h('span', {}, desc)), control);

export function renderSettings() {
  const root = $('#settings');
  const d = state.device;
  let recording = false;

  const scBtn = h('button', { class: 'btn small', type: 'button' }, 'Change');
  const scShow = h('div', { class: 'sc-show' }, keycaps(d.shortcut || 'Alt+W'));
  const stopRec = (resume = true) => { recording = false; scBtn.textContent = 'Change'; scBtn.classList.remove('on'); document.removeEventListener('keydown', onKey, true); if (resume) api.resumeShortcut(); };
  async function onKey(e) {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { stopRec(); return; }
    const sc = shortcutFromEvent(e);
    if (!sc) return;
    stopRec(false);
    try { d.shortcut = await api.setShortcut(sc); toast(`Shortcut set to ${sc.replaceAll('+', ' + ')}`); }
    catch (err) { await api.resumeShortcut(); toast(String(err), 'error'); }
    scShow.replaceChildren(keycaps(d.shortcut));
  }
  scBtn.onclick = async () => {
    if (recording) { stopRec(); return; }
    recording = true; scBtn.textContent = 'Press keys…  (Esc)'; scBtn.classList.add('on');
    await api.pauseShortcut();
    document.addEventListener('keydown', onKey, true);
  };
  const resetBtn = h('button', { class: 'link', type: 'button', onclick: async () => {
    try { d.shortcut = await api.setShortcut('Alt+W'); scShow.replaceChildren(keycaps(d.shortcut)); toast('Shortcut reset to Alt + W'); } catch (e) { toast(String(e), 'error'); } } }, 'Reset');

  const slider = h('input', { type: 'range', min: 35, max: 95, step: 1, value: Math.round(state.prefs.glassOpacity * 100), class: 'range',
    oninput: (e) => { setPref('glassOpacity', e.target.value / 100, { quiet: true }); applyTint(state.prefs); valueEl.textContent = `${e.target.value}%`; } });
  const valueEl = h('span', { class: 'val' }, `${Math.round(state.prefs.glassOpacity * 100)}%`);

  const keepGeneric = row('Also show prompts without a platform', 'Off = only prompts whose platform matches the app.', toggle('platformKeepGeneric', () => touchUi()));
  const syncKeepGeneric = (on) => { keepGeneric.classList.toggle('disabled', !on); keepGeneric.querySelector('input').disabled = !on; };
  const platformRow = row('Filter by the app you’re in',
    `When you open the list over an app whose window title or name contains a prompt’s Platform (e.g. “Claude”), show only those prompts.${d.os === 'windows' ? '' : ' Currently works on Windows only.'}`,
    toggle('platformFilter', (on) => { syncKeepGeneric(on); touchUi(); }));
  syncKeepGeneric(!!state.prefs.platformFilter);

  root.replaceChildren(
    h('div', { class: 'page-head' },
      h('button', { class: 'icon-btn', type: 'button', title: 'Back', html: icon('back', 18), onclick: closeSettings }),
      h('h2', {}, 'Settings')),
    h('div', { class: 'page-scroll' },
      h('section', { class: 'card glass' },
        h('div', { class: 'card-title' }, 'Shortcut'),
        h('div', { class: 'set-row' }, h('div', { class: 'set-text' }, h('strong', {}, 'Open window'), h('span', {}, 'Works anywhere, even when this app is in the background.')), scShow),
        h('div', { class: 'set-actions' }, scBtn, resetBtn),
        d.shortcutError && h('p', { class: 'warn' }, d.shortcutError)),
      h('section', { class: 'card glass' },
        h('div', { class: 'card-title' }, 'List'),
        row('Expand all prompts', 'Show up to 3 lines of each prompt’s text.', toggle('expandAll', () => touchUi())),
        platformRow, keepGeneric),
      h('section', { class: 'card glass' },
        h('div', { class: 'card-title' }, 'Appearance'),
        row('Desktop blur', 'See your blurred desktop through the window. Turn off if dragging feels laggy.', toggle('glassBlur', () => applyTheme(state.prefs))),
        h('div', { class: 'set-row col' }, h('div', { class: 'set-text' }, h('strong', {}, 'Glass strength'), h('span', {}, 'Higher = darker background and easier reading.')), h('div', { class: 'slider-line' }, slider, valueEl))),
      h('section', { class: 'card glass' },
        h('div', { class: 'card-title' }, 'Behaviour'),
        row('Close when focus is lost', 'Hide the window when you click elsewhere.', toggle('hideOnBlur', (v) => api.setBehavior(v))),
        row('Launch at login', 'Runs quietly in the background and waits for the shortcut.', autostartToggle(d)),
        row('Restore clipboard after paste', 'Puts back whatever text you had copied before.', toggle('restoreClipboard')),
        row('Auto-update export file', 'Rewrite the exported .json after every change.', toggle('autoExport'))),
      h('section', { class: 'card glass' },
        h('div', { class: 'card-title' }, 'Data'),
        h('div', { class: 'kv' }, h('span', {}, 'Export file'), h('code', {}, d.exportPath || 'not set – click Export once')),
        h('div', { class: 'kv' }, h('span', {}, 'Stored in'), h('code', {}, d.dataDir || '—')),
        h('div', { class: 'set-actions' }, h('button', { class: 'btn small danger-ghost', type: 'button', onclick: async () => {
          if (await confirmDialog({ title: 'Clear usage history?', message: 'Favourites and Recent lists will be emptied. Your prompts are kept.', confirmLabel: 'Clear' })) { clearUsage(); toast('Usage history cleared'); } } }, 'Clear usage history'))),
      h('p', { class: 'about' }, `Prompt Paster v${d.version || '0.1.0'} · Esc closes the window`)));
}

export function openSettings() { state.ui.page = 'settings'; renderSettings(); touchUi(); }
export function closeSettings() { state.ui.page = 'list'; touchUi(); }
