(function exposeCypherEnigmaAttack(globalObject) {
  'use strict';

  const Core = globalObject.CypherEnigmaCore
    || (typeof module !== 'undefined' && module.exports ? require('./logic.js') : null);

  if (!Core) {
    throw new Error('CypherEnigmaCore is required before CypherEnigmaAttack.');
  }

  const { ALPHABET } = Core;
  const MAX_RETAINED_CANDIDATES = 100;

  function indexToPositions(index, count) {
    const positions = [];
    let remaining = index;
    for (let i = 0; i < count; i += 1) {
      positions.push(remaining % 26);
      remaining = Math.floor(remaining / 26);
    }
    return positions;
  }

  function buildAttackSettings(positions, baseSettings) {
    let positionIndex = 0;
    const scramblers = baseSettings.scramblers.map((scrambler, index) => {
      const enabled = Boolean(scrambler.enabled && scrambler.wiring);
      if (!enabled) {
        return {
          id: scrambler.id || index + 1,
          wiring: '',
          position: 'A',
          notch: 'Z',
          notchEnabled: true,
          enabled: false
        };
      }

      const position = positions[positionIndex];
      positionIndex += 1;
      return {
        id: scrambler.id || index + 1,
        wiring: scrambler.wiring,
        position: ALPHABET[position],
        notch: scrambler.notch || 'Z',
        notchEnabled: scrambler.notchEnabled !== false,
        enabled: true
      };
    });

    return {
      plugboard: baseSettings.plugboard,
      plugboardEnabled: baseSettings.plugboardEnabled,
      scramblers,
      reflector: baseSettings.reflector,
      reflectorEnabled: baseSettings.reflectorEnabled,
      mode: 'decrypt'
    };
  }

  function normalizeKnownPairs(knownPairs, alphaLength) {
    return (Array.isArray(knownPairs) ? knownPairs : [])
      .map((pair) => ({
        pos: Number(pair.pos),
        char: String(pair.char || '').toUpperCase()
      }))
      .filter((pair) => Number.isInteger(pair.pos)
        && pair.pos >= 0
        && pair.pos < alphaLength
        && /^[A-Z]$/.test(pair.char))
      .sort((first, second) => first.pos - second.pos);
  }

  function decryptTextWithoutTrace(ciphertext, settings) {
    const state = Core.initializeState(settings);
    const output = [];
    for (const char of String(ciphertext || '').toUpperCase()) {
      output.push(/[A-Z]/.test(char) ? Core.processChar(char, state, null, 'ja') : char);
    }
    return output.join('');
  }

  function createSearchState(attackSettings, options = {}) {
    const ciphertext = String(attackSettings?.ciphertext || '');
    const baseSettings = attackSettings?.baseSettings || { scramblers: [] };
    const alphaCiphertext = [...ciphertext.toUpperCase()].filter((char) => /[A-Z]/.test(char));
    const knownPairs = normalizeKnownPairs(attackSettings?.knownPairs, alphaCiphertext.length);
    const scramblerCount = baseSettings.scramblers.filter(
      (scrambler) => scrambler.enabled && scrambler.wiring && scrambler.wiring.length === 26
    ).length;
    const total = scramblerCount > 0 ? 26 ** scramblerCount : 0;
    const retainedLimit = Number.isInteger(options.retainedLimit) && options.retainedLimit >= 0
      ? options.retainedLimit
      : MAX_RETAINED_CANDIDATES;

    return {
      ciphertext,
      alphaCiphertext,
      knownPairs,
      baseSettings,
      scramblerCount,
      total,
      checked: 0,
      matchCount: 0,
      candidates: [],
      survivorCounts: new Array(knownPairs.length + 1).fill(0),
      retainedLimit,
      done: total === 0
    };
  }

  function matchingPrefixLength(searchState, settings) {
    const machine = Core.initializeState(settings);
    const requiredPositions = new Map(searchState.knownPairs.map((pair, index) => [pair.pos, index]));
    const observed = new Array(searchState.knownPairs.length);
    const lastRequiredPosition = searchState.knownPairs.length
      ? searchState.knownPairs[searchState.knownPairs.length - 1].pos
      : -1;

    for (let position = 0; position <= lastRequiredPosition; position += 1) {
      const output = Core.processChar(searchState.alphaCiphertext[position], machine, null, 'ja');
      if (requiredPositions.has(position)) {
        observed[requiredPositions.get(position)] = output;
      }
    }

    let matchedPrefix = 0;
    while (matchedPrefix < searchState.knownPairs.length
      && observed[matchedPrefix] === searchState.knownPairs[matchedPrefix].char) {
      matchedPrefix += 1;
    }
    return matchedPrefix;
  }

  function evaluateCombination(searchState, combinationIndex) {
    const positions = indexToPositions(combinationIndex, searchState.scramblerCount);
    const settings = buildAttackSettings(positions, searchState.baseSettings);
    const matchedPrefix = matchingPrefixLength(searchState, settings);

    searchState.survivorCounts[0] += 1;
    for (let index = 1; index <= matchedPrefix; index += 1) {
      searchState.survivorCounts[index] += 1;
    }

    if (matchedPrefix !== searchState.knownPairs.length) return null;

    searchState.matchCount += 1;
    if (searchState.candidates.length >= searchState.retainedLimit) return null;

    const letters = positions.map((position) => ALPHABET[position]);
    const candidate = {
      positions: letters,
      positionsString: letters.join('-'),
      decryptedFull: decryptTextWithoutTrace(searchState.ciphertext, settings),
      matchedPairs: searchState.knownPairs.map((pair) => ({ ...pair }))
    };
    searchState.candidates.push(candidate);
    return candidate;
  }

  function advanceSearch(searchState, maximumCombinations = 64) {
    if (searchState.done) return getSearchSummary(searchState);
    const batchSize = Number.isInteger(maximumCombinations) && maximumCombinations > 0
      ? maximumCombinations
      : 64;
    const end = Math.min(searchState.checked + batchSize, searchState.total);
    for (let combination = searchState.checked; combination < end; combination += 1) {
      evaluateCombination(searchState, combination);
    }
    searchState.checked = end;
    searchState.done = searchState.checked >= searchState.total;
    return getSearchSummary(searchState);
  }

  function getNarrowingRows(searchState) {
    return searchState.knownPairs.map((pair, index) => {
      const before = searchState.survivorCounts[index];
      const after = searchState.survivorCounts[index + 1];
      return {
        step: index + 1,
        position: pair.pos + 1,
        cipherChar: searchState.alphaCiphertext[pair.pos],
        plainChar: pair.char,
        before,
        after,
        eliminated: before - after
      };
    });
  }

  function getSearchSummary(searchState) {
    return {
      checked: searchState.checked,
      total: searchState.total,
      matchCount: searchState.matchCount,
      shownCount: searchState.candidates.length,
      truncated: searchState.matchCount > searchState.candidates.length,
      complete: searchState.done,
      candidates: searchState.candidates,
      narrowingRows: getNarrowingRows(searchState)
    };
  }

  function runToCompletion(attackSettings, options = {}) {
    const state = createSearchState(attackSettings, options);
    while (!state.done) advanceSearch(state, options.batchSize || 256);
    return getSearchSummary(state);
  }

  const api = Object.freeze({
    MAX_RETAINED_CANDIDATES,
    indexToPositions,
    buildAttackSettings,
    decryptTextWithoutTrace,
    createSearchState,
    evaluateCombination,
    advanceSearch,
    getNarrowingRows,
    getSearchSummary,
    runToCompletion
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalObject.CypherEnigmaAttack = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
