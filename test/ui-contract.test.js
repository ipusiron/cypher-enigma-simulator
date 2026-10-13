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

function loadMessages() {
  const context = { globalThis: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'messages.js'), 'utf8'), context);
  return context.globalThis.CypherEnigmaMessages;
}

test('browser scripts load all cores and messages before the UI controller', () => {
  assert.ok(html.indexOf('logic.js') < html.indexOf('attack-core.js'));
  assert.ok(html.indexOf('attack-core.js') < html.indexOf('comparison-core.js'));
  assert.ok(html.indexOf('comparison-core.js') < html.indexOf('messages.js'));
  assert.ok(html.indexOf('messages.js') < html.indexOf('main.js'));
});

test('all static translation keys exist in Japanese and English', () => {
  const messages = loadMessages();
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)].map(match => match[1]);
  for (const key of keys) {
    assert.equal(typeof messages.ja[key], 'string', `missing ja.${key}`);
    assert.equal(typeof messages.en[key], 'string', `missing en.${key}`);
  }
});

test('language control and bilingual README are present', () => {
  assert.match(html, /id="language-toggle"/);
  assert.equal(fs.existsSync(path.join(root, 'README.en.md')), true);
});

test('CSP stays dependency-free and rejects inline scripts', () => {
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /'unsafe-inline'|'unsafe-eval'/);
  assert.doesNotMatch(html, /\son(?:click|input|change)=/i);
});

test('input limits are declared in the UI', () => {
  assert.match(html, /id="input-text"[^>]*maxlength="20000"/);
  assert.match(html, /id="attack-ciphertext"[^>]*maxlength="200"/);
  assert.match(html, /id="comparison-input"[^>]*maxlength="40"/);
});

test('the mobile base layout stacks scrambler controls', () => {
  assert.match(css, /\.scrambler-inputs\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.action-buttons\s*>\s*button\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /\.comparison-setting-grid[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.comparison-table\s*\{[^}]*min-width:/s);
  assert.match(css, /@media\s*\(min-width:\s*600px\)/);
});

test('the UI controller delegates processing to the pure core', () => {
  assert.match(main, /Core\.processText\(text, settings/);
  assert.match(main, /Core\.validateReflectorWiring/);
  assert.match(main, /Attack\.createSearchState/);
  assert.match(main, /Attack\.advanceSearch/);
  assert.match(main, /Comparison\.compareModels/);
});

test('model comparison exposes samples, timeline, and scoped evidence', () => {
  assert.match(html, /id="tab-comparison-button"/);
  assert.match(html, /id="comparison-known-vector-btn"/);
  assert.match(html, /id="comparison-double-step-btn"/);
  assert.match(html, /id="comparison-timeline-body"/);
  assert.match(html, /H\.Dv\.g\. 14 \(1940\)/);
});

test('search progress, cancellation, and narrowing table are available', () => {
  assert.match(html, /id="attack-cancel-btn"/);
  assert.match(html, /id="attack-progress-bar"/);
  assert.match(html, /id="attack-narrowing-body"/);
  assert.match(css, /\.attack-actions\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(main, /updateAttackProgress\(lastAttackResults\.summary/);
  assert.doesNotMatch(main, /function performKnownPlaintextAttack/);
});

test('CI runs the complete Node test suite', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'test.yml'), 'utf8');
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm test/);
});
