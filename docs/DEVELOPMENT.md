# Development guide

## Setup
- Node 20+, Rust stable, Tauri 2 prerequisites for your OS: https://v2.tauri.app/start/prerequisites/
- `npm install` (only installs `@tauri-apps/cli`).

## Commands
| Command | What |
|---|---|
| `npm run dev` | Desktop app. Starts `scripts/dev-server.mjs` (port 1420) as devUrl. Reload the webview (Ctrl+R) after editing `src/`. |
| `npm run build` | Release bundles → `src-tauri/target/release/bundle/`. |
| `npm test` | Pure-logic tests (`tests/*.test.js`). |
| `npm run serve` | Frontend only in a normal browser. `api.js` swaps in a localStorage mock (`html[data-env=browser]` shows a fake wallpaper so glass can be judged). Handy for screenshots/Playwright: seed `localStorage['pp-mock-data']`; `window.__lastPaste`, `window.__lastVars`, `window.__mockEmit(event,payload)` help assert flows. |
| `cd src-tauri && cargo check` | Type-check Rust. |
Regenerate icons from a 1024px PNG: `npx tauri icon path/to/icon.png`.

## Platform notes / troubleshooting
- **Paste is simulated keystrokes** (enigo). macOS: grant *Accessibility* permission to the app (System Settings → Privacy & Security) or nothing is pasted. Linux: works on X11; Wayland generally blocks synthetic input and global shortcuts. Terminals that paste with Ctrl+Shift+V won't accept plain Ctrl+V.
- **Windows blur lag:** Acrylic/Blur make window dragging/resizing laggy on some Windows 10/11 builds. Settings → turn off *Desktop blur* (the window becomes nearly opaque).
- **Shortcut already used:** a toast explains; pick another in Settings. Changing it temporarily pauses the global shortcut while recording.
- **Launch at login** is registered on first run of *release* builds only; toggle in Settings.
- **Hide on blur** is suppressed while native file dialogs are open. Pin the window (header) to keep it open.
- Data lives in the OS app-data dir (path shown in Settings → Data). Delete `data.json` to reset.
- Transparent windows need `macOSPrivateApi` (already set) and a compositor on Linux.

## Adding things
- New setting: add default in `DEFAULT_PREFS` (lib/data.js) → control in `ui/settings.js` → use `state.prefs.x`. Old data files get the default automatically.
- New backend command: add fn in lib.rs, register in `generate_handler!`, wrap in `api.js` **and add a mock** if the UI needs it in browser mode.
- New sort field: `SORT_FIELDS` + `promptMetric`/`folderMetric` in lib/sort.js + a test.
