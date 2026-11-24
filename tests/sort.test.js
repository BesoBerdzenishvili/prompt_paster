import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, buildFavs, buildRecent, flattenFolders } from '../src/js/lib/sort.js';
import { DEFAULT_VIEW } from '../src/js/lib/data.js';

const p = (id, title, o = {}) => ({ id, title, body: 'x'.repeat(o.size ?? 5), category: o.cat ?? null, platform: '', folderId: o.folder ?? null,
  createdAt: o.c ?? 1, modifiedAt: o.m ?? 1, order: o.order ?? 0, useCount: o.u ?? 0, lastUsedAt: o.l ?? 0 });
const mk = (view = {}, extra = {}) => ({
  folders: [{ id: 'f1', name: 'Zeta', parentId: null, createdAt: 1, modifiedAt: 1, order: 5 }, { id: 'f2', name: 'Inner', parentId: 'f1', createdAt: 1, modifiedAt: 1, order: 0 }],
  prompts: [p('a', 'banana', { c: 3, size: 1 }), p('b', 'Apple', { c: 1, size: 9, folder: 'f1', u: 3, l: 10 }), p('c', 'cherry', { c: 2, cat: 'k', folder: 'f2', u: 1, l: 20 })],
  categories: [], view: { ...DEFAULT_VIEW, ...view }, ui: { search: '', advanced: false }, ...extra,
});

test('folders first, then prompts by name', () => {
  const t = buildTree(mk());
  assert.deepEqual(t.map((n) => n.type), ['folder', 'prompt']);
  assert.equal(t[1].prompt.id, 'a');
});
test('sort by size desc', () => {
  const s = mk({ sortField: 'size', sortDir: 'desc' });
  s.prompts.push(p('d', 'big', { size: 50 }));
  const prompts = buildTree(s).filter((n) => n.type === 'prompt').map((n) => n.prompt.id);
  assert.deepEqual(prompts, ['d', 'a']);
});
test('free mode follows order, mixing folders and prompts', () => {
  const s = mk({ mode: 'free' });
  s.prompts[0].order = 1;
  assert.deepEqual(buildTree(s).map((n) => n.type), ['prompt', 'folder']);
});
test('search prunes empty folders; advanced searches body', () => {
  const s = mk(); s.ui.search = 'cherry';
  const t = buildTree(s);
  assert.equal(t.length, 1); assert.equal(t[0].folder.id, 'f1'); assert.equal(t[0].count, 1);
  const s2 = mk(); s2.ui.search = 'xxxxxxxxx';
  assert.equal(buildTree(s2).length, 0);
  s2.view.advanced = true;
  assert.equal(buildTree(s2).length, 1);
});
test('category filter only applies in category mode', () => {
  const s = mk({ mode: 'category', categoryFilter: ['k'] });
  assert.equal(buildTree(s)[0].count, 1);
  const s2 = mk({ mode: 'sort', categoryFilter: ['k'] });
  assert.equal(buildTree(s2).length, 2);
});
test('favs and recent', () => {
  assert.deepEqual(buildFavs(mk()).map((x) => x.id), ['b', 'c']);
  assert.deepEqual(buildRecent(mk()).map((x) => x.id), ['c', 'b']);
});
test('flattenFolders is depth-first', () => {
  assert.deepEqual(flattenFolders(mk()).map((f) => [f.name, f.depth]), [['Zeta', 0], ['Inner', 1]]);
});
