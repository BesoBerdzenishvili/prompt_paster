import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingToken, platformMatches, detectPlatform, platformFilterActive, platformTokens } from '../src/js/lib/platform.js';
import { passingIds, isFiltering } from '../src/js/lib/sort.js';
import { DEFAULT_VIEW, DEFAULT_PREFS } from '../src/js/lib/data.js';

const p = (id, platform) => ({ id, title: id, body: 'x', category: null, platform, folderId: null, createdAt: 1, modifiedAt: 1, order: 0, useCount: 0, lastUsedAt: 0 });
const mk = (prefs = {}, ui = {}) => ({
  folders: [], categories: [], view: { ...DEFAULT_VIEW },
  prompts: [p('c', 'Claude'), p('g', 'ChatGPT'), p('multi', 'gemini, claude'), p('none', '')],
  prefs: { ...DEFAULT_PREFS, platformFilter: true, ...prefs },
  ui: { search: '', foreground: { title: 'My chat - Claude - Google Chrome', process: 'chrome' }, ...ui },
});
const ids = (s) => [...passingIds(s)].sort();

test('tokens split on comma/semicolon', () => {
  assert.deepEqual(platformTokens(' a , b;c ,, '), ['a', 'b', 'c']);
  assert.deepEqual(platformTokens(''), []);
});
test('matches window title or process name, case-insensitive', () => {
  assert.equal(matchingToken('claude', { title: 'Claude', process: '' }), 'claude');
  assert.equal(platformMatches('Chrome', { title: 'x', process: 'chrome' }), true);
  assert.equal(platformMatches('Claude', { title: 'Notepad', process: 'notepad' }), false);
  assert.equal(platformMatches('', { title: 'Claude', process: '' }), false);
  assert.equal(platformMatches('Claude', null), false);
});
test('filter keeps matching + generic prompts by default', () => {
  assert.deepEqual(ids(mk()), ['c', 'multi', 'none']);
});
test('sub-toggle off: only platform-specific matches', () => {
  assert.deepEqual(ids(mk({ platformKeepGeneric: false })), ['c', 'multi']);
});
test('master toggle off: nothing is filtered', () => {
  const s = mk({ platformFilter: false });
  assert.deepEqual(ids(s), ['c', 'g', 'multi', 'none']);
  assert.equal(isFiltering(s), false);
});
test('no prompt matches the foreground app: show everything', () => {
  const s = mk({}, { foreground: { title: 'Notepad', process: 'notepad' } });
  assert.equal(detectPlatform(s), null);
  assert.deepEqual(ids(s), ['c', 'g', 'multi', 'none']);
});
test('"show all" override and missing foreground disable the filter', () => {
  assert.equal(platformFilterActive(mk({}, { platformShowAll: true })), false);
  assert.deepEqual(ids(mk({}, { platformShowAll: true })), ['c', 'g', 'multi', 'none']);
  assert.equal(platformFilterActive(mk({}, { foreground: null })), false);
});
test('active platform filter counts as filtering (folders pruned/opened)', () => {
  assert.equal(isFiltering(mk()), true);
});
