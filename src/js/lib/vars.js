// Variable syntax: {name}. Escape with a backslash: \{not a var}.
// Pure module (no DOM) – covered by tests/vars.test.js.
const RE = /(\\)?\{([^{}\n]{1,60})\}/g;

/** Unique variable names in order of first appearance. */
export function extractVars(body) {
  const seen = new Set();
  const out = [];
  for (const m of String(body).matchAll(RE)) {
    if (m[1]) continue; // escaped
    const name = m[2].trim();
    if (name && !seen.has(name)) { seen.add(name); out.push(name); }
  }
  return out;
}

/**
 * Replaces variables with values. Empty/missing values keep their original
 * `{name}` form. Escaped braces are unescaped. Always run before pasting.
 */
export function fillVars(body, values = {}) {
  return String(body).replace(RE, (full, esc, inner) => {
    if (esc) return `{${inner}}`;
    const v = values[inner.trim()];
    return v !== undefined && v !== '' ? v : full;
  });
}
