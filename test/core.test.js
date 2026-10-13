'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../logic.js');

function settings(overrides = {}) {
  return {
    plugboard: '',
    plugboardEnabled: false,
    scramblers: [{
      id: 1,
      wiring: 'UWYGADFPVZBECKMTHXSLRINQOJ',
      position: 'A',
      notch: 'Z',
      notchEnabled: false,
      enabled: true
    }],
    reflector: Core.DEFAULT_REFLECTOR,
    reflectorEnabled: true,
    mode: 'encrypt',
    ...overrides
  };
}

test('all bundled wirings are valid permutations', () => {
  for (const preset of [...Core.PRESET_WIRINGS.scrambler, ...Core.PRESET_WIRINGS.reflector]) {
    if (!preset.wiring) continue;
    assert.equal(Core.validateWiring(preset.wiring, { allowEmpty: false }).valid, true);
  }
});

test('wiring validation rejects wrong lengths and duplicates', () => {
  assert.equal(Core.validateWiring('ABC', { allowEmpty: false }).code, 'length');
  assert.equal(Core.validateWiring('ABCDEFGHIJKLMNOPQRSTUVWXYA', { allowEmpty: false }).code, 'duplicate');
});

test('bundled reflectors are self-inverse and fixed-point-free', () => {
  for (const preset of Core.PRESET_WIRINGS.reflector.slice(1)) {
    assert.deepEqual(Core.validateReflectorWiring(preset.wiring).valid, true);
  }
});

test('reflector validation rejects a permutation that is not self-inverse', () => {
  assert.equal(Core.validateReflectorWiring('EKMFLGDQVZNTOWYHXUSPAIBRCJ').code, 'reflectorNotSelfInverse');
});

test('reflector validation rejects fixed points', () => {
  assert.equal(Core.validateReflectorWiring(Core.ALPHABET).code, 'reflectorFixedPoint');
});

test('Cypher puzzle 01 known vector decrypts ZYDNI to ULTRA', () => {
  const result = Core.processText('ZYDNI', settings({ mode: 'decrypt' }));
  assert.equal(result.output, 'ULTRA');
});

test('reflector path is involutive with the same starting settings', () => {
  const encoded = Core.processText('ULTRA', settings()).output;
  assert.equal(encoded, 'ZYDNI');
  assert.equal(Core.processText(encoded, settings()).output, 'ULTRA');
});

test('encrypt and decrypt labels use the same operation with a reflector', () => {
  const encrypted = Core.processText('ENIGMA', settings({ mode: 'encrypt' })).output;
  const decrypted = Core.processText('ENIGMA', settings({ mode: 'decrypt' })).output;
  assert.equal(encrypted, decrypted);
});

test('reflectorless direct mode uses distinct forward and inverse paths', () => {
  const direct = settings({ reflectorEnabled: false, mode: 'encrypt' });
  const encrypted = Core.processText('HELLOWORLD', direct).output;
  assert.notEqual(encrypted, 'HELLOWORLD');
  assert.notEqual(encrypted, Core.processText('HELLOWORLD', { ...direct, mode: 'decrypt' }).output);
  assert.equal(Core.processText(encrypted, { ...direct, mode: 'decrypt' }).output, 'HELLOWORLD');
});

test('plugboard is applied symmetrically around a direct path', () => {
  const direct = settings({ reflectorEnabled: false, mode: 'encrypt', plugboardEnabled: true, plugboard: 'A-B, C-D' });
  const encrypted = Core.processText('ABCD', direct).output;
  assert.equal(Core.processText(encrypted, { ...direct, mode: 'decrypt' }).output, 'ABCD');
});

test('notch crossing advances the next scrambler', () => {
  const first = Core.createScrambler(Core.PRESET_WIRINGS.scrambler[1].wiring, 'C', 'C', true, 1);
  const second = Core.createScrambler(Core.PRESET_WIRINGS.scrambler[2].wiring, 'A', 'Z', true, 2);
  Core.rotateActiveScramblers([first, second]);
  assert.equal(first.position, 3);
  assert.equal(second.position, 1);
});

test('notch OFF advances the next scrambler only on Z-to-A wrap', () => {
  const first = Core.createScrambler(Core.PRESET_WIRINGS.scrambler[1].wiring, 'Z', 'C', false, 1);
  const second = Core.createScrambler(Core.PRESET_WIRINGS.scrambler[2].wiring, 'A', 'Z', true, 2);
  Core.rotateActiveScramblers([first, second]);
  assert.equal(first.position, 0);
  assert.equal(second.position, 1);
});

test('non A-Z characters pass through without stepping', () => {
  const withSeparator = Core.processText('A-1 B', settings()).output;
  const lettersOnly = Core.processText('AB', settings()).output;
  assert.equal(withSeparator.replace('-1 ', ''), lettersOnly);
});

test('English processing traces are localized', () => {
  const result = Core.processText('A', settings(), { language: 'en' });
  assert.match(result.log, /Path: reflector round trip/);
  assert.doesNotMatch(result.log, /処理開始/);
});

test('oversized input is rejected by the core', () => {
  assert.throws(
    () => Core.processText('A'.repeat(Core.MAX_INPUT_LENGTH + 1), settings()),
    (error) => error instanceof RangeError && error.code === 'inputTooLong'
  );
});
