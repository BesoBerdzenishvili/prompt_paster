import { api } from '../api.js';
/** Applies tint strength. Without desktop blur the window is made (almost) opaque for readability. */
export function applyTint(prefs) {
  const a = prefs.glassBlur ? prefs.glassOpacity : Math.max(0.94, prefs.glassOpacity);
  document.documentElement.style.setProperty('--tint-a', String(a));
}
export function applyTheme(prefs) { applyTint(prefs); api.applyGlass(prefs.glassBlur); }
