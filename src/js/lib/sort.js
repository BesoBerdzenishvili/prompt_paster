// Filtering, sorting and tree building. Pure module – covered by tests/sort.test.js.
export const SORT_FIELDS = [
  { id: 'name', label: 'Name' },
  { id: 'created', label: 'Created' },
  { id: 'modified', label: 'Modified' },
  { id: 'size', label: 'Size' },
  { id: 'lastUsed', label: 'Last used' },
  { id: 'useCount', label: 'Most used' },
];
export const NO_CATEGORY = '__none';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function promptMetric(p, field) {
  switch (field) {
    case 'created': return p.createdAt;
    case 'modified': return p.modifiedAt;
    case 'size': return p.body.length;
    case 'lastUsed': return p.lastUsedAt || 0;
    case 'useCount': return p.useCount || 0;
    default: return p.title;
  }
}

/** Metric of a folder aggregated over everything inside it. */
function folderMetric(node, field) {
  const f = node.folder;
  const kids = node.children;
  const agg = (fn, init, pick) => kids.reduce((acc, k) => fn(acc, k.type === 'folder' ? folderMetric(k, field) : promptMetric(k.prompt, field)), init);
  switch (field) {
    case 'created': return f.createdAt;
    case 'modified': return agg(Math.max, f.modifiedAt);
    case 'size': return agg((a, b) => a + b, 0);
    case 'lastUsed': return agg(Math.max, 0);
    case 'useCount': return agg((a, b) => a + b, 0);
    default: return f.name;
  }
}

function cmp(a, b, dir) {
  const r = typeof a === 'string' || typeof b === 'string' ? collator.compare(String(a), String(b)) : a - b;
  return r * (dir === 'desc' ? -1 : 1);
}

export function matchesSearch(p, query, advanced) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = (p.title + (advanced ? '\n' + p.body : '')).toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function isFiltering(state) {
  return !!state.ui.search.trim() || (state.view.mode === 'category' && state.view.categoryFilter.length > 0);
}

/** Set of prompt ids passing search + category filter. */
export function passingIds(state) {
  const { view, ui } = state;
  const cats = view.mode === 'category' ? view.categoryFilter : [];
  const ids = new Set();
  for (const p of state.prompts) {
    if (!matchesSearch(p, ui.search, view.advanced)) continue;
    if (cats.length && !(cats.includes(p.category) || (!p.category && cats.includes(NO_CATEGORY)))) continue;
    ids.add(p.id);
  }
  return ids;
}

/** Nested nodes for the Main tab: {type:'folder',folder,children,count} | {type:'prompt',prompt}. */
export function buildTree(state, pass = passingIds(state)) {
  const { view } = state;
  const filtering = isFiltering(state);
  const build = (parentId) => {
    const nodes = [];
    for (const f of state.folders) {
      if (f.parentId !== parentId) continue;
      const children = build(f.id);
      if (filtering && !children.length) continue;
      const count = children.reduce((n, c) => n + (c.type === 'folder' ? c.count : 1), 0);
      nodes.push({ type: 'folder', folder: f, children, count });
    }
    for (const p of state.prompts) if (p.folderId === parentId && pass.has(p.id)) nodes.push({ type: 'prompt', prompt: p });
    return sortNodes(nodes, view);
  };
  return build(null);
}

function sortNodes(nodes, view) {
  const order = (n) => (n.type === 'folder' ? n.folder.order : n.prompt.order);
  const created = (n) => (n.type === 'folder' ? n.folder.createdAt : n.prompt.createdAt);
  if (view.mode === 'free') return nodes.sort((a, b) => order(a) - order(b) || created(a) - created(b));
  const folders = nodes.filter((n) => n.type === 'folder').sort((a, b) =>
    cmp(folderMetric(a, view.sortField), folderMetric(b, view.sortField), view.sortDir) || collator.compare(a.folder.name, b.folder.name));
  const prompts = nodes.filter((n) => n.type === 'prompt').sort((a, b) =>
    cmp(promptMetric(a.prompt, view.sortField), promptMetric(b.prompt, view.sortField), view.sortDir) || collator.compare(a.prompt.title, b.prompt.title));
  return [...folders, ...prompts];
}

export function buildFavs(state, pass = passingIds(state), limit = 50) {
  return state.prompts.filter((p) => pass.has(p.id) && p.useCount > 0)
    .sort((a, b) => b.useCount - a.useCount || b.lastUsedAt - a.lastUsedAt).slice(0, limit);
}

export function buildRecent(state, pass = passingIds(state), limit = 30) {
  return state.prompts.filter((p) => pass.has(p.id) && p.lastUsedAt > 0)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, limit);
}

export function folderPath(state, folderId) {
  const names = [];
  const seen = new Set();
  let f = state.folders.find((x) => x.id === folderId);
  while (f && !seen.has(f.id)) { seen.add(f.id); names.unshift(f.name); f = state.folders.find((x) => x.id === f.parentId); }
  return names.join(' / ');
}

/** Folders flattened depth-first (alphabetical) for <select> pickers. */
export function flattenFolders(state) {
  const out = [];
  const walk = (parentId, depth) => {
    state.folders.filter((f) => f.parentId === parentId).sort((a, b) => collator.compare(a.name, b.name))
      .forEach((f) => { out.push({ id: f.id, name: f.name, depth }); walk(f.id, depth + 1); });
  };
  walk(null, 0);
  return out;
}

export function descendantFolderIds(state, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of state.folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; }
  }
  return out;
}
