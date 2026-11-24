// Thin wrapper around the Tauri backend. Falls back to a localStorage mock when
// opened in a normal browser (`npm run serve`) so the UI can be developed and tested without Rust.
const T = window.__TAURI__;
export const isTauri = !!T?.core;

const mockHandlers = {};
const LS = 'pp-mock-data';
const mock = {
  device: { shortcut: 'Alt+W', exportPath: null, shortcutError: null, os: 'windows', version: 'dev', dataDir: '(browser preview)', autostart: false },
  async get_device() { return { ...this.device }; },
  async load_data() { return localStorage.getItem(LS); },
  async save_data({ json }) { localStorage.setItem(LS, json); },
  async export_data({ json, choose }) { if (choose || !this.device.exportPath) this.device.exportPath = '/mock/prompt-paster-data.json'; console.log('[mock] export', json.length); return this.device.exportPath; },
  async import_data() { return window.__mockImport ?? null; },
  async set_shortcut({ shortcut }) { this.device.shortcut = shortcut; return shortcut; },
  async paste_text(a) { console.log('[mock] paste', a); window.__lastPaste = a; if (a.promptId) (mockHandlers['prompt:used'] || []).forEach((f) => f({ payload: a.promptId })); },
  async present_vars(a) { window.__lastPresent = a.height; },
  async show_vars(a) { console.log('[mock] vars', a); window.__lastVars = a.payload; },
};

export async function call(cmd, args = {}) {
  if (isTauri) return T.core.invoke(cmd, args);
  const fn = mock[cmd];
  return fn ? fn.call(mock, args) : undefined;
}

export async function listen(event, cb) {
  if (isTauri) return T.event.listen(event, cb);
  (mockHandlers[event] ||= []).push(cb);
  window.__mockEmit = (e, payload) => (mockHandlers[e] || []).forEach((f) => f({ payload }));
  return () => {};
}

export const api = {
  device: () => call('get_device'),
  loadData: () => call('load_data'),
  saveData: (json, autoExport) => call('save_data', { json, autoExport: !!autoExport }),
  exportData: (json, choose) => call('export_data', { json, choose }),
  importData: () => call('import_data'),
  setShortcut: (shortcut) => call('set_shortcut', { shortcut }),
  pauseShortcut: () => call('pause_shortcut'),
  resumeShortcut: () => call('resume_shortcut'),
  pasteText: (text, restore, promptId = null) => call('paste_text', { text, restore, promptId }),
  showVars: (payload) => call('show_vars', { payload }),
  presentVars: (height) => call('present_vars', { height }),
  hideWindows: () => call('hide_windows'),
  hideVars: () => call('hide_vars'),
  startResize: (dir) => (isTauri ? T.window.getCurrentWindow().startResizeDragging(dir) : undefined),
  setBehavior: (hideOnBlur) => call('set_behavior', { hideOnBlur }),
  setPinned: (pinned) => call('set_pinned', { pinned }),
  setAutostart: (enabled) => call('set_autostart', { enabled }),
  applyGlass: (enabled) => call('apply_glass', { enabled }),
  emit: (event, payload) => (isTauri ? T.event.emit(event, payload) : undefined),
};
