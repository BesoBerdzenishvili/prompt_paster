import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVars, fillVars } from '../src/js/lib/vars.js';

test('extracts unique names in order', () => {
  assert.deepEqual(extractVars('a {topic} b {tone} c {topic}'), ['topic', 'tone']);
});
test('trims names and ignores empty/escaped', () => {
  assert.deepEqual(extractVars('{ x } {} \\{no} {y}'), ['x', 'y']);
});
test('fills values, keeps empty ones in original form', () => {
  assert.equal(fillVars('tell me about {random topic} in {tone}', { 'random topic': 'cats', tone: '' }), 'tell me about cats in {tone}');
});
test('replaces every occurrence and unescapes', () => {
  assert.equal(fillVars('{a} and {a} \\{keep}', { a: '1' }), '1 and 1 {keep}');
});
test('values containing $ are inserted literally', () => {
  assert.equal(fillVars('{a}', { a: '$& $1' }), '$& $1');
});
