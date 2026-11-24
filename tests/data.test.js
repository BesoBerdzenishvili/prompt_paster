import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData, mergeData } from '../src/js/lib/data.js';

test('rejects garbage', () => {
  assert.throws(() => normalizeData({ hello: 1 }));
  assert.throws(() => normalizeData(null));
});
test('repairs broken references and cycles', () => {
  const d = normalizeData({
    folders: [{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'zzz' }],
    prompts: [{ id: 'p', title: 't', body: 'b', folderId: 'nope', category: 'nope' }],
  });
  assert.ok(d.folders.some((f) => f.parentId === null));
  assert.equal(d.folders.find((f) => f.id === 'c').parentId, null);
  assert.equal(d.prompts[0].folderId, null);
  assert.equal(d.prompts[0].category, null);
  assert.equal(d.prefs.hideOnBlur, true);
});
test('merge gives fresh ids and reuses same-named categories', () => {
  let n = 0; const uid = () => 'n' + n++;
  const cur = normalizeData({ prompts: [{ id: 'x', title: 'x', body: '' }], categories: [{ id: 'k1', name: 'Work' }] });
  const inc = normalizeData({ folders: [{ id: 'f' }], categories: [{ id: 'z', name: 'work' }], prompts: [{ id: 'x', title: 'y', body: '', category: 'z', folderId: 'f' }] });
  const m = mergeData(cur, inc, uid);
  assert.equal(m.prompts.length, 2);
  assert.equal(m.categories.length, 1);
  assert.equal(m.prompts[1].category, 'k1');
  assert.notEqual(m.prompts[1].id, 'x');
  assert.equal(m.prompts[1].folderId, m.folders[0].id);
});
