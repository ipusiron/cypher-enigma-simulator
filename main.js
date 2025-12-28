/**
 * Cypher Enigma Simulator
 * Cypher パズル用 簡略エニグマシミュレーター
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// =================================
// Preset Wirings
// =================================
const PRESET_WIRINGS = {
  scrambler: [
    { name: 'カスタム', wiring: '' },
    { name: 'Enigma I', wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ' },
    { name: 'Enigma II', wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE' },
    { name: 'Enigma III', wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO' },
    { name: 'Enigma IV', wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB' },
    { name: 'Enigma V', wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK' }
  ],
  reflector: [
    { name: 'カスタム', wiring: '' },
    { name: 'Reflector B', wiring: 'YRUHQSLDPXNGOKMIEBFZCWVJAT' },
    { name: 'Reflector C', wiring: 'FVPJIAOYEDRZXWGCTKUQSBNMHL' }
  ]
};

// =================================
// Storage Module (with security)
// =================================
const STORAGE_KEY = 'cypher-enigma-settings';
const STORAGE_VERSION = 1;

/**
 * Sanitizes a string for safe storage (A-Z only for wiring, limited chars for others)
 * @param {string} str - Input string
 * @param {string} type - Type of field ('wiring', 'position', 'plugboard')
 * @returns {string} Sanitized string
 */
function sanitizeInput(str, type) {
  if (typeof str !== 'string') return '';

  switch (type) {
    case 'wiring':
      // Only A-Z, max 26 chars
      return str.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 26);
    case 'position':
      // Only A-Z, max 1 char
      return str.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) || 'A';
    case 'plugboard':
      // Only A-Z, dash, comma, space
      return str.toUpperCase().replace(/[^A-Z\-,\s]/g, '').slice(0, 100);
    default:
      return '';
  }
}

/**
 * Saves current settings to localStorage
 */
function saveSettings() {
  try {
    const settings = {
      version: STORAGE_VERSION,
      plugboard: sanitizeInput(document.getElementById('plugboard').value, 'plugboard'),
      plugboardEnabled: !!document.getElementById('plugboard-enabled').checked,
      scramblers: [1, 2, 3].map(i => ({
        wiring: sanitizeInput(document.getElementById(`wiring${i}`).value, 'wiring'),
        position: sanitizeInput(document.getElementById(`position${i}`).value, 'position'),
        enabled: !!document.getElementById(`scrambler${i}-enabled`).checked
      })),
      reflector: sanitizeInput(document.getElementById('reflector').value, 'wiring'),
      reflectorEnabled: !!document.getElementById('reflector-enabled').checked,
      mode: document.querySelector('input[name="mode"]:checked')?.value === 'decrypt' ? 'decrypt' : 'encrypt'
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

/**
 * Resets all settings to default values
 */
function resetSettings() {
  // Clear localStorage
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear localStorage:', e);
  }

  // Reset form to defaults
  document.getElementById('plugboard').value = '';
  document.getElementById('plugboard-enabled').checked = false;

  for (let i = 1; i <= 3; i++) {
    document.getElementById(`wiring${i}`).value = '';
    document.getElementById(`position${i}`).value = 'A';
    // Scrambler 1 is ON by default, 2 and 3 are OFF
    document.getElementById(`scrambler${i}-enabled`).checked = (i === 1);
    // Reset preset selector
    const preset = document.getElementById(`preset${i}`);
    if (preset) preset.selectedIndex = 0;
  }

  document.getElementById('reflector').value = 'YRUHQSLDPXNGOKMIEBFZCWVJAT';
  document.getElementById('reflector-enabled').checked = true;
  const presetReflector = document.getElementById('preset-reflector');
  if (presetReflector) presetReflector.selectedIndex = 1; // Reflector B

  document.querySelector('input[name="mode"][value="encrypt"]').checked = true;

  // Clear input/output
  document.getElementById('input-text').value = '';
  document.getElementById('output-text').value = '';
  document.getElementById('log-output').textContent = '';

  // Clear errors
  clearValidationErrors();
  const errorArea = document.getElementById('error-messages');
  if (errorArea) {
    errorArea.textContent = '';
    errorArea.hidden = true;
  }

  // Update toggle states
  ['plugboard-enabled', 'scrambler1-enabled', 'scrambler2-enabled', 'scrambler3-enabled', 'reflector-enabled'].forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) updateToggleState(checkbox);
  });

  // Clear URL parameters
  if (window.history.replaceState) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

/**
 * Loads settings from localStorage with validation
 */
function loadSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    const settings = JSON.parse(stored);

    // Version check
    if (settings.version !== STORAGE_VERSION) return;

    // Apply settings with sanitization
    if (settings.plugboard !== undefined) {
      document.getElementById('plugboard').value = sanitizeInput(settings.plugboard, 'plugboard');
    }
    if (typeof settings.plugboardEnabled === 'boolean') {
      document.getElementById('plugboard-enabled').checked = settings.plugboardEnabled;
    }

    if (Array.isArray(settings.scramblers)) {
      settings.scramblers.forEach((s, i) => {
        const idx = i + 1;
        if (s.wiring !== undefined) {
          document.getElementById(`wiring${idx}`).value = sanitizeInput(s.wiring, 'wiring');
        }
        if (s.position !== undefined) {
          document.getElementById(`position${idx}`).value = sanitizeInput(s.position, 'position');
        }
        if (typeof s.enabled === 'boolean') {
          document.getElementById(`scrambler${idx}-enabled`).checked = s.enabled;
        }
      });
    }

    if (settings.reflector !== undefined) {
      document.getElementById('reflector').value = sanitizeInput(settings.reflector, 'wiring');
    }
    if (typeof settings.reflectorEnabled === 'boolean') {
      document.getElementById('reflector-enabled').checked = settings.reflectorEnabled;
    }

    if (settings.mode === 'decrypt' || settings.mode === 'encrypt') {
      const radio = document.querySelector(`input[name="mode"][value="${settings.mode}"]`);
      if (radio) radio.checked = true;
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
}

// =================================
// URL Sharing Module (with security)
// =================================

/**
 * Encodes current settings to URL parameters
 * @returns {string} URL with encoded settings
 */
function generateShareURL() {
  const params = new URLSearchParams();

  // Only encode non-default values to keep URL short
  const plugboard = document.getElementById('plugboard').value.trim();
  if (plugboard) {
    params.set('pb', sanitizeInput(plugboard, 'plugboard'));
  }

  if (!document.getElementById('plugboard-enabled').checked) {
    params.set('pbe', '0');
  }

  for (let i = 1; i <= 3; i++) {
    const wiring = document.getElementById(`wiring${i}`).value.trim();
    const position = document.getElementById(`position${i}`).value.trim();
    const enabled = document.getElementById(`scrambler${i}-enabled`).checked;

    if (wiring) {
      params.set(`s${i}`, sanitizeInput(wiring, 'wiring'));
    }
    if (position && position !== 'A') {
      params.set(`p${i}`, sanitizeInput(position, 'position'));
    }
    if (!enabled) {
      params.set(`e${i}`, '0');
    }
  }

  const reflector = document.getElementById('reflector').value.trim();
  const defaultReflector = 'YRUHQSLDPXNGOKMIEBFZCWVJAT';
  if (reflector && reflector !== defaultReflector) {
    params.set('rf', sanitizeInput(reflector, 'wiring'));
  }

  if (!document.getElementById('reflector-enabled').checked) {
    params.set('rfe', '0');
  }

  if (document.querySelector('input[name="mode"]:checked')?.value === 'decrypt') {
    params.set('m', 'd');
  }

  const url = new URL(window.location.href.split('?')[0]);
  url.search = params.toString();
  return url.toString();
}

/**
 * Loads settings from URL parameters with validation
 */
function loadFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return false;

    // Plugboard
    if (params.has('pb')) {
      document.getElementById('plugboard').value = sanitizeInput(params.get('pb'), 'plugboard');
    }
    if (params.get('pbe') === '0') {
      document.getElementById('plugboard-enabled').checked = false;
    }

    // Scramblers
    for (let i = 1; i <= 3; i++) {
      if (params.has(`s${i}`)) {
        document.getElementById(`wiring${i}`).value = sanitizeInput(params.get(`s${i}`), 'wiring');
      }
      if (params.has(`p${i}`)) {
        document.getElementById(`position${i}`).value = sanitizeInput(params.get(`p${i}`), 'position');
      }
      if (params.get(`e${i}`) === '0') {
        document.getElementById(`scrambler${i}-enabled`).checked = false;
      }
    }

    // Reflector
    if (params.has('rf')) {
      document.getElementById('reflector').value = sanitizeInput(params.get('rf'), 'wiring');
    }
    if (params.get('rfe') === '0') {
      document.getElementById('reflector-enabled').checked = false;
    }

    // Mode
    if (params.get('m') === 'd') {
      const radio = document.querySelector('input[name="mode"][value="decrypt"]');
      if (radio) radio.checked = true;
    }

    return true;
  } catch (e) {
    console.warn('Failed to load from URL:', e);
    return false;
  }
}

/**
 * Copies share URL to clipboard
 */
function copyShareURL() {
  const url = generateShareURL();
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('share-btn');
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = 'コピー完了';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 1500);
    }
  }).catch(() => {
    alert('URLのコピーに失敗しました');
  });
}

// =================================
// Validation Module
// =================================

/**
 * Validates a wiring string
 * @param {string} wiring - Wiring string to validate
 * @returns {{valid: boolean, error: string|null}} Validation result
 */
function validateWiring(wiring) {
  if (!wiring || wiring.trim() === '') {
    return { valid: true, error: null }; // Empty is allowed (will be skipped)
  }

  const normalized = wiring.toUpperCase().trim();

  if (normalized.length !== 26) {
    return { valid: false, error: `26文字必要です（現在${normalized.length}文字）` };
  }

  // Check for non-alphabetic characters
  if (!/^[A-Z]+$/.test(normalized)) {
    return { valid: false, error: 'A-Zのアルファベットのみ使用できます' };
  }

  // Check for duplicates
  const seen = new Set();
  for (const char of normalized) {
    if (seen.has(char)) {
      return { valid: false, error: `文字 "${char}" が重複しています` };
    }
    seen.add(char);
  }

  return { valid: true, error: null };
}

/**
 * Validates all settings and returns errors
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateAllSettings() {
  const errors = [];

  // Validate scramblers
  for (let i = 1; i <= 3; i++) {
    const enabled = document.getElementById(`scrambler${i}-enabled`).checked;
    if (!enabled) continue;

    const wiring = document.getElementById(`wiring${i}`).value;
    const result = validateWiring(wiring);
    if (!result.valid) {
      errors.push(`Scrambler ${i}: ${result.error}`);
      document.getElementById(`wiring${i}`).classList.add('input-error');
    } else {
      document.getElementById(`wiring${i}`).classList.remove('input-error');
    }
  }

  // Validate reflector
  const reflectorEnabled = document.getElementById('reflector-enabled').checked;
  if (reflectorEnabled) {
    const reflector = document.getElementById('reflector').value;
    const result = validateWiring(reflector);
    if (!result.valid) {
      errors.push(`Reflector: ${result.error}`);
      document.getElementById('reflector').classList.add('input-error');
    } else {
      document.getElementById('reflector').classList.remove('input-error');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Clears all validation error styles
 */
function clearValidationErrors() {
  document.querySelectorAll('.input-error').forEach(el => {
    el.classList.remove('input-error');
  });
}

// =================================
// Plugboard Module
// =================================

/**
 * Parses plugboard string into bidirectional map
 * @param {string} str - e.g., "A-B, S-Z, U-Y"
 * @returns {Map<string, string>} Substitution map
 */
function parsePlugboard(str) {
  const map = new Map();
  if (!str || !str.trim()) return map;

  // Split by comma or space
  const pairs = str.toUpperCase().split(/[,\s]+/).filter(Boolean);

  for (const pair of pairs) {
    const match = pair.match(/^([A-Z])-([A-Z])$/);
    if (match && match[1] !== match[2]) {
      const [, a, b] = match;
      // Skip if already mapped
      if (!map.has(a) && !map.has(b)) {
        map.set(a, b);
        map.set(b, a); // Bidirectional
      }
    }
  }
  return map;
}

/**
 * Applies plugboard substitution
 * @param {string} char - Single uppercase letter
 * @param {Map} map - Plugboard map
 * @returns {string} Substituted character
 */
function applyPlugboard(char, map) {
  return map.get(char) || char;
}

// =================================
// Scrambler Module
// =================================

/**
 * Creates a scrambler object
 * @param {string} wiring - 26-char permutation string
 * @param {string} position - Starting position (A-Z)
 * @returns {Object|null} Scrambler object or null if disabled
 */
function createScrambler(wiring, position) {
  if (!wiring || wiring.length !== 26) return null;

  const normalizedWiring = wiring.toUpperCase();
  // Validate wiring contains all 26 letters
  const sortedWiring = normalizedWiring.split('').sort().join('');
  if (sortedWiring !== ALPHABET) return null;

  const pos = ALPHABET.indexOf((position || 'A').toUpperCase());
  if (pos === -1) return null;

  // Pre-rotate wiring if starting position is not A
  const initialWiring = pos === 0 ? normalizedWiring : rotateWiringLeft(normalizedWiring, pos);

  return {
    baseWiring: normalizedWiring,
    wiring: initialWiring,
    position: pos // 0-25
  };
}

/**
 * Rotates wiring string by shifting left
 * @param {string} wiring - 26-char wiring string
 * @param {number} amount - Number of positions to shift left
 * @returns {string} Rotated wiring
 */
function rotateWiringLeft(wiring, amount) {
  const n = ((amount % 26) + 26) % 26;
  return wiring.slice(n) + wiring.slice(0, n);
}

/**
 * Computes the inverse wiring (for reverse pass)
 * @param {string} wiring - 26-char wiring string
 * @returns {string} Inverse wiring
 */
function computeInverseWiring(wiring) {
  const inverse = new Array(26);
  for (let i = 0; i < 26; i++) {
    const letterIndex = ALPHABET.indexOf(wiring[i]);
    inverse[letterIndex] = ALPHABET[i];
  }
  return inverse.join('');
}

/**
 * Rotates scrambler by 1 position
 * Updates both position counter and the actual wiring
 * @param {Object} scrambler - Scrambler object
 * @param {number} direction - +1 (encrypt/left shift) or -1 (decrypt/right shift)
 */
function rotateScrambler(scrambler, direction) {
  scrambler.position = (scrambler.position + direction + 26) % 26;
  // Update wiring by rotating from base
  // direction +1 means shift left, -1 means shift right
  if (direction === 1) {
    scrambler.wiring = rotateWiringLeft(scrambler.baseWiring, scrambler.position);
  } else {
    // For decrypt, shift right (equivalent to shift left by 26-position)
    scrambler.wiring = rotateWiringLeft(scrambler.baseWiring, scrambler.position);
  }
}

/**
 * Forward pass through scrambler (input -> wiring -> output)
 * Signal enters at keyboard position, goes through wiring, exits at lamp position
 * Algorithm: Apply position shift to input, lookup in BASE wiring, remove position shift from output
 * @param {string} char - Input character
 * @param {Object} scrambler - Scrambler object
 * @param {Array} logDetails - Optional array to collect detailed log
 * @returns {string} Output character
 */
function forwardPass(char, scrambler, logDetails) {
  const inputIndex = ALPHABET.indexOf(char);
  const pos = scrambler.position;

  // Shift input by position (rotor has rotated, so contact alignment changes)
  const entryContact = (inputIndex + pos) % 26;

  // Look up in base wiring to find output contact on rotor
  const wiringOutput = scrambler.baseWiring[entryContact];
  const rotorOutputContact = ALPHABET.indexOf(wiringOutput);

  // Shift output back (undo rotation for exit position)
  const exitIndex = (rotorOutputContact - pos + 26) % 26;
  const output = ALPHABET[exitIndex];

  if (logDetails) {
    logDetails.push({
      type: 'forward',
      input: char,
      inputIndex,
      entryContact,
      wiringOutput,
      rotorOutputContact,
      exitIndex,
      output,
      position: pos
    });
  }

  return output;
}

/**
 * Reverse pass through scrambler (output -> wiring -> input)
 * Signal enters from reflector side, traces back through wiring
 * Algorithm: Apply position shift to input, find in BASE wiring, remove position shift from output
 * @param {string} char - Input character
 * @param {Object} scrambler - Scrambler object
 * @param {Array} logDetails - Optional array to collect detailed log
 * @returns {string} Output character
 */
function reversePass(char, scrambler, logDetails) {
  const inputIndex = ALPHABET.indexOf(char);
  const pos = scrambler.position;

  // Shift input by position (signal enters rotor which has rotated)
  const entryContact = (inputIndex + pos) % 26;

  // Find where this character appears in wiring (trace wire backwards)
  const searchChar = ALPHABET[entryContact];
  const wiringIndex = scrambler.baseWiring.indexOf(searchChar);

  // Shift output back
  const exitIndex = (wiringIndex - pos + 26) % 26;
  const output = ALPHABET[exitIndex];

  if (logDetails) {
    logDetails.push({
      type: 'reverse',
      input: char,
      inputIndex,
      entryContact,
      searchChar,
      wiringIndex,
      exitIndex,
      output,
      position: pos
    });
  }

  return output;
}

/**
 * Simple forward pass - direct lookup in rotated wiring
 * Used for the simplified algorithm mode
 * @param {string} char - Input character
 * @param {Object} scrambler - Scrambler object
 * @param {Array} logDetails - Optional array to collect detailed log
 * @returns {string} Output character
 */
function simpleForwardPass(char, scrambler, logDetails) {
  const inputIndex = ALPHABET.indexOf(char);

  // Direct lookup in rotated wiring
  const output = scrambler.wiring[inputIndex];
  const outputIndex = ALPHABET.indexOf(output);

  if (logDetails) {
    logDetails.push({
      type: 'simple-forward',
      input: char,
      inputIndex,
      output,
      outputIndex,
      position: scrambler.position,
      wiring: scrambler.wiring
    });
  }

  return output;
}

/**
 * Simple reverse pass - find character in rotated wiring
 * Used for the simplified algorithm mode
 * @param {string} char - Input character
 * @param {Object} scrambler - Scrambler object
 * @param {Array} logDetails - Optional array to collect detailed log
 * @returns {string} Output character
 */
function simpleReversePass(char, scrambler, logDetails) {
  const wiringIndex = scrambler.wiring.indexOf(char);
  const output = ALPHABET[wiringIndex];

  if (logDetails) {
    logDetails.push({
      type: 'simple-reverse',
      input: char,
      wiringIndex,
      output,
      position: scrambler.position,
      wiring: scrambler.wiring
    });
  }

  return output;
}

// =================================
// Reflector Module
// =================================

/**
 * Applies reflector substitution
 * @param {string} char - Input character
 * @param {string} wiring - 26-char reflector wiring
 * @returns {string} Reflected character
 */
function applyReflector(char, wiring) {
  const index = ALPHABET.indexOf(char);
  return wiring[index] || char;
}

// =================================
// Rotation Logic
// =================================

/**
 * Rotates active scramblers with cascading
 * Every character: front rotor rotates
 * Every 26 rotations of rotor N: rotor N+1 rotates once
 * @param {Object[]} scramblers - Array of scrambler objects
 * @param {number} direction - +1 (encrypt) or -1 (decrypt)
 */
function rotateActiveScramblers(scramblers, direction) {
  if (scramblers.length === 0) return;

  // Track positions before rotation for cascade detection
  const prevPositions = scramblers.map(s => s.position);

  // Always rotate first rotor
  rotateScrambler(scramblers[0], direction);

  // Check for cascade
  for (let i = 0; i < scramblers.length - 1; i++) {
    const shouldCascade = direction === 1
      ? (prevPositions[i] === 25 && scramblers[i].position === 0)
      : (prevPositions[i] === 0 && scramblers[i].position === 25);

    if (shouldCascade) {
      const prevPos = scramblers[i + 1].position;
      rotateScrambler(scramblers[i + 1], direction);
      // Update for next cascade check
      prevPositions[i + 1] = prevPos;
    } else {
      break; // No cascade, stop checking
    }
  }
}

// =================================
// Cipher Engine
// =================================

/**
 * Initializes cipher state from settings
 * @param {Object} settings - UI settings
 * @returns {Object} Cipher state
 */
function initializeState(settings) {
  const scramblers = [];

  for (let i = 0; i < 3; i++) {
    // Skip if disabled by toggle
    if (!settings.scramblers[i].enabled) continue;

    const scrambler = createScrambler(
      settings.scramblers[i].wiring,
      settings.scramblers[i].position
    );
    if (scrambler) {
      scramblers.push(scrambler);
    }
  }

  // Parse plugboard only if enabled
  const plugboardMap = settings.plugboardEnabled
    ? parsePlugboard(settings.plugboard)
    : new Map();

  // Use reflector only if enabled
  const reflector = settings.reflectorEnabled
    ? (settings.reflector.toUpperCase() || 'YRUHQSLDPXNGOKMIEBFZCWVJAT')
    : null;

  // Note: In Enigma, both encrypt and decrypt use the same rotation direction
  // The puzzle page shows left rotation (position increases) for both modes
  return {
    scramblers,
    plugboardMap,
    reflector,
    reflectorEnabled: settings.reflectorEnabled,
    direction: 1  // Always left rotation (position increases A→B→C)
  };
}

/**
 * Generates a visual representation of scrambler state
 * @param {Object} scrambler - Scrambler object
 * @param {number} index - Scrambler index (0-based)
 * @returns {string} Visual representation
 */
function formatScramblerState(scrambler, index) {
  const pos = scrambler.position;
  const posChar = ALPHABET[pos];
  // Show portion of wiring around current position
  const start = pos;
  const visibleWiring = scrambler.wiring.substring(start, start + 5) +
    (start + 5 < 26 ? '...' : '');
  return `R${index + 1}[${posChar}]: ${visibleWiring}`;
}

/**
 * Processes a single character through the enigma
 * @param {string} char - Input character (uppercase A-Z)
 * @param {Object} state - Current machine state (scramblers are mutated)
 * @param {Array} logEntries - Array to push log entry
 * @returns {string} Output character
 */
/**
 * Creates arrow indicator string for visual log
 * @param {number} downPos - Position for down arrow (-1 to skip)
 * @param {number} upPos - Position for up arrow (-1 to skip)
 * @returns {string} Arrow indicator line
 */
function createArrowLine(downPos, upPos) {
  const chars = new Array(26).fill(' ');
  if (downPos >= 0 && downPos < 26) chars[downPos] = '↓';
  if (upPos >= 0 && upPos < 26) chars[upPos] = '↑';
  return chars.join('');
}

/**
 * Creates shifted alphabet string
 * @param {number} shift - Amount to shift left
 * @returns {string} Shifted alphabet
 */
function shiftAlphabet(shift) {
  const n = ((shift % 26) + 26) % 26;
  return ALPHABET.slice(n) + ALPHABET.slice(0, n);
}

/**
 * Processes a single scrambler forward pass
 * @param {number} inputPos - Input position (0-25)
 * @param {Object} scrambler - Scrambler object
 * @returns {number} Output position (0-25)
 */
function scramblerForward(inputPos, scrambler) {
  const shiftedAlpha = shiftAlphabet(scrambler.position);
  const shiftedAlphaChar = shiftedAlpha[inputPos];
  return scrambler.wiring.indexOf(shiftedAlphaChar);
}

/**
 * Processes a single scrambler reverse pass
 * @param {number} inputPos - Input position (0-25)
 * @param {Object} scrambler - Scrambler object
 * @returns {number} Output position (0-25)
 */
function scramblerReverse(inputPos, scrambler) {
  const shiftedAlpha = shiftAlphabet(scrambler.position);
  const shiftedWiringChar = scrambler.wiring[inputPos];
  return shiftedAlpha.indexOf(shiftedWiringChar);
}

function processChar(char, state, logEntries) {
  const { scramblers, plugboardMap, reflector, reflectorEnabled, direction } = state;

  // 1. Rotate scramblers (before processing)
  rotateActiveScramblers(scramblers, direction);

  const logLines = [];
  let current = char;

  // Apply plugboard input
  const afterPlug1 = applyPlugboard(char, plugboardMap);
  if (afterPlug1 !== char) {
    current = afterPlug1;
  }

  const inputPos = ALPHABET.indexOf(current);
  let currentPos = inputPos;

  // Track positions for logging
  const forwardPositions = [currentPos];
  const reversePositions = [];

  // Forward pass through all scramblers (1 → 2 → 3)
  for (const s of scramblers) {
    currentPos = scramblerForward(currentPos, s);
    forwardPositions.push(currentPos);
  }

  const reflectorInputPos = currentPos;
  let reflectorOutputPos = currentPos;

  // Reflector
  if (reflectorEnabled && reflector) {
    const refOutput = reflector[reflectorInputPos];
    reflectorOutputPos = ALPHABET.indexOf(refOutput);
    currentPos = reflectorOutputPos;
  }

  reversePositions.push(currentPos);

  // Reverse pass through all scramblers (3 → 2 → 1)
  for (let i = scramblers.length - 1; i >= 0; i--) {
    currentPos = scramblerReverse(currentPos, scramblers[i]);
    reversePositions.push(currentPos);
  }

  current = ALPHABET[currentPos];

  // Apply plugboard output
  current = applyPlugboard(current, plugboardMap);
  const finalOutputPos = ALPHABET.indexOf(current);

  // Build visual log
  logLines.push('────────────────────────────────────────────────────────');
  logLines.push(`【文字 ${char} の処理】`);
  logLines.push('');

  // Input/Output line with arrows
  logLines.push(ALPHABET + '　←入力・出力');
  logLines.push(createArrowLine(inputPos, finalOutputPos));

  // Scrambler display (forward direction)
  for (let i = 0; i < scramblers.length; i++) {
    const s = scramblers[i];
    const pos = s.position;
    const fwdIn = forwardPositions[i];
    const fwdOut = forwardPositions[i + 1];
    const revIn = reversePositions[scramblers.length - 1 - i];
    const revOut = reversePositions[scramblers.length - i];

    logLines.push(createArrowLine(fwdIn, revOut));
    logLines.push(shiftAlphabet(pos));
    logLines.push(s.wiring + `　←スクランブラー${i + 1}（左に${pos}文字分シフト済）`);
    logLines.push(createArrowLine(fwdOut, revIn));
  }

  // Reflector display
  if (reflectorEnabled && reflector) {
    logLines.push(ALPHABET);
    logLines.push(reflector + '　←リフレクター（固定）');
  }

  logLines.push('');
  logLines.push(`結果: ${char} → ${current}`);

  logEntries.push(logLines.join('\n'));

  return current;
}

/**
 * Generates initial state log showing unshifted configuration
 * @param {Object} state - Cipher state
 * @returns {string} Initial state log
 */
function generateInitialStateLog(state) {
  const { scramblers, reflector, reflectorEnabled } = state;
  const lines = [];

  lines.push('【初期状態】');
  lines.push('');
  lines.push(ALPHABET + '　←入力・出力');
  lines.push('');

  // Show each scrambler in initial (unshifted) state
  for (let i = 0; i < scramblers.length; i++) {
    const s = scramblers[i];
    lines.push(ALPHABET);
    lines.push(s.baseWiring + `　←スクランブラー${i + 1}（一致する文字が配線される）`);
    lines.push('');
  }

  // Show reflector
  if (reflectorEnabled && reflector) {
    lines.push(ALPHABET);
    lines.push(reflector + '　←リフレクター（一致する文字が配線されている）');
  }

  lines.push('');
  lines.push('════════════════════════════════════════════════════════');
  lines.push('【処理開始】');

  return lines.join('\n');
}

/**
 * Processes entire text through the enigma
 * @param {string} text - Input text
 * @param {Object} settings - UI settings
 * @returns {{output: string, log: string[]}} Result
 */
function processText(text, settings) {
  const state = initializeState(settings);
  const output = [];
  const logEntries = [];

  // Check if we have any active components
  const hasActiveComponents = state.scramblers.length > 0 ||
    state.plugboardMap.size > 0 ||
    state.reflectorEnabled;

  if (!hasActiveComponents) {
    return {
      output: text.toUpperCase(),
      log: '(有効なコンポーネントがありません)'
    };
  }

  // Add initial state log
  logEntries.push(generateInitialStateLog(state));

  for (const char of text.toUpperCase()) {
    if (/[A-Z]/.test(char)) {
      output.push(processChar(char, state, logEntries));
    } else {
      // Non-alphabetic passes through unchanged
      output.push(char);
    }
  }

  return { output: output.join(''), log: logEntries.join('\n\n') };
}

// =================================
// UI Controller
// =================================

/**
 * Reads all settings from the UI
 * @returns {Object} Settings object
 */
function getSettings() {
  return {
    plugboard: document.getElementById('plugboard').value,
    plugboardEnabled: document.getElementById('plugboard-enabled').checked,
    scramblers: [
      {
        wiring: document.getElementById('wiring1').value,
        position: document.getElementById('position1').value,
        enabled: document.getElementById('scrambler1-enabled').checked
      },
      {
        wiring: document.getElementById('wiring2').value,
        position: document.getElementById('position2').value,
        enabled: document.getElementById('scrambler2-enabled').checked
      },
      {
        wiring: document.getElementById('wiring3').value,
        position: document.getElementById('position3').value,
        enabled: document.getElementById('scrambler3-enabled').checked
      }
    ],
    reflector: document.getElementById('reflector').value,
    reflectorEnabled: document.getElementById('reflector-enabled').checked,
    mode: document.querySelector('input[name="mode"]:checked').value
  };
}

/**
 * Updates output and log display
 */
function updateOutput() {
  // Validate settings first
  const validation = validateAllSettings();
  const errorArea = document.getElementById('error-messages');

  if (!validation.valid) {
    if (errorArea) {
      errorArea.textContent = validation.errors.join('\n');
      errorArea.hidden = false;
    }
    return;
  }

  // Clear errors
  if (errorArea) {
    errorArea.textContent = '';
    errorArea.hidden = true;
  }

  const settings = getSettings();
  const inputText = document.getElementById('input-text').value;

  const { output, log } = processText(inputText, settings);

  document.getElementById('output-text').value = output;
  document.getElementById('log-output').textContent = log;
}

/**
 * Updates the visual disabled state of a toggleable fieldset
 * @param {HTMLInputElement} checkbox - The toggle checkbox
 */
function updateToggleState(checkbox) {
  const fieldset = checkbox.closest('.toggleable');
  if (fieldset) {
    fieldset.classList.toggle('disabled', !checkbox.checked);
  }
}

/**
 * Opens the help modal
 */
function openHelpModal() {
  const modal = document.getElementById('help-modal');
  if (modal) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Closes the help modal
 */
function closeHelpModal() {
  const modal = document.getElementById('help-modal');
  if (modal) {
    modal.hidden = true;
    document.body.style.overflow = '';
  }
}

/**
 * Copies text to clipboard and shows feedback
 * @param {HTMLButtonElement} btn - Copy button element
 */
function handleCopy(btn) {
  const targetId = btn.dataset.target;
  const targetElement = document.getElementById(targetId);
  if (!targetElement) return;

  // Get text content (textarea.value or pre.textContent)
  const text = targetElement.value !== undefined
    ? targetElement.value
    : targetElement.textContent;

  navigator.clipboard.writeText(text).then(() => {
    // Show copied feedback
    const originalText = btn.textContent;
    btn.textContent = 'コピー完了';
    btn.classList.add('copied');

    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {
    // Fallback for older browsers
    btn.textContent = 'コピー失敗';
    setTimeout(() => {
      btn.textContent = 'コピー';
    }, 1500);
  });
}

/**
 * Populates preset dropdowns with options
 */
function populatePresets() {
  // Populate scrambler presets
  document.querySelectorAll('.preset-select').forEach(select => {
    const isReflector = select.dataset.type === 'reflector';
    const presets = isReflector ? PRESET_WIRINGS.reflector : PRESET_WIRINGS.scrambler;

    presets.forEach((preset, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = preset.name;
      select.appendChild(option);
    });
  });
}

/**
 * Handles preset selection change
 * @param {HTMLSelectElement} select - The preset select element
 */
function handlePresetChange(select) {
  const targetId = select.dataset.target;
  const targetInput = document.getElementById(targetId);
  if (!targetInput) return;

  const isReflector = select.dataset.type === 'reflector';
  const presets = isReflector ? PRESET_WIRINGS.reflector : PRESET_WIRINGS.scrambler;
  const selectedIndex = parseInt(select.value, 10);
  const preset = presets[selectedIndex];

  if (preset && preset.wiring) {
    targetInput.value = preset.wiring;
    targetInput.classList.remove('input-error');
  }
  // If "カスタム" is selected (empty wiring), don't change the input
}

/**
 * Switches to the specified tab
 * @param {string} tabId - Tab identifier (e.g., 'cipher', 'analysis')
 */
function switchTab(tabId) {
  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
}

/**
 * Binds event listeners
 */
function bindEvents() {
  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Process button - main trigger for processing
  const processBtn = document.getElementById('process-btn');
  if (processBtn) {
    processBtn.addEventListener('click', updateOutput);
  }

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => handleCopy(btn));
  });

  // Preset selectors
  document.querySelectorAll('.preset-select').forEach(select => {
    select.addEventListener('change', () => handlePresetChange(select));
  });

  // Share button
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', copyShareURL);
  }

  // Reset button with custom confirm modal
  const resetBtn = document.getElementById('reset-btn');
  const confirmModal = document.getElementById('confirm-modal');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');

  if (resetBtn && confirmModal) {
    // Open confirm modal
    resetBtn.addEventListener('click', () => {
      confirmModal.hidden = false;
      document.body.style.overflow = 'hidden';
    });

    // Close on cancel
    confirmCancel.addEventListener('click', () => {
      confirmModal.hidden = true;
      document.body.style.overflow = '';
    });

    // Execute reset on confirm
    confirmOk.addEventListener('click', () => {
      confirmModal.hidden = true;
      document.body.style.overflow = '';
      resetSettings();
    });

    // Close on overlay click
    const confirmOverlay = confirmModal.querySelector('.modal-overlay');
    if (confirmOverlay) {
      confirmOverlay.addEventListener('click', () => {
        confirmModal.hidden = true;
        document.body.style.overflow = '';
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !confirmModal.hidden) {
        confirmModal.hidden = true;
        document.body.style.overflow = '';
      }
    });
  }

  // Help modal
  const helpBtn = document.getElementById('help-btn');
  const helpModal = document.getElementById('help-modal');

  if (helpBtn) {
    helpBtn.addEventListener('click', openHelpModal);
  }

  if (helpModal) {
    // Close on overlay click
    const overlay = helpModal.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeHelpModal);
    }

    // Close on close button click
    const closeBtn = helpModal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeHelpModal);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !helpModal.hidden) {
        closeHelpModal();
      }
    });
  }

  // Toggle checkboxes - update visual state only
  const toggleCheckboxes = [
    'plugboard-enabled',
    'scrambler1-enabled',
    'scrambler2-enabled',
    'scrambler3-enabled',
    'reflector-enabled'
  ];

  toggleCheckboxes.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      // Initialize visual state
      updateToggleState(checkbox);

      // Bind change event - only update visual state
      checkbox.addEventListener('change', () => {
        updateToggleState(checkbox);
      });
    }
  });
}

/**
 * Debounce function for real-time processing
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Sets up auto-save on settings change
 */
function setupAutoSave() {
  const debouncedSave = debounce(saveSettings, 500);

  // Monitor all setting inputs
  const settingInputs = document.querySelectorAll(
    '#plugboard, #wiring1, #wiring2, #wiring3, #position1, #position2, #position3, #reflector'
  );
  settingInputs.forEach(input => {
    input.addEventListener('input', debouncedSave);
  });

  // Monitor checkboxes and radio buttons
  const checkboxes = document.querySelectorAll(
    '#plugboard-enabled, #scrambler1-enabled, #scrambler2-enabled, #scrambler3-enabled, #reflector-enabled, input[name="mode"]'
  );
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', debouncedSave);
  });
}

/**
 * Sets up real-time processing
 */
function setupRealtimeProcessing() {
  const inputText = document.getElementById('input-text');
  if (!inputText) return;

  const debouncedProcess = debounce(() => {
    // Only process if there's input text
    if (inputText.value.trim()) {
      updateOutput();
    }
  }, 300);

  inputText.addEventListener('input', debouncedProcess);
}

/**
 * Initializes the application
 */
function init() {
  populatePresets();

  // Load settings: URL params take priority over localStorage
  const loadedFromURL = loadFromURL();
  if (!loadedFromURL) {
    loadSettings();
  }

  bindEvents();
  setupAutoSave();
  setupRealtimeProcessing();

  // Update toggle states after loading settings
  const toggleCheckboxes = [
    'plugboard-enabled',
    'scrambler1-enabled',
    'scrambler2-enabled',
    'scrambler3-enabled',
    'reflector-enabled'
  ];
  toggleCheckboxes.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      updateToggleState(checkbox);
    }
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
