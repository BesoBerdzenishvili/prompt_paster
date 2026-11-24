# Design system

**Reference:** `docs/design-reference.jpg` — frosted dark-glass panels over a blurred scene, thin light borders with inner top highlights, big soft pill/circle buttons, white active pill, light-weight clean grotesque type, calm monochrome with a soft accent. Mood: quiet, premium, tactile. We borrow the *language*, not the smart-home UI.

## Tokens (css/theme.css)
| Token | Value | Use |
|---|---|---|
| `--text` / `--text-2` / `--text-3` | #f6f7f9 / 76% / 56% | primary / secondary / hints (all ≥ 4.5:1 on the tint) |
| `--stroke` / `--stroke-2` | white 16% / 30% | borders |
| `--surface` / `--surface-2` | white 9% / 15% | resting / hover surfaces |
| `--accent` | #b9a9ff | focus, folders, variables, selected states (cool violet, echoing the reference's purple slider) |
| `--danger` | #ff8a8a | destructive |
| `--tint-a` | 0.35–0.95 (default .62) | window tint strength – user-adjustable |
Font stack: Inter → SF Pro Display → Segoe UI Variable → system-ui (no network fonts; app works offline). Headings 600 with −0.02em tracking; body 400/500.

## Glass rules
1. **Window**: transparent OS window + native blur; `.app` paints ambient radial colour glows + a dark gradient tint (`--tint-a`). Blur off ⇒ tint forced ≥ 0.94.
2. **Cards/items/toolbar** (`.glass`, `.item`): 6–13% white gradient, 1px light border, inset top highlight, soft drop shadow, backdrop blur. Hover lifts 1px and brightens border.
3. **Overlays** (modals, popovers: `.glass-strong`): ~94% opaque dark – readability over looks, since they sit on top of already busy glass.
4. **Active state** = solid white pill with near-black text (tabs, segmented control, primary buttons). Toggles: dark track + white knob; on = violet track.
5. **Contrast checklist** for any new UI: text on its surface ≥ 4.5:1; every interactive element has a visible border or fill that differs ≥ 10% from its parent; test at glass strength 35% over a bright wallpaper.

## Window header
Custom (frameless): round glossy logo, 22px/600 title "Prompts" with a "Press [Alt] + [W] anywhere" hint (mirrors the reference's "Hi Robbie / Welcome Home" block), right-aligned round glass buttons for pin and close. The whole row is a drag region (`data-tauri-drag-region`, child text nodes too).

## Motion
Easing `cubic-bezier(.2,.8,.2,1)`. Search reveals with an expanding `clip-path` circle from the search button (500 ms) while the toolbar fades; tabs have a sliding white indicator; modals rise + fade; hover actions slide in. `prefers-reduced-motion` disables all.

## Icons
Inline stroke SVGs (`src/js/icons.js`, 1.8px, round caps). Add prompt = speech bubble with plus.
