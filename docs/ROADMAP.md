# Roadmap, risks & known gaps

## ⚠ Unverified in the initial delivery (0.1.0)
The first version was written in an environment **without network access**, so:
- **The Rust backend (`src-tauri/src/lib.rs`) has never been compiled.** Expect to fix small API mismatches on the first `cargo check` (most likely spots: `tauri::window::{Effect, EffectsBuilder, EffectState}`, `app.cursor_position()`, `FilePath::into_path()`, enigo 0.3 key API, `tauri_plugin_autostart::ManagerExt`).
- Native behaviours were not run on a real desktop: global shortcut, tray, blur effects, focus hand-back + simulated paste, autostart.
- The frontend **was** exercised in headless Chromium with the mock backend (list, folders, search, sort/category, modals, settings, variables flow) and the pure logic has unit tests.
First thing to do on a real machine: `npm install && npm run dev`, then walk through docs/SPEC.md.

## Known limitations
- Pinned-paste focus restore is implemented for Windows only (macOS/Linux: list stays open, focus not handed back).
- Variables box is placed at the mouse position from when the hotkey fired, not at the real text caret (no portable caret API).
- No Wayland support for global shortcut/paste; no blur on Linux.
- Free-mode drag & drop uses HTML5 DnD (mouse only, no touch/keyboard reordering).
- Favs = most used (automatic). No manual starring.

## Ideas
- Manual pin/star for favourites; per-prompt "paste as Ctrl+Shift+V" for terminals.
- Caret-aware placement on Windows (`GetGUIThreadInfo`) and macOS (Accessibility API).
- Light theme; auto-backup rotation; prompt usage stats view; multi-line variables.
- Playwright E2E over `npm run serve`; CI with `cargo check` + `npm test`.
