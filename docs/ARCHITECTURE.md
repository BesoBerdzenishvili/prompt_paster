# Architecture

```
prompt-paster/
├─ src/                      Frontend – plain ES modules, no build step
│  ├─ index.html, vars.html  Two windows: main list, and the small variables box
│  ├─ css/                   theme.css (tokens + primitives) · main.css · vars.css
│  └─ js/
│     ├─ api.js              ONLY place that talks to Tauri (+ localStorage mock for browsers)
│     ├─ store.js            State, mutations, debounced persistence
│     ├─ main.js             Main window wiring: toolbar, tabs, search, export/import, paste flow, keyboard
│     ├─ vars.js             Variables-window entry
│     ├─ icons.js
│     ├─ lib/                PURE logic (tested): vars.js, sort.js, data.js
│     └─ ui/                 dom.js, layers.js (Esc stack), modal.js (+confirmDialog), toast.js, theme.js,
│                            list.js (tree, hover actions, drag & drop), promptModal.js, sortPopup.js, settings.js
├─ src-tauri/
│  ├─ tauri.conf.json        ← "version" is THE version (bump per task). Windows: `main`, `vars` (both transparent, frameless)
│  ├─ capabilities/default.json
│  └─ src/lib.rs             Shortcut, tray, window placement, blur effects, clipboard+paste, file I/O, commands
├─ tests/                    node --test (vars, sort, data)
└─ scripts/dev-server.mjs    static server for `tauri dev` and browser previews
```

## Data model (`data.json`, schema 1)
```
{ schema, folders:[{id,name,parentId,createdAt,modifiedAt,order}],
  prompts:[{id,title,body,category,platform,folderId,createdAt,modifiedAt,order,useCount,lastUsedAt}],
  categories:[{id,name,color}],
  prefs:{expandAll,hideOnBlur,glassBlur,glassOpacity,restoreClipboard,autoExport},
  view:{tab,mode,sortField,sortDir,categoryFilter,expanded,advanced} }
```
- `order` is per-parent position among mixed folders+prompts (used by Free mode; new items get max+1).
- Stored in the OS app-data dir (`data.json`, atomic write). Device-only settings (`shortcut`, `exportPath`) are in `device.json` and are never exported/imported.
- Loading always goes through `normalizeData()` which repairs dangling ids and cycles.

## Backend commands (src-tauri/src/lib.rs)
`get_device`, `load_data`, `save_data(json, autoExport)`, `export_data(json, choose)`, `import_data`, `set_shortcut`, `pause_shortcut`/`resume_shortcut` (while recording a new shortcut), `paste_text(text, restore, promptId)`, `show_vars(payload)`, `present_vars(height)`, `hide_windows`, `hide_vars`, `set_behavior(hideOnBlur)`, `set_pinned`, `set_autostart`, `apply_glass(enabled)`, `quit_app`.
Events: backend→main `window:shown`, `prompt:used`; backend→vars `vars:open`.

## Flows
**Open:** global shortcut → `toggle_main` → remember mouse position (anchor) → centre window on that monitor → show + focus → `window:shown` (UI resets search/settings).
**Paste (no variables):** click → `recordUse` → `flush` → `paste_text`: hide windows → save clipboard text → set clipboard → wait 160 ms (OS returns focus) → simulate Ctrl/Cmd+V on the main thread (enigo) → wait 400 ms → restore clipboard.
**Paste (variables):** click → `show_vars` (hides main, emits `vars:open`) → vars window renders, measures itself, calls `present_vars(height)` → Rust sizes + places it under the anchor → user fills → Enter → `paste_text(filled, restore, promptId)` → backend emits `prompt:used` to main (usage is recorded there).
**Pinned paste:** with the pin on, `paste_text` hides only the variables box, then (Windows) calls `SetForegroundWindow` on the last foreign window (`prev_focus`, recorded on show and whenever our windows lose focus) before sending Ctrl+V. Other platforms keep the list open without refocusing.
**Variables box size:** `vars.js` measures header + all rows (`scrollHeight`) + footer and calls `present_vars(height)`; Rust clamps to the monitor height − 48 px, rows scroll beyond that. The box is resizable/draggable by the user afterwards (header = drag region, corner grip uses `startResizeDragging`; capability `allow-start-resize-dragging`); its size/position are reset on every open.
**Close:** Esc closes the top layer (modal → popover → search → settings → window). Blur hides the window unless pinned, or a native dialog is open (`suppress_blur`).
**Export:** click → `export_data(json,false)` rewrites remembered path (or asks the first time). Pointer held 400 ms → timer fires `export_data(json,true)` immediately (not on release). Auto-export setting additionally rewrites on every `save_data`.

## Design decisions worth knowing
- Frameless + transparent windows; native blur via `set_effects` (Windows Acrylic, macOS HudWindow vibrancy; Linux has none → tint becomes near-opaque automatically when blur is off). `dragDropEnabled:false` is required or HTML5 drag & drop breaks on Windows.
- `--tint-a` (glass strength) is the single knob that trades see-through vs. readability.
- Window corners: Windows uses DWM rounding (CSS radius 0, otherwise the blur rectangle shows past rounded CSS corners); macOS/Linux use a CSS radius.
- Render strategy: full re-render of the list on every store change (hundreds of items are fine). Focus-sensitive inputs (folder rename, category edit) are re-focused after render.
