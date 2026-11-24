// Platform matching ("which AI/app is the user typing in?"). Pure module – covered by tests/platform.test.js.

/** A prompt's Platform field may hold several keywords separated by "," or ";" (e.g. "ChatGPT, Claude"). */
export const platformTokens = (platform) => String(platform || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);

/** First keyword of `platform` found (case-insensitive) in the foreground window's title or process name, else null. */
export function matchingToken(platform, fg) {
  if (!fg) return null;
  const hay = `${fg.title || ''}\n${fg.process || ''}`.toLowerCase();
  return platformTokens(platform).find((t) => hay.includes(t.toLowerCase())) ?? null;
}
export const platformMatches = (platform, fg) => matchingToken(platform, fg) !== null;

/** Name of the platform detected from the foreground app (taken from the first matching prompt), or null.
 *  Needs the "filter by active app" preference on; ignores the temporary "show all" override. */
export function detectPlatform(state) {
  if (!state.prefs?.platformFilter) return null;
  const fg = state.ui?.foreground;
  if (!fg) return null;
  for (const p of state.prompts) {
    const t = matchingToken(p.platform, fg);
    if (t) return t;
  }
  return null;
}

/** True when the list should currently be restricted to the detected platform. */
export const platformFilterActive = (state) => !state.ui?.platformShowAll && detectPlatform(state) !== null;

/** Does prompt `p` survive the platform filter? (Call only while the filter is active.) */
export function passesPlatform(p, state) {
  if (platformMatches(p.platform, state.ui.foreground)) return true;
  return platformTokens(p.platform).length === 0 && !!state.prefs.platformKeepGeneric;
}
