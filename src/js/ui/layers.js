// Escape-key stack: modals, popovers, search and settings register a closer here.
const stack = [];
export function pushLayer(close) {
  const layer = { close };
  stack.push(layer);
  return () => { const i = stack.indexOf(layer); if (i !== -1) stack.splice(i, 1); };
}
/** Closes the top layer. Returns false when there is nothing to close. */
export function closeTopLayer() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
export const hasLayers = () => stack.length > 0;
