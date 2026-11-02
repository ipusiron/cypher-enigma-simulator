'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 2);
}

function loadSetLiveText() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${extractFunction(main, 'setLiveText')}; this.setLiveText = setLiveText;`, context);
  return context.setLiveText;
}

function fakeElement(text = '') {
  return {
    writes: 0,
    current: text,
    get textContent() { return this.current; },
    set textContent(value) { this.writes += 1; this.current = value; }
  };
}

test('setLiveText writes only when the text changes', () => {
  const setLiveText = loadSetLiveText();
  const element = fakeElement('');
  assert.equal(setLiveText(element, 'A'), true);
  assert.equal(setLiveText(element, 'A'), false);
  assert.equal(setLiveText(element, 'B'), true);
  assert.equal(setLiveText(element, ''), true);
  assert.equal(setLiveText(element, undefined), false);
  assert.equal(setLiveText(null, 'A'), false);
  assert.equal(element.writes, 3);
});

test('search progress bar is visual only and a hidden region announces states', () => {
  assert.doesNotMatch(html, /id="attack-progress"[^>]*(role=|aria-live)/);
  assert.match(html, /id="attack-progress-announcement" class="visually-hidden" role="status"/);
  assert.match(css, /\.visually-hidden\s*\{[^}]*clip-path: inset\(50%\)/);
});

test('live regions are written through setLiveText', () => {
  const progress = extractFunction(main, 'updateAttackProgress');
  assert.match(progress, /announceAttackStatus\(/);
  assert.equal((progress.match(/announceAttackStatus\(/g) || []).length, 2);
  assert.doesNotMatch(progress.split('} else {').pop(), /announceAttackStatus/);
  assert.match(extractFunction(main, 'announceAttackStatus'), /setLiveText\(/);
  assert.match(extractFunction(main, 'displayComparisonError'), /setLiveText\(container, message\)/);
  const run = extractFunction(main, 'runKnownPlaintextAttack');
  assert.match(run, /announceAttackStatus\(t\('searching'\)\)/);
  assert.match(run, /announceAttackStatus\(t\('searchFailed'\)\)/);
});
