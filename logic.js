(function exposeCypherEnigmaCore(globalObject) {
  'use strict';

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const MAX_INPUT_LENGTH = 20000;
  const MAX_ATTACK_LENGTH = 200;
  const DEFAULT_REFLECTOR = 'YRUHQSLDPXNGOKMIEBFZCWVJAT';

  const PRESET_WIRINGS = Object.freeze({
    scrambler: Object.freeze([
      Object.freeze({ nameKey: 'presetCustom', wiring: '' }),
      Object.freeze({ nameKey: 'presetRotorI', wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ' }),
      Object.freeze({ nameKey: 'presetRotorII', wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE' }),
      Object.freeze({ nameKey: 'presetRotorIII', wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO' }),
      Object.freeze({ nameKey: 'presetRotorIV', wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB' }),
      Object.freeze({ nameKey: 'presetRotorV', wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK' })
    ]),
    reflector: Object.freeze([
      Object.freeze({ nameKey: 'presetCustom', wiring: '' }),
      Object.freeze({ nameKey: 'presetReflectorB', wiring: DEFAULT_REFLECTOR }),
      Object.freeze({ nameKey: 'presetReflectorC', wiring: 'FVPJIAOYEDRZXWGCTKUQSBNMHL' })
    ])
  });

  const LOG_MESSAGES = Object.freeze({
    ja: Object.freeze({
      wiringHeading: '【配線設定】',
      pathReflector: '経路: リフレクター往復（暗号化と復号は同じ操作）',
      pathDirectEncrypt: '経路: 直通・順方向（実験モード）',
      pathDirectDecrypt: '経路: 直通・逆方向（実験モード）',
      rotor: 'スクランブラー{number}',
      position: '位置',
      notch: 'ノッチ',
      off: 'OFF',
      reflector: 'リフレクター',
      processHeading: '【処理開始】',
      charHeading: '【文字 {char} の処理】',
      rotated: '回転後',
      input: '入力',
      plugboardIn: 'プラグボード（入力側）',
      plugboardOut: 'プラグボード（出力側）',
      forward: '順方向',
      reverse: '逆方向',
      result: '結果',
      noComponents: '（有効なコンポーネントがありません）'
    }),
    en: Object.freeze({
      wiringHeading: '[Wiring settings]',
      pathReflector: 'Path: reflector round trip (the same operation encrypts and decrypts)',
      pathDirectEncrypt: 'Path: direct forward pass (experimental mode)',
      pathDirectDecrypt: 'Path: direct inverse pass (experimental mode)',
      rotor: 'Scrambler {number}',
      position: 'position',
      notch: 'notch',
      off: 'OFF',
      reflector: 'Reflector',
      processHeading: '[Processing]',
      charHeading: '[Processing {char}]',
      rotated: 'After stepping',
      input: 'Input',
      plugboardIn: 'Plugboard (input side)',
      plugboardOut: 'Plugboard (output side)',
      forward: 'forward',
      reverse: 'inverse',
      result: 'Result',
      noComponents: '(No active components)'
    })
  });

  function interpolate(template, variables = {}) {
    return template.replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
    ));
  }

  function logText(language, key, variables) {
    const dictionary = LOG_MESSAGES[language] || LOG_MESSAGES.ja;
    return interpolate(dictionary[key] || LOG_MESSAGES.ja[key] || key, variables);
  }

  function validateWiring(wiring, options = {}) {
    const allowEmpty = options.allowEmpty !== false;
    const normalized = typeof wiring === 'string' ? wiring.trim().toUpperCase() : '';
    if (!normalized) {
      return allowEmpty
        ? { valid: true, code: null, normalized }
        : { valid: false, code: 'required', normalized };
    }
    if (normalized.length !== 26) {
      return { valid: false, code: 'length', normalized, current: normalized.length };
    }
    if (!/^[A-Z]+$/.test(normalized)) {
      return { valid: false, code: 'alphabet', normalized };
    }
    const seen = new Set();
    for (const char of normalized) {
      if (seen.has(char)) {
        return { valid: false, code: 'duplicate', normalized, char };
      }
      seen.add(char);
    }
    return { valid: true, code: null, normalized };
  }

  function validateReflectorWiring(wiring) {
    const base = validateWiring(wiring, { allowEmpty: false });
    if (!base.valid) return base;
    const normalized = base.normalized;
    for (let i = 0; i < 26; i += 1) {
      const mappedIndex = ALPHABET.indexOf(normalized[i]);
      if (normalized[mappedIndex] !== ALPHABET[i]) {
        return { valid: false, code: 'reflectorNotSelfInverse', normalized, char: ALPHABET[i] };
      }
      if (normalized[i] === ALPHABET[i]) {
        return { valid: false, code: 'reflectorFixedPoint', normalized, char: ALPHABET[i] };
      }
    }
    return { valid: true, code: null, normalized };
  }

  function parsePlugboard(value) {
    const map = new Map();
    if (typeof value !== 'string' || !value.trim()) return map;
    const pairs = value.toUpperCase().split(/[,\s]+/).filter(Boolean);
    for (const pair of pairs) {
      const match = pair.match(/^([A-Z])-([A-Z])$/);
      if (!match || match[1] === match[2]) continue;
      const [, first, second] = match;
      if (map.has(first) || map.has(second)) continue;
      map.set(first, second);
      map.set(second, first);
    }
    return map;
  }

  function applyPlugboard(char, map) {
    return map.get(char) || char;
  }

  function rotateWiringLeft(wiring, amount) {
    const normalizedAmount = ((amount % 26) + 26) % 26;
    return wiring.slice(normalizedAmount) + wiring.slice(0, normalizedAmount);
  }

  function createScrambler(wiring, position, notch = 'Z', notchEnabled = true, originalId = null) {
    const validation = validateWiring(wiring, { allowEmpty: false });
    if (!validation.valid) return null;
    const positionIndex = ALPHABET.indexOf(String(position || 'A').toUpperCase());
    if (positionIndex < 0) return null;
    const requestedNotch = ALPHABET.indexOf(String(notch || 'Z').toUpperCase());
    const notchIndex = requestedNotch >= 0 ? requestedNotch : 25;
    return {
      baseWiring: validation.normalized,
      wiring: rotateWiringLeft(validation.normalized, positionIndex),
      position: positionIndex,
      notch: notchIndex,
      notchEnabled: notchEnabled !== false,
      originalId
    };
  }

  function rotateScrambler(scrambler, direction = 1) {
    scrambler.position = (scrambler.position + direction + 26) % 26;
    scrambler.wiring = rotateWiringLeft(scrambler.baseWiring, scrambler.position);
  }

  function rotateActiveScramblers(scramblers, direction = 1) {
    if (scramblers.length === 0) return;
    const previousPositions = scramblers.map((scrambler) => scrambler.position);
    rotateScrambler(scramblers[0], direction);
    for (let i = 0; i < scramblers.length - 1; i += 1) {
      const notch = scramblers[i].notchEnabled === false ? 25 : scramblers[i].notch;
      const nextPosition = (notch + direction + 26) % 26;
      const shouldCascade = previousPositions[i] === notch && scramblers[i].position === nextPosition;
      if (!shouldCascade) break;
      rotateScrambler(scramblers[i + 1], direction);
    }
  }

  function shiftAlphabet(shift) {
    return rotateWiringLeft(ALPHABET, shift);
  }

  function scramblerForward(inputPosition, scrambler) {
    const shiftedAlphabet = shiftAlphabet(scrambler.position);
    return scrambler.wiring.indexOf(shiftedAlphabet[inputPosition]);
  }

  function scramblerReverse(inputPosition, scrambler) {
    const shiftedAlphabet = shiftAlphabet(scrambler.position);
    return shiftedAlphabet.indexOf(scrambler.wiring[inputPosition]);
  }

  function initializeState(settings) {
    const sourceScramblers = Array.isArray(settings.scramblers) ? settings.scramblers : [];
    const scramblers = sourceScramblers.flatMap((setting, index) => {
      if (!setting || !setting.enabled) return [];
      const scrambler = createScrambler(
        setting.wiring,
        setting.position,
        setting.notch || 'Z',
        setting.notchEnabled !== false,
        setting.id || index + 1
      );
      return scrambler ? [scrambler] : [];
    });
    const reflectorEnabled = settings.reflectorEnabled !== false;
    return {
      scramblers,
      plugboardMap: settings.plugboardEnabled ? parsePlugboard(settings.plugboard) : new Map(),
      reflector: reflectorEnabled ? String(settings.reflector || DEFAULT_REFLECTOR).toUpperCase() : null,
      reflectorEnabled,
      mode: settings.mode === 'decrypt' ? 'decrypt' : 'encrypt',
      direction: 1
    };
  }

  function describePath(state, language) {
    if (state.reflectorEnabled) return logText(language, 'pathReflector');
    return logText(language, state.mode === 'decrypt' ? 'pathDirectDecrypt' : 'pathDirectEncrypt');
  }

  function formatInitialState(state, language) {
    const lines = [logText(language, 'wiringHeading'), describePath(state, language), ''];
    state.scramblers.forEach((scrambler, index) => {
      const number = scrambler.originalId || index + 1;
      const notch = scrambler.notchEnabled ? ALPHABET[scrambler.notch] : logText(language, 'off');
      lines.push(`${logText(language, 'rotor', { number })}: ${scrambler.baseWiring}`);
      lines.push(`  ${logText(language, 'position')}: ${ALPHABET[scrambler.position]} / ${logText(language, 'notch')}: ${notch}`);
    });
    if (state.reflectorEnabled && state.reflector) {
      lines.push(`${logText(language, 'reflector')}: ${state.reflector}`);
    }
    lines.push('', '────────────────────────────────────────', logText(language, 'processHeading'));
    return lines.join('\n');
  }

  function formatCharacterTrace(trace, language) {
    const lines = [
      '────────────────────────────────────────',
      logText(language, 'charHeading', { char: trace.input }),
      describePath(trace.state, language),
      `${logText(language, 'rotated')}: ${trace.rotorPositions || '-'}`,
      `${logText(language, 'input')}: ${trace.input}`
    ];
    if (trace.afterPlugboardInput !== trace.input) {
      lines.push(`${logText(language, 'plugboardIn')}: ${trace.input} → ${trace.afterPlugboardInput}`);
    }
    trace.stages.forEach((stage) => {
      if (stage.type === 'reflector') {
        lines.push(`${logText(language, 'reflector')}: ${stage.before} → ${stage.after}`);
      } else {
        const directionKey = stage.type === 'forward' ? 'forward' : 'reverse';
        lines.push(`${logText(language, 'rotor', { number: stage.number })} ${logText(language, directionKey)}: ${stage.before} → ${stage.after}`);
      }
    });
    if (trace.beforePlugboardOutput !== trace.output) {
      lines.push(`${logText(language, 'plugboardOut')}: ${trace.beforePlugboardOutput} → ${trace.output}`);
    }
    lines.push(`${logText(language, 'result')}: ${trace.input} → ${trace.output}`);
    return lines.join('\n');
  }

  function processChar(char, state, logEntries = [], language = 'ja') {
    rotateActiveScramblers(state.scramblers, state.direction);
    const upperChar = char.toUpperCase();
    const afterPlugboardInput = applyPlugboard(upperChar, state.plugboardMap);
    let currentPosition = ALPHABET.indexOf(afterPlugboardInput);
    const stages = [];

    const runForward = () => {
      state.scramblers.forEach((scrambler, index) => {
        const before = ALPHABET[currentPosition];
        currentPosition = scramblerForward(currentPosition, scrambler);
        stages.push({ type: 'forward', number: scrambler.originalId || index + 1, before, after: ALPHABET[currentPosition] });
      });
    };
    const runReverse = () => {
      for (let index = state.scramblers.length - 1; index >= 0; index -= 1) {
        const scrambler = state.scramblers[index];
        const before = ALPHABET[currentPosition];
        currentPosition = scramblerReverse(currentPosition, scrambler);
        stages.push({ type: 'reverse', number: scrambler.originalId || index + 1, before, after: ALPHABET[currentPosition] });
      }
    };

    if (state.reflectorEnabled && state.reflector) {
      runForward();
      const before = ALPHABET[currentPosition];
      currentPosition = ALPHABET.indexOf(state.reflector[currentPosition]);
      stages.push({ type: 'reflector', before, after: ALPHABET[currentPosition] });
      runReverse();
    } else if (state.mode === 'decrypt') {
      runReverse();
    } else {
      runForward();
    }

    const beforePlugboardOutput = ALPHABET[currentPosition];
    const output = applyPlugboard(beforePlugboardOutput, state.plugboardMap);
    const trace = {
      input: upperChar,
      output,
      afterPlugboardInput,
      beforePlugboardOutput,
      stages,
      rotorPositions: state.scramblers.map((scrambler) => `${scrambler.originalId || '?'}:${ALPHABET[scrambler.position]}`).join(' '),
      state
    };
    if (Array.isArray(logEntries)) logEntries.push(formatCharacterTrace(trace, language));
    return output;
  }

  function processText(text, settings, options = {}) {
    const source = typeof text === 'string' ? text : '';
    if (source.length > MAX_INPUT_LENGTH) {
      const error = new RangeError(`Input exceeds ${MAX_INPUT_LENGTH} characters.`);
      error.code = 'inputTooLong';
      throw error;
    }
    const language = options.language === 'en' ? 'en' : 'ja';
    const state = initializeState(settings || {});
    const hasActiveComponents = state.scramblers.length > 0 || state.plugboardMap.size > 0 || state.reflectorEnabled;
    if (!hasActiveComponents) {
      return { output: source.toUpperCase(), log: logText(language, 'noComponents') };
    }
    const logEntries = [formatInitialState(state, language)];
    const output = [];
    for (const char of source.toUpperCase()) {
      output.push(/[A-Z]/.test(char) ? processChar(char, state, logEntries, language) : char);
    }
    return { output: output.join(''), log: logEntries.join('\n\n') };
  }

  const api = Object.freeze({
    ALPHABET,
    DEFAULT_REFLECTOR,
    MAX_INPUT_LENGTH,
    MAX_ATTACK_LENGTH,
    PRESET_WIRINGS,
    validateWiring,
    validateReflectorWiring,
    parsePlugboard,
    applyPlugboard,
    createScrambler,
    rotateActiveScramblers,
    initializeState,
    processChar,
    processText
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalObject.CypherEnigmaCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
