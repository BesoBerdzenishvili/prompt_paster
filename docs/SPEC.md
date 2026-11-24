# Product spec

## Original brief (condensed, nothing dropped)
**Concept.** Tauri desktop app for pasting prompts into input fields. Runs in the background (on startup). With the cursor in an input field, **Alt+W** opens the window. Clicking a prompt pastes it into the field and closes the window automatically.

**Header buttons**
1. **Add prompt** (prompt-style icon, else plus). Modal: title, textarea (body to paste), optional category and platform. Curly braces define variables: `tell me about {random topic}`. When such a prompt is chosen, before pasting a small box appears at the input field listing all variable names with input fields next to them; first field focused; **Tab** moves to the next; **Enter** pastes. Empty variables stay in original `{name}` form.
2. **Folder** button adds a folder; name editable at any time. Folders may be nested arbitrarily deep, or not used at all.
3. **Sort** button → popup:
   - order by name, creation date, modify date, size, or other useful field;
   - **Category mode**: choose categories (check buttons) → only items in checked categories are visible; add / edit / remove categories here;
   - **Free mode**: drag & drop folders/prompts in any order; the order is remembered for the next visit to that mode.
4. **Search** button → animated search field; filters items by title; with "advanced" also by body.
5. **Import / Export** `.json` with all app data. Export the first time asks where to save; afterwards it silently rewrites that file. Pressing the button ≥ 400 ms asks for a new location — **triggered at the 400 ms mark, not on mouse release**.
6. **Settings** (gear): change the global shortcut; toggle "expand all prompts" (show body, max 3 lines); anything else important.

**Below the header:** tabs **Main** (standard list), **Favs** (most used), **Recent** (recently used) — they filter the items list.

**Body.** Item list. Click an item = paste. On hover: edit (opens the same modal) and delete buttons. **Everything destructive asks for confirmation.**

**Design.** Resizable window, default 9:16. Take inspiration (typography, palette, component styling, mood) from `docs/design-reference.jpg` — don't copy that app.
Follow-up: the **window header** (not only the app header) must also be styled in that spirit; glassmorphism with the **blurred desktop visible behind**, but with enough contrast that text, buttons and items stay easy to read and separate from their backgrounds.

**Agent files.** Architecture, guide, changelog etc. After each task the agent must bump `version` in `src-tauri/tauri.conf.json`.

## Decisions & interpretations
| Topic | Decision |
|---|---|
| Window size | 360×640 (9:16), resizable, min 300×480. Opens centred on the monitor under the mouse. |
| Variable syntax | `{name}`; inner text 1–60 chars, no braces/newlines. `\{x}` is an escape and pastes as `{x}`. |
| Variables box position | Separate small always-on-top window just below the mouse position captured when the hotkey fired (≈ where the user clicked into the field). Flips above / clamps to the screen. |
| Favs | Prompts with `useCount > 0` by use count (top 50). Recent: by `lastUsedAt` (top 30). |
| Category | One category per prompt; categories are managed centrally. Filter: none checked = show all. "Uncategorised" is offered as a filter when relevant. |
| Sort & folders | In Sort/Category modes folders come first, both sorted by the chosen field (folders use aggregates of their contents). Free mode mixes folders and prompts by manual order. |
| Folder delete | Confirmation offers: Cancel / Keep contents (moved up one level) / Delete all. |
| Search | Space-separated terms, all must match (title; + body when "Body" is on). Folders without matches are hidden. |
| Export content | data.json contents (+ `app`, `exportedAt`, `appVersion`). Does **not** include device-specific data (shortcut, export path). |
| Import | Asks Merge (adds with fresh ids, reuses same-named categories) or Replace everything. |
| Extras beyond brief | Tray icon, single instance, launch at login, hide on blur (+ pin), keyboard navigation (↑/↓/Enter/Esc), type-to-search, duplicate prompt, clipboard restore, auto-export on change, glass strength slider, clear usage history. |
