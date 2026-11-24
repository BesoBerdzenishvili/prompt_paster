# AGENTS.md — read this first

Instructions for any AI agent (Claude Code, Codex, Cursor, …) working on **Prompt Paster**.
`CLAUDE.md` points here; this file is the single source of truth for process.

## ⚠️ Mandatory rule: bump the version after EVERY task

After finishing **each task** (feature, fix, refactor, docs-only change — anything you hand back),
you **must** increase the `version` property in **`src-tauri/tauri.conf.json`**.

- Semver: `MAJOR.MINOR.PATCH`. Bug fix / small tweak / docs → PATCH. New feature → MINOR. Breaking data-format change → MAJOR.
- `src-tauri/tauri.conf.json` → `"version"` is the **only** place the version is edited by hand
  (it overrides `Cargo.toml`, which intentionally stays `0.0.0`; `package.json` has no version).
- Add a matching entry at the top of `CHANGELOG.md` (same version number, today's date, what changed).
- Never reuse or lower a version. Two tasks = two bumps.

Task checklist before you say "done":
1. `npm test` passes (pure-logic tests, no Rust needed).
2. UI change? Preview it: `npm run serve` → http://localhost:1420 (browser mock mode, see docs/DEVELOPMENT.md) and look at it.
3. Rust change? `cargo check` in `src-tauri/` (and ideally `npm run dev` on a real desktop).
4. Updated the docs that your change affects (see "Docs map").
5. **Bumped `version` in `src-tauri/tauri.conf.json` + added a `CHANGELOG.md` entry.**

## What this app is (one paragraph)
A Tauri 2 desktop app that lives in the tray/background. A global shortcut (default **Alt+W**) opens a
glassmorphism window with the user's saved prompts. Clicking a prompt hides the window and pastes the text
into whatever input field had the cursor. Prompts may contain `{variables}`; a small box asks for values first.
Full requirements: `docs/SPEC.md`.

## Docs map
| File | Read it when… |
|---|---|
| `docs/SPEC.md` | You need the product requirements (original brief + decisions). |
| `docs/ARCHITECTURE.md` | You touch code structure, data model, IPC commands or the paste flow. |
| `docs/DESIGN.md` | You touch any visual styling (tokens, glass rules, contrast rules). |
| `docs/DEVELOPMENT.md` | You set up, run, test, build, or debug platform quirks. |
| `docs/ROADMAP.md` | You look for what is unverified, known issues and ideas. |
| `CHANGELOG.md` | Always — add an entry per task. |

## Ground rules
- **No frontend build step / no framework.** `src/` is plain ES modules served as-is (`withGlobalTauri: true`). Don't add bundlers or npm runtime deps without a strong reason and a note in ARCHITECTURE.md.
- **Pure logic lives in `src/js/lib/`** (no DOM, no Tauri). Anything there needs tests in `tests/`.
- **All Tauri calls go through `src/js/api.js`** (it has a browser mock). Don't call `window.__TAURI__` elsewhere.
- **Every destructive action must ask for confirmation** via `confirmDialog` (`src/js/ui/modal.js`). Requirement from the brief.
- **Contrast is a requirement, not polish.** Text and controls must stay readable and clearly separated from the (blurred) desktop behind the window. See docs/DESIGN.md.
- Keep the data format backwards compatible; `normalizeData()` (src/js/lib/data.js) must accept older files. Bump `schema` only with a migration.
- Rust: keep commands small; return `Result<_, String>`. Test-compile with `cargo check` — the initial version was written without being able to compile (see ROADMAP).
- Don't commit `node_modules/`, `src-tauri/target/`.
