// Data model normalisation & merging. Pure module – covered by tests/data.test.js.
export const SCHEMA = 1;

export const DEFAULT_PREFS = {
  expandAll: false,
  hideOnBlur: true,
  glassBlur: true,
  glassOpacity: 0.62,
  restoreClipboard: true,
  autoExport: false,
};

export const DEFAULT_VIEW = {
  tab: 'main',            // main | favs | recent
  mode: 'sort',           // sort | category | free
  sortField: 'name',
  sortDir: 'asc',
  categoryFilter: [],     // category ids, or '__none'
  expanded: [],           // expanded folder ids
  advanced: false,        // search in body too
};

export const CATEGORY_COLORS = ['#b8a8ff', '#7cc4ff', '#7ce0c3', '#ffd37c', '#ff9eb5', '#ffa87c', '#c3e07c', '#d49cff'];

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const str = (v, d = '') => (typeof v === 'string' ? v : d);

/** Validates + cleans raw JSON. Throws on something that is clearly not our data. */
export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.prompts) && !Array.isArray(raw.folders))) {
    throw new Error('This file does not look like Prompt Paster data.');
  }
  const t = Date.now();
  const folders = (raw.folders || []).filter((f) => f && f.id).map((f, i) => ({
    id: String(f.id), name: str(f.name, 'Folder'), parentId: f.parentId ? String(f.parentId) : null,
    createdAt: num(f.createdAt, t), modifiedAt: num(f.modifiedAt, t), order: num(f.order, i),
  }));
  const folderIds = new Set(folders.map((f) => f.id));
  for (const f of folders) if (f.parentId && (!folderIds.has(f.parentId) || f.parentId === f.id)) f.parentId = null;
  breakCycles(folders);

  const categories = (raw.categories || []).filter((c) => c && c.id).map((c, i) => ({
    id: String(c.id), name: str(c.name, 'Category'), color: str(c.color, CATEGORY_COLORS[i % CATEGORY_COLORS.length]),
  }));
  const catIds = new Set(categories.map((c) => c.id));

  const prompts = (raw.prompts || []).filter((p) => p && p.id).map((p, i) => ({
    id: String(p.id), title: str(p.title, 'Untitled'), body: str(p.body),
    category: catIds.has(p.category) ? p.category : null,
    platform: str(p.platform),
    folderId: p.folderId && folderIds.has(p.folderId) ? String(p.folderId) : null,
    createdAt: num(p.createdAt, t), modifiedAt: num(p.modifiedAt, t), order: num(p.order, i),
    useCount: num(p.useCount), lastUsedAt: num(p.lastUsedAt),
  }));

  return {
    folders, categories, prompts,
    prefs: { ...DEFAULT_PREFS, ...(raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : {}) },
    view: { ...DEFAULT_VIEW, ...(raw.view && typeof raw.view === 'object' ? raw.view : {}) },
  };
}

function breakCycles(folders) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (const f of folders) {
    const seen = new Set([f.id]);
    let p = f.parentId ? byId.get(f.parentId) : null;
    while (p) {
      if (seen.has(p.id)) { f.parentId = null; break; }
      seen.add(p.id);
      p = p.parentId ? byId.get(p.parentId) : null;
    }
  }
}

/** Adds `incoming` (already normalised) to `current` with fresh ids. Returns a new object. */
export function mergeData(current, incoming, uid) {
  const out = { ...current, folders: [...current.folders], prompts: [...current.prompts], categories: [...current.categories] };
  const folderMap = new Map();
  const catMap = new Map();
  for (const c of incoming.categories) {
    const same = out.categories.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
    if (same) catMap.set(c.id, same.id);
    else { const id = uid(); out.categories.push({ ...c, id }); catMap.set(c.id, id); }
  }
  for (const f of incoming.folders) folderMap.set(f.id, uid());
  const rootOrder = (arr, key) => arr.filter((x) => (x[key] ?? null) === null).length;
  let rootCount = rootOrder(out.folders, 'parentId') + rootOrder(out.prompts, 'folderId');
  for (const f of incoming.folders) {
    const isRoot = !f.parentId;
    out.folders.push({ ...f, id: folderMap.get(f.id), parentId: isRoot ? null : folderMap.get(f.parentId), order: isRoot ? rootCount++ : f.order });
  }
  for (const p of incoming.prompts) {
    const isRoot = !p.folderId;
    out.prompts.push({ ...p, id: uid(), category: p.category ? catMap.get(p.category) ?? null : null,
      folderId: isRoot ? null : folderMap.get(p.folderId), order: isRoot ? rootCount++ : p.order });
  }
  return out;
}
