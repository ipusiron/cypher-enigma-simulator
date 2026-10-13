'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Comparison = require('../comparison-core.js');

const standardSettings = {
  rotorOrder: ['I', 'II', 'III'],
  positions: ['A', 'A', 'A'],
  rings: ['A', 'A', 'A'],
  reflector: 'B'
};

test('historical subset reproduces the Enigma I reference vector', () => {
  const result = Comparison.encodeHistorical('AAAAA', standardSettings);
  assert.equal(result.output, 'BDZGO');
  assert.deepEqual(result.trace.map((row) => row.after), ['A-A-B', 'A-A-C', 'A-A-D', 'A-A-E', 'A-A-F']);
});

test('historical reflector path round-trips with identical settings', () => {
  const encrypted = Comparison.encodeHistorical('HELLOWORLD', standardSettings).output;
  assert.equal(encrypted, 'ILBDAAMTAZ');
  assert.equal(Comparison.encodeHistorical(encrypted, standardSettings).output, 'HELLOWORLD');
});

test('middle rotor double-steps on consecutive keypresses', () => {
  const result = Comparison.encodeHistorical('AAA', {
    ...standardSettings,
    positions: ['A', 'D', 'U']
  });
  assert.deepEqual(result.trace.map((row) => row.after), ['A-D-V', 'A-E-W', 'B-F-X']);
  assert.deepEqual(result.trace.map((row) => row.middleStepped), [false, true, true]);
  assert.deepEqual(result.trace.map((row) => row.doubleStep), [false, false, true]);

  const comparison = Comparison.compareModels('AAA', {
    ...standardSettings,
    positions: ['A', 'D', 'U']
  });
  assert.deepEqual(comparison.historical.trace.map((row) => row.after), ['A-D-V', 'A-E-W', 'B-F-X']);
});

test('ring settings change the electrical mapping without changing the visible turnover schedule', () => {
  const withRing = Comparison.encodeHistorical('AAAAA', {
    ...standardSettings,
    rings: ['A', 'A', 'B']
  });
  const baseline = Comparison.encodeHistorical('AAAAA', standardSettings);
  assert.notEqual(withRing.output, baseline.output);
  assert.deepEqual(withRing.trace.map((row) => row.after), baseline.trace.map((row) => row.after));

  const comparison = Comparison.compareModels('AAAAA', {
    ...standardSettings,
    rings: ['A', 'A', 'B']
  });
  assert.equal(comparison.ringDifferenceCount, 5);
});

test('model comparison keeps orientation explicit and reports differing output letters', () => {
  const result = Comparison.compareModels('AAAAA', standardSettings);
  assert.equal(result.historical.output, 'BDZGO');
  assert.equal(result.simplified.output, 'FPPWT');
  assert.equal(result.rows[0].output, 'B');
  assert.equal(result.rows[0].simplifiedAfter, 'A-A-B');
  assert.ok(result.outputDifferenceCount > 0);
});

test('comparison rejects duplicate historical rotors', () => {
  assert.throws(
    () => Comparison.compareModels('A', { ...standardSettings, rotorOrder: ['I', 'I', 'III'] }),
    (error) => error.code === 'comparisonDuplicateRotors'
  );
});

test('comparison input is restricted to 40 ASCII letters', () => {
  assert.equal(Comparison.sanitizeText(`a-b 12 ${'Z'.repeat(50)}`).length, 40);
  assert.match(Comparison.sanitizeText('a-b 12'), /^AB$/);
});
