# Prompt Paster

Press **Alt + W** in any app → pick a saved prompt → it is pasted into the field you were typing in.
Glassmorphism UI, nested folders, categories, `{variables}`, favourites/recent, JSON import/export.

```bash
npm install
npm run dev      # run the desktop app (needs Rust + Tauri prerequisites)
npm run build    # installers in src-tauri/target/release/bundle
npm test         # pure-logic tests (no Rust needed)
npm run serve    # UI only, in a browser with a mock backend → http://localhost:1420
```

Prerequisites: Node 20+, Rust (stable), and the [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/).
Details: `docs/DEVELOPMENT.md`. Working on this with an AI agent? Start with `AGENTS.md`.

**Variables:** write `tell me about {random topic}`; you'll get a small box to fill it in (Tab → next, Enter → paste). Empty ones stay as `{random topic}`. Escape braces with `\{`.
