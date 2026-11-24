# Changelog

Format: newest first. Every task bumps `version` in `src-tauri/tauri.conf.json` and adds an entry here.

## 0.1.2 — 2026-11-24
- Folder rename: the title input now starts at the title's width, animates (stretches) to the end of the folder item and animates back when editing ends.
- Folder item: the title spans the whole row with the item-count pill at the far end; hover actions are an overlay that covers part of the title instead of squeezing it.
- Pin: with the window pinned, pasting keeps the list open and gives focus back to the app/field you were typing in (Windows: tracked + restored via `SetForegroundWindow`; other OSes keep the list open but don't restore focus yet).
- Variables box: height now fits all fields (it was measuring its own fixed window, so it never grew); capped at the screen height, after which the fields scroll.

## 0.1.1 — 2026-11-24
- Fix: dev server returned "not found" on Windows (path handling), leaving the window empty in `tauri dev`.
- Remove unused `EffectState` import warning on non-macOS targets.

## 0.1.0 — 2026-11-24
Initial release (scaffold + full feature set from the brief).
- Tauri 2 background app with global shortcut (default Alt+W), tray icon, single instance, autostart (release builds).
- Paste flow: clipboard + simulated Ctrl/Cmd+V into the previously focused field, optional clipboard restore.
- `{variables}`: small input box (Tab to move, Enter to paste, empty vars stay as `{name}`), `\{escape}` support.
- Glassmorphism UI (custom window header, pill toolbar, sliding tabs, frosted cards), desktop blur via window effects, adjustable glass strength for readability.
- Prompt create/edit modal (title, body, category, platform, folder), duplicate, delete with confirmation.
- Nested folders (rename any time, delete asks whether to keep contents), expand/collapse remembered.
- Sort popup: sort by name/created/modified/size/last used/most used + direction; Category mode (check-button filter, add/rename/delete categories); Free mode (drag & drop, order persisted).
- Animated search (title; "Body" toggle for advanced), Main / Favs / Recent tabs.
- Import (merge or replace) and export (first click asks for a place, later clicks rewrite the file, hold 400 ms to pick a new place).
- Settings: change shortcut, expand-all, hide on blur, launch at login, desktop blur, glass strength, restore clipboard, auto-update export file, clear usage history.
- Agent docs: AGENTS.md, CLAUDE.md, docs/*.
