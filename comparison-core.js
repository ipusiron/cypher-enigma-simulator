(function exposeCypherEnigmaComparison(globalObject) {
  'use strict';

  const Core = globalObject.CypherEnigmaCore
    || (typeof module !== 'undefined' && module.exports ? require('./logic.js') : null);

  if (!Core) {
    throw new Error('CypherEnigmaCore is required before CypherEnigmaComparison.');
  }

  const { ALPHABET } = Core;
  const MAX_COMPARISON_LENGTH = 40;
  const ROTOR_SPECS = Object.freeze({
    I: Object.freeze({ wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' }),
    II: Object.freeze({ wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' }),
    III: Object.freeze({ wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' }),
    IV: Object.freeze({ wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J' }),
    V: Object.freeze({ wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notch: 'Z' })
  });
  const REFLECTOR_SPECS = Object.freeze({
    B: 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
    C: 'FVPJIAOYEDRZXWGCTKUQSBNMHL'
  });

  function mod26(value) {
    return ((value % 26) + 26) % 26;
  }

  function letterIndex(value, fallback = 'A') {
    if (Number.isInteger(value) && value >= 0 && value < ALPHABET.length) return value;
    const normalized = String(value || fallback).toUpperCase();
    const index = ALPHABET.indexOf(normalized[0]);
    return index >= 0 ? index : ALPHABET.indexOf(fallback);
  }

  function sanitizeText(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, MAX_COMPARISON_LENGTH);
  }

  function normalizeSettings(settings = {}) {
    const rotorOrder = Array.isArray(settings.rotorOrder) && settings.rotorOrder.length === 3
      ? settings.rotorOrder.map((name) => String(name).toUpperCase())
      : ['I', 'II', 'III'];
    if (rotorOrder.some((name) => !ROTOR_SPECS[name])) {
      const error = new RangeError('Unknown historical rotor.');
      error.code = 'comparisonUnknownRotor';
      throw error;
    }
    if (new Set(rotorOrder).size !== rotorOrder.length) {
      const error = new RangeError('Historical rotors must be distinct.');
      error.code = 'comparisonDuplicateRotors';
      throw error;
    }

    const positions = ['left', 'middle', 'right'].map((role, index) => (
      letterIndex(settings.positions?.[role] ?? settings.positions?.[index] ?? 'A')
    ));
    const rings = ['left', 'middle', 'right'].map((role, index) => (
      letterIndex(settings.rings?.[role] ?? settings.rings?.[index] ?? 'A')
    ));
    const reflector = String(settings.reflector || 'B').toUpperCase();
    if (!REFLECTOR_SPECS[reflector]) {
      const error = new RangeError('Unknown reflector.');
      error.code = 'comparisonUnknownReflector';
      throw error;
    }
    return { rotorOrder, positions, rings, reflector };
  }

  function positionString(positions) {
    return positions.map((position) => ALPHABET[position]).join('-');
  }

  function stepHistoricalPositions(positions, rotorOrder) {
    const before = positions.slice();
    const middleAtNotch = before[1] === letterIndex(ROTOR_SPECS[rotorOrder[1]].notch);
    const rightAtNotch = before[2] === letterIndex(ROTOR_SPECS[rotorOrder[2]].notch);
    const after = before.slice();
    if (middleAtNotch) after[0] = mod26(after[0] + 1);
    if (middleAtNotch || rightAtNotch) after[1] = mod26(after[1] + 1);
    after[2] = mod26(after[2] + 1);
    return {
      before,
      after,
      rightAtNotch,
      middleAtNotch,
      middleStepped: middleAtNotch || rightAtNotch,
      leftStepped: middleAtNotch
    };
  }

  function rotorForward(signal, rotorName, position, ring) {
    const wiring = ROTOR_SPECS[rotorName].wiring;
    const contact = mod26(signal + position - ring);
    const wired = letterIndex(wiring[contact]);
    return mod26(wired - position + ring);
  }

  function rotorReverse(signal, rotorName, position, ring) {
    const wiring = ROTOR_SPECS[rotorName].wiring;
    const contact = mod26(signal + position - ring);
    const wired = wiring.indexOf(ALPHABET[contact]);
    return mod26(wired - position + ring);
  }

  function encodeHistorical(text, settings = {}) {
    const input = sanitizeText(text);
    const normalized = normalizeSettings(settings);
    let positions = normalized.positions.slice();
    const trace = [];
    let output = '';
    let previousMiddleStepped = false;

    for (let index = 0; index < input.length; index += 1) {
      const step = stepHistoricalPositions(positions, normalized.rotorOrder);
      positions = step.after;
      let signal = letterIndex(input[index]);
      for (let rotor = 2; rotor >= 0; rotor -= 1) {
        signal = rotorForward(signal, normalized.rotorOrder[rotor], positions[rotor], normalized.rings[rotor]);
      }
      signal = letterIndex(REFLECTOR_SPECS[normalized.reflector][signal]);
      for (let rotor = 0; rotor < 3; rotor += 1) {
        signal = rotorReverse(signal, normalized.rotorOrder[rotor], positions[rotor], normalized.rings[rotor]);
      }
      const outputChar = ALPHABET[signal];
      output += outputChar;
      trace.push({
        step: index + 1,
        input: input[index],
        output: outputChar,
        before: positionString(step.before),
        after: positionString(step.after),
        rightAtNotch: step.rightAtNotch,
        middleAtNotch: step.middleAtNotch,
        middleStepped: step.middleStepped,
        leftStepped: step.leftStepped,
        doubleStep: previousMiddleStepped && step.middleStepped
      });
      previousMiddleStepped = step.middleStepped;
    }

    return { input, output, trace, settings: normalized };
  }

  function buildSimplifiedSettings(settings = {}) {
    const normalized = normalizeSettings(settings);
    const roles = [2, 1, 0];
    return {
      plugboard: '',
      plugboardEnabled: false,
      scramblers: roles.map((sourceIndex, index) => {
        const rotorName = normalized.rotorOrder[sourceIndex];
        return {
          id: index + 1,
          wiring: ROTOR_SPECS[rotorName].wiring,
          position: ALPHABET[normalized.positions[sourceIndex]],
          notch: ROTOR_SPECS[rotorName].notch,
          notchEnabled: true,
          enabled: true
        };
      }),
      reflector: REFLECTOR_SPECS[normalized.reflector],
      reflectorEnabled: true,
      mode: 'encrypt'
    };
  }

  function encodeSimplified(text, settings = {}) {
    const input = sanitizeText(text);
    const state = Core.initializeState(buildSimplifiedSettings(settings));
    const trace = [];
    let output = '';
    for (let index = 0; index < input.length; index += 1) {
      const before = state.scramblers.slice().reverse().map((scrambler) => scrambler.position);
      const outputChar = Core.processChar(input[index], state, null, 'ja');
      const after = state.scramblers.slice().reverse().map((scrambler) => scrambler.position);
      output += outputChar;
      trace.push({
        step: index + 1,
        input: input[index],
        output: outputChar,
        before: positionString(before),
        after: positionString(after)
      });
    }
    return { input, output, trace };
  }

  function countDifferences(first, second) {
    let count = 0;
    const length = Math.max(first.length, second.length);
    for (let index = 0; index < length; index += 1) {
      if (first[index] !== second[index]) count += 1;
    }
    return count;
  }

  function compareModels(text, settings = {}) {
    const normalized = normalizeSettings(settings);
    const historical = encodeHistorical(text, normalized);
    const simplified = encodeSimplified(text, normalized);
    const ringBaseline = encodeHistorical(text, { ...normalized, rings: ['A', 'A', 'A'] });
    return {
      input: historical.input,
      settings: normalized,
      simplified,
      historical,
      ringBaseline,
      outputDifferenceCount: countDifferences(simplified.output, historical.output),
      ringDifferenceCount: countDifferences(ringBaseline.output, historical.output),
      rows: historical.trace.map((row, index) => ({
        ...row,
        simplifiedBefore: simplified.trace[index].before,
        simplifiedAfter: simplified.trace[index].after,
        simplifiedOutput: simplified.trace[index].output
      }))
    };
  }

  const api = Object.freeze({
    MAX_COMPARISON_LENGTH,
    ROTOR_SPECS,
    REFLECTOR_SPECS,
    sanitizeText,
    normalizeSettings,
    stepHistoricalPositions,
    encodeHistorical,
    encodeSimplified,
    compareModels
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalObject.CypherEnigmaComparison = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
