'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../logic.js');
const Attack = require('../attack-core.js');

function puzzleSettings(knownPairs = []) {
  return {
    ciphertext: 'ZYDNI',
    knownPairs,
    baseSettings: {
      plugboard: '',
      plugboardEnabled: false,
      scramblers: [
        {
          id: 1,
          wiring: 'UWYGADFPVZBECKMTHXSLRINQOJ',
          position: 'A',
          notch: 'Z',
          notchEnabled: true,
          enabled: true
        }
      ],
      reflector: Core.DEFAULT_REFLECTOR,
      reflectorEnabled: true
    }
  };
}

test('combination indexes use base-26 positions with the first scrambler changing fastest', () => {
  assert.deepEqual(Attack.indexToPositions(0, 2), [0, 0]);
  assert.deepEqual(Attack.indexToPositions(25, 2), [25, 0]);
  assert.deepEqual(Attack.indexToPositions(26, 2), [0, 1]);
  assert.deepEqual(Attack.indexToPositions(675, 2), [25, 25]);
});

test('Cypher Puzzle 01 search finds initial position A', () => {
  const knownPairs = [...'ULTRA'].map((char, pos) => ({ pos, char }));
  const summary = Attack.runToCompletion(puzzleSettings(knownPairs));
  assert.equal(summary.complete, true);
  assert.equal(summary.checked, 26);
  assert.equal(summary.matchCount, 1);
  assert.equal(summary.candidates[0].positionsString, 'A');
  assert.equal(summary.candidates[0].decryptedFull, 'ULTRA');
});

test('batched search advances only by the requested amount', () => {
  const state = Attack.createSearchState(puzzleSettings([{ pos: 0, char: 'U' }]));
  const first = Attack.advanceSearch(state, 5);
  assert.equal(first.checked, 5);
  assert.equal(first.complete, false);
  const second = Attack.advanceSearch(state, 7);
  assert.equal(second.checked, 12);
  assert.equal(second.complete, false);
  while (!state.done) Attack.advanceSearch(state, 4);
  assert.equal(Attack.getSearchSummary(state).checked, 26);
});

test('narrowing counts never increase as known letters are added', () => {
  const knownPairs = [...'ULTRA'].map((char, pos) => ({ pos, char }));
  const summary = Attack.runToCompletion(puzzleSettings(knownPairs));
  assert.equal(summary.narrowingRows.length, 5);
  assert.equal(summary.narrowingRows[0].before, 26);
  assert.equal(summary.narrowingRows.at(-1).after, 1);
  for (const row of summary.narrowingRows) {
    assert.ok(row.after <= row.before);
    assert.equal(row.eliminated, row.before - row.after);
  }
});

test('candidate retention limits rendering without changing the exact match count', () => {
  const summary = Attack.runToCompletion(puzzleSettings([]), { retainedLimit: 3 });
  assert.equal(summary.matchCount, 26);
  assert.equal(summary.shownCount, 3);
  assert.equal(summary.truncated, true);
});

test('known-pair positions count letters and ignore separators', () => {
  const settings = puzzleSettings([
    { pos: 0, char: 'U' },
    { pos: 4, char: 'A' }
  ]);
  settings.ciphertext = 'Z-Y D!N?I';
  const summary = Attack.runToCompletion(settings);
  assert.equal(summary.matchCount, 1);
  assert.equal(summary.candidates[0].decryptedFull, 'U-L T!R?A');
  assert.equal(summary.narrowingRows[1].position, 5);
});
