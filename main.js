/**
 * Cypher Enigma Simulator
 * Cypher パズル用 簡略エニグマシミュレーター
 */

const Core = globalThis.CypherEnigmaCore;
const Attack = globalThis.CypherEnigmaAttack;
const Messages = globalThis.CypherEnigmaMessages;
if (!Core || !Attack || !Messages) {
  throw new Error('Application dependencies are unavailable.');
}

const { ALPHABET, PRESET_WIRINGS } = Core;
const LANGUAGE_STORAGE_KEY = 'cypher-enigma-language';
let currentLanguage = 'ja';
let lastAttackResults = null;
let activeAttackSearch = null;
let debouncedSaveSettings = null;

function interpolate(template, variables = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
  ));
}

function t(key, variables = {}) {
  const dictionary = Messages[currentLanguage] || Messages.ja;
  return interpolate(dictionary[key] || Messages.ja[key] || key, variables);
}

function getStoredLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'ja';
  } catch (error) {
    return 'ja';
  }
}

function storeLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    // The language toggle still works if storage is unavailable.
  }
}

function applyStaticTranslations() {
  document.documentElement.lang = currentLanguage;
  document.title = t('documentTitle');
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });
}

function setLanguage(language, options = {}) {
  currentLanguage = language === 'en' ? 'en' : 'ja';
  applyStaticTranslations();
  populatePresets();
  populateAttackPresets();
  updateAttackSearchSpaceDisplay();
  if (document.getElementById('input-text')?.value) updateOutput();
  if (lastAttackResults) {
    displayAttackResults(lastAttackResults.summary, lastAttackResults.searchInfo, lastAttackResults.cancelled, false);
    displayNarrowingSummary(lastAttackResults.summary, lastAttackResults.cancelled);
    updateAttackProgress(lastAttackResults.summary, {
      complete: !lastAttackResults.cancelled,
      cancelled: lastAttackResults.cancelled
    });
  }
  if (activeAttackSearch) updateAttackProgress(Attack.getSearchSummary(activeAttackSearch.state));
  if (!document.getElementById('attack-ciphertext')?.value) generatePlaintextGrid('');
  if (pendingApplyPositions) {
    document.getElementById('apply-confirm-message').textContent = t('applyPositionsQuestion', { positions: pendingApplyPositions });
  }
  if (options.persist !== false) storeLanguage(currentLanguage);
}

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
        notch: sanitizeInput(document.getElementById(`notch${i}`)?.value || 'Z', 'position'),
        notchEnabled: document.getElementById(`notch${i}-enabled`)?.checked ?? true,
        enabled: !!document.getElementById(`scrambler${i}-enabled`).checked
      })),
      scramblerOrder: typeof getScramblerOrder === 'function' ? getScramblerOrder(false) : [1, 2, 3],
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
    // Reset notch to default (Z) and enabled
    const notchEl = document.getElementById(`notch${i}`);
    if (notchEl) notchEl.value = 'Z';
    const notchEnabledEl = document.getElementById(`notch${i}-enabled`);
    if (notchEnabledEl) notchEnabledEl.checked = true;
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

  // Reset scrambler order to default
  if (typeof setScramblerOrder === 'function') {
    setScramblerOrder([1, 2, 3], false);
    setScramblerOrder([1, 2, 3], true);
    reorderDOMFromState(false);
    reorderDOMFromState(true);
  }

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
        // Load notch (default to 'Z' if not set)
        const notchEl = document.getElementById(`notch${idx}`);
        if (notchEl) {
          notchEl.value = sanitizeInput(s.notch || 'Z', 'position');
        }
        // Load notch enabled state (default to true)
        const notchEnabledEl = document.getElementById(`notch${idx}-enabled`);
        if (notchEnabledEl) {
          notchEnabledEl.checked = s.notchEnabled !== false;
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

    // Load scrambler order
    if (Array.isArray(settings.scramblerOrder) &&
        settings.scramblerOrder.length === 3 &&
        settings.scramblerOrder.every(id => [1, 2, 3].includes(id)) &&
        new Set(settings.scramblerOrder).size === 3) {
      if (typeof setScramblerOrder === 'function') {
        setScramblerOrder(settings.scramblerOrder, false);
      }
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
    const notchEl = document.getElementById(`notch${i}`);
    const notch = notchEl ? notchEl.value.trim().toUpperCase() : 'Z';
    const enabled = document.getElementById(`scrambler${i}-enabled`).checked;

    if (wiring) {
      params.set(`s${i}`, sanitizeInput(wiring, 'wiring'));
    }
    if (position && position !== 'A') {
      params.set(`p${i}`, sanitizeInput(position, 'position'));
    }
    // Only include notch if not default (Z)
    if (notch && notch !== 'Z') {
      params.set(`n${i}`, sanitizeInput(notch, 'position'));
    }
    // Include notch enabled state (only if disabled, since default is enabled)
    const notchEnabledEl = document.getElementById(`notch${i}-enabled`);
    if (notchEnabledEl && !notchEnabledEl.checked) {
      params.set(`ne${i}`, '0');
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

  if (currentLanguage === 'en') {
    params.set('lang', 'en');
  }

  // Scrambler order (only if not default)
  if (typeof getScramblerOrder === 'function') {
    const order = getScramblerOrder(false);
    if (order.join('') !== '123') {
      params.set('so', order.join(''));
    }
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

    if (params.get('lang') === 'en') {
      currentLanguage = 'en';
    }

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
      // Load notch (n1, n2, n3)
      if (params.has(`n${i}`)) {
        const notchEl = document.getElementById(`notch${i}`);
        if (notchEl) {
          notchEl.value = sanitizeInput(params.get(`n${i}`), 'position');
        }
      }
      // Load notch enabled state (ne1, ne2, ne3)
      if (params.get(`ne${i}`) === '0') {
        const notchEnabledEl = document.getElementById(`notch${i}-enabled`);
        if (notchEnabledEl) {
          notchEnabledEl.checked = false;
        }
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

    // Scrambler order
    if (params.has('so')) {
      const orderStr = params.get('so');
      if (/^[123]{3}$/.test(orderStr)) {
        const order = orderStr.split('').map(Number);
        // Validate all unique
        if (new Set(order).size === 3 && typeof setScramblerOrder === 'function') {
          setScramblerOrder(order, false);
        }
      }
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
      btn.textContent = t('copyDone');
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('copied');
      }, 1500);
    }
  }).catch(() => {
    alert(t('shareCopyFailed'));
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
  const result = Core.validateWiring(wiring);
  return { ...result, error: result.valid ? null : validationMessage(result) };
}

function validationMessage(result) {
  const messageKeys = {
    required: 'wiringRequired',
    length: 'wiringLength',
    alphabet: 'wiringAlphabet',
    duplicate: 'wiringDuplicate',
    reflectorNotSelfInverse: 'reflectorNotSelfInverse',
    reflectorFixedPoint: 'reflectorFixedPoint'
  };
  return t(messageKeys[result.code] || result.code, result);
}

function validateReflectorWiring(wiring) {
  const result = Core.validateReflectorWiring(wiring);
  return { ...result, error: result.valid ? null : validationMessage(result) };
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
      errors.push(t('scramblerError', { number: i, message: result.error }));
      document.getElementById(`wiring${i}`).classList.add('input-error');
    } else {
      document.getElementById(`wiring${i}`).classList.remove('input-error');
    }
  }

  // Validate reflector
  const reflectorEnabled = document.getElementById('reflector-enabled').checked;
  if (reflectorEnabled) {
    const reflector = document.getElementById('reflector').value;
    const result = validateReflectorWiring(reflector);
    if (!result.valid) {
      errors.push(t('reflectorError', { message: result.error }));
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
function createScrambler(wiring, position, notch = 'Z', notchEnabled = true, originalId = null) {
  if (!wiring || wiring.length !== 26) return null;

  const normalizedWiring = wiring.toUpperCase();
  // Validate wiring contains all 26 letters
  const sortedWiring = normalizedWiring.split('').sort().join('');
  if (sortedWiring !== ALPHABET) return null;

  const pos = ALPHABET.indexOf((position || 'A').toUpperCase());
  if (pos === -1) return null;

  // Parse notch position (default to Z = 25)
  const notchPos = ALPHABET.indexOf((notch || 'Z').toUpperCase());
  const validNotch = notchPos !== -1 ? notchPos : 25;

  // Pre-rotate wiring if starting position is not A
  const initialWiring = pos === 0 ? normalizedWiring : rotateWiringLeft(normalizedWiring, pos);

  return {
    baseWiring: normalizedWiring,
    wiring: initialWiring,
    position: pos, // 0-25
    notch: validNotch, // 0-25 (default Z=25)
    notchEnabled: notchEnabled, // whether notch triggers cascade
    originalId: originalId // original scrambler number (1, 2, or 3)
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

  // Check for cascade based on notch position
  // When scrambler i passes its notch position, scrambler i+1 rotates
  // Notch only applies if the PREVIOUS scrambler has notchEnabled
  for (let i = 0; i < scramblers.length - 1; i++) {
    // Check if this scrambler's notch is enabled
    const notchEnabled = scramblers[i].notchEnabled !== false;

    if (!notchEnabled) {
      // Notch disabled: use classic 26-rotation cascade (position 25 = Z)
      const shouldCascade = direction === 1
        ? (prevPositions[i] === 25 && scramblers[i].position === 0)
        : (prevPositions[i] === 0 && scramblers[i].position === 25);

      if (shouldCascade) {
        const prevPos = scramblers[i + 1].position;
        rotateScrambler(scramblers[i + 1], direction);
        prevPositions[i + 1] = prevPos;
      } else {
        break;
      }
    } else {
      // Notch enabled: use configured notch position
      const notch = scramblers[i].notch !== undefined ? scramblers[i].notch : 25;
      const afterNotch = (notch + 1) % 26;

      const shouldCascade = direction === 1
        ? (prevPositions[i] === notch && scramblers[i].position === afterNotch)
        : (prevPositions[i] === afterNotch && scramblers[i].position === notch);

      if (shouldCascade) {
        const prevPos = scramblers[i + 1].position;
        rotateScrambler(scramblers[i + 1], direction);
        prevPositions[i + 1] = prevPos;
      } else {
        break;
      }
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
function legacyInitializeState(settings) {
  const scramblers = [];

  for (let i = 0; i < settings.scramblers.length; i++) {
    const s = settings.scramblers[i];
    // Skip if disabled by toggle
    if (!s.enabled) continue;

    const scrambler = createScrambler(
      s.wiring,
      s.position,
      s.notch || 'Z',
      s.notchEnabled !== false, // default to true
      s.id || (i + 1) // original scrambler ID
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

function initializeState(settings) {
  return Core.initializeState(settings);
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

function legacyProcessChar(char, state, logEntries) {
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
    const scramblerLabel = s.originalId || (i + 1);
    const pos = s.position;
    const fwdIn = forwardPositions[i];
    const fwdOut = forwardPositions[i + 1];
    const revIn = reversePositions[scramblers.length - 1 - i];
    const revOut = reversePositions[scramblers.length - i];

    logLines.push(createArrowLine(fwdIn, revOut));
    logLines.push(shiftAlphabet(pos));
    logLines.push(s.wiring + `　←スクランブラー${scramblerLabel}（左に${pos}文字分シフト済）`);
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

function processChar(char, state, logEntries) {
  return Core.processChar(char, state, logEntries, currentLanguage);
}

/**
 * Generates initial state log showing unshifted configuration
 * @param {Object} state - Cipher state
 * @returns {string} Initial state log
 */
function generateInitialStateLog(state) {
  const { scramblers, reflector, reflectorEnabled } = state;
  const lines = [];

  lines.push('【配線設定】');
  lines.push('');
  lines.push(ALPHABET + '　←入力・出力');
  lines.push('');

  // Show each scrambler in initial (unshifted) state
  for (let i = 0; i < scramblers.length; i++) {
    const s = scramblers[i];
    const scramblerLabel = s.originalId || (i + 1);
    const notchChar = ALPHABET[s.notch !== undefined ? s.notch : 25];
    const notchStatus = s.notchEnabled !== false ? `ノッチ: ${notchChar}` : 'ノッチ: OFF';
    lines.push(ALPHABET);
    lines.push(s.baseWiring + `　←スクランブラー${scramblerLabel}（${notchStatus}）`);
    lines.push('');
  }

  // Show reflector
  if (reflectorEnabled && reflector) {
    lines.push(ALPHABET);
    lines.push(reflector + '　←リフレクター（一致する文字が配線されている）');
  }

  lines.push('');
  lines.push('────────────────────────────────────────────────────────');

  // Show initial setup with starting positions applied
  lines.push('【初期設定】（開始位置を適用した状態）');
  lines.push('');
  lines.push(ALPHABET + '　←入力・出力');
  lines.push('');

  for (let i = 0; i < scramblers.length; i++) {
    const s = scramblers[i];
    const scramblerLabel = s.originalId || (i + 1);
    const posChar = ALPHABET[s.position];
    const notchChar = ALPHABET[s.notch !== undefined ? s.notch : 25];
    const notchStatus = s.notchEnabled !== false ? `ノッチ: ${notchChar}` : 'ノッチ: OFF';
    // Show shifted alphabet to indicate position
    const shiftedAlphabet = ALPHABET.slice(s.position) + ALPHABET.slice(0, s.position);
    lines.push(shiftedAlphabet + `　←シフト後（開始位置: ${posChar}、${notchStatus}）`);
    lines.push(s.wiring + `　←スクランブラー${scramblerLabel}`);
    lines.push('');
  }

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
function legacyProcessText(text, settings) {
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

function processText(text, settings) {
  return Core.processText(text, settings, { language: currentLanguage });
}

// =================================
// UI Controller
// =================================

/**
 * Reads all settings from the UI
 * @returns {Object} Settings object
 */
function getSettings() {
  // Get scramblers in current visual order
  const order = getScramblerOrder(false);
  return {
    plugboard: document.getElementById('plugboard').value,
    plugboardEnabled: document.getElementById('plugboard-enabled').checked,
    scramblers: order.map(id => ({
      id: id, // original scrambler ID (1, 2, or 3)
      wiring: document.getElementById(`wiring${id}`).value,
      position: document.getElementById(`position${id}`).value,
      notch: document.getElementById(`notch${id}`)?.value || 'Z',
      notchEnabled: document.getElementById(`notch${id}-enabled`)?.checked ?? true,
      enabled: document.getElementById(`scrambler${id}-enabled`).checked
    })),
    reflector: document.getElementById('reflector').value,
    reflectorEnabled: document.getElementById('reflector-enabled').checked,
    mode: document.querySelector('input[name="mode"]:checked').value,
    scramblerOrder: order
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
  try {
    const { output, log } = processText(inputText, settings);
    document.getElementById('output-text').value = output;
    document.getElementById('log-output').textContent = log;
  } catch (error) {
    if (error?.code === 'inputTooLong' && errorArea) {
      errorArea.textContent = t('inputTooLong', { max: Core.MAX_INPUT_LENGTH.toLocaleString(currentLanguage) });
      errorArea.hidden = false;
      return;
    }
    throw error;
  }
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
    btn.textContent = t('copyDone');
    btn.classList.add('copied');

    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {
    // Fallback for older browsers
    btn.textContent = t('copyFailed');
    setTimeout(() => {
      btn.textContent = t('copy');
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
    const selectedValue = select.value;
    select.innerHTML = '';

    presets.forEach((preset, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = t(preset.nameKey);
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === selectedValue)) {
      select.value = selectedValue;
    }
  });
}

function syncPresetSelections() {
  document.querySelectorAll('.preset-select').forEach((select) => {
    const isReflector = select.dataset.type === 'reflector';
    const presets = isReflector ? PRESET_WIRINGS.reflector : PRESET_WIRINGS.scrambler;
    const wiring = document.getElementById(select.dataset.target)?.value.trim().toUpperCase() || '';
    const matchingIndex = presets.findIndex((preset) => preset.wiring === wiring);
    select.value = String(matchingIndex >= 0 ? matchingIndex : 0);
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
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
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
  const languageToggle = document.getElementById('language-toggle');
  if (languageToggle) {
    languageToggle.addEventListener('click', () => {
      setLanguage(currentLanguage === 'ja' ? 'en' : 'ja');
    });
  }

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  const tabButtons = [...document.querySelectorAll('.tab-btn')];
  tabButtons.forEach((button, index) => {
    button.addEventListener('keydown', (event) => {
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabButtons.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabButtons.length - 1;
      else return;
      event.preventDefault();
      switchTab(tabButtons[nextIndex].dataset.tab);
      tabButtons[nextIndex].focus();
    });
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
  debouncedSaveSettings = debounce(saveSettings, 500);
  const debouncedRender = debounce(() => {
    if (document.getElementById('input-text')?.value) updateOutput();
  }, 300);
  const handleSettingMutation = () => {
    debouncedSaveSettings();
    debouncedRender();
  };

  // Monitor all setting inputs
  const settingInputs = document.querySelectorAll(
    '#plugboard, #wiring1, #wiring2, #wiring3, #position1, #position2, #position3, #notch1, #notch2, #notch3, #reflector'
  );
  settingInputs.forEach(input => {
    input.addEventListener('input', handleSettingMutation);
  });

  // Monitor checkboxes and radio buttons
  const checkboxes = document.querySelectorAll(
    '#plugboard-enabled, #scrambler1-enabled, #scrambler2-enabled, #scrambler3-enabled, #notch1-enabled, #notch2-enabled, #notch3-enabled, #reflector-enabled, input[name="mode"]'
  );
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleSettingMutation);
  });
}

// =================================
// Drag-and-Drop Reorder Module
// =================================

// Scrambler order state
let scramblerOrder = [1, 2, 3];
let attackScramblerOrder = [1, 2, 3];

// Drag state
let dragState = {
  isDragging: false,
  draggedElement: null,
  draggedId: null,
  startX: 0,
  startY: 0,
  ghost: null,
  container: null,
  isAttackTab: false
};

/**
 * Gets current scrambler order
 * @param {boolean} isAttackTab - Whether this is the attack tab
 * @returns {number[]} Array of scrambler IDs in current order
 */
function getScramblerOrder(isAttackTab) {
  return isAttackTab ? [...attackScramblerOrder] : [...scramblerOrder];
}

/**
 * Sets scrambler order
 * @param {number[]} order - New order array
 * @param {boolean} isAttackTab - Whether this is the attack tab
 */
function setScramblerOrder(order, isAttackTab) {
  if (isAttackTab) {
    attackScramblerOrder = [...order];
  } else {
    scramblerOrder = [...order];
  }
}

/**
 * Initializes drag-and-drop for a container
 * @param {HTMLElement} container - The container element
 * @param {boolean} isAttackTab - Whether this is the attack tab
 */
function initDragAndDrop(container, isAttackTab) {
  const selector = isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const items = container.querySelectorAll(selector);

  items.forEach(item => {
    const handle = item.querySelector('.drag-handle');
    if (!handle) return;

    // Mouse events
    handle.addEventListener('mousedown', (e) => startDrag(e, item, container, isAttackTab));

    // Touch events
    handle.addEventListener('touchstart', (e) => startTouchDrag(e, item, container, isAttackTab), { passive: false });

    // Keyboard accessibility
    handle.addEventListener('keydown', (e) => handleKeyboardReorder(e, item, container, isAttackTab));
  });
}

/**
 * Starts mouse drag operation
 */
function startDrag(e, item, container, isAttackTab) {
  e.preventDefault();

  const idAttr = isAttackTab ? 'attackScramblerId' : 'scramblerId';
  const id = parseInt(item.dataset[idAttr]);

  dragState = {
    isDragging: true,
    draggedElement: item,
    draggedId: id,
    startX: e.clientX,
    startY: e.clientY,
    ghost: null,
    container: container,
    isAttackTab: isAttackTab
  };

  // Create ghost element
  createDragGhost(item, e.clientX, e.clientY);

  // Add dragging class
  item.classList.add('dragging');
  container.classList.add('drag-active');

  // Bind move and end events to document
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', endDrag);
}

/**
 * Creates a ghost element for visual feedback
 */
function createDragGhost(item, x, y) {
  const ghost = item.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.classList.remove('dragging');
  ghost.style.width = `${item.offsetWidth}px`;
  ghost.style.left = `${x - item.offsetWidth / 2}px`;
  ghost.style.top = `${y - 20}px`;
  document.body.appendChild(ghost);
  dragState.ghost = ghost;
}

/**
 * Handles mouse movement during drag
 */
function handleMouseMove(e) {
  if (!dragState.isDragging || !dragState.ghost) return;

  // Update ghost position
  dragState.ghost.style.left = `${e.clientX - dragState.ghost.offsetWidth / 2}px`;
  dragState.ghost.style.top = `${e.clientY - 20}px`;

  // Find element under cursor
  dragState.ghost.style.display = 'none';
  const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
  dragState.ghost.style.display = '';

  const selector = dragState.isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const dropTarget = elemBelow?.closest(selector);

  // Update visual feedback
  updateDropTargetVisuals(dropTarget);
}

/**
 * Updates visual feedback for drop target
 */
function updateDropTargetVisuals(dropTarget) {
  const container = dragState.container;
  const selector = dragState.isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';

  // Clear previous drop-over states
  container.querySelectorAll(`${selector}.drag-over`).forEach(el => {
    el.classList.remove('drag-over');
  });

  // Add drop-over to current target
  if (dropTarget && dropTarget !== dragState.draggedElement) {
    dropTarget.classList.add('drag-over');
  }
}

/**
 * Ends drag operation
 */
function endDrag(e) {
  if (!dragState.isDragging) return;

  // Find final drop target
  if (dragState.ghost) dragState.ghost.style.display = 'none';
  const elemBelow = document.elementFromPoint(e.clientX, e.clientY);
  if (dragState.ghost) dragState.ghost.style.display = '';

  const selector = dragState.isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const dropTarget = elemBelow?.closest(selector);

  if (dropTarget && dropTarget !== dragState.draggedElement) {
    reorderScramblers(dragState.draggedElement, dropTarget);
  }

  // Cleanup
  cleanupDrag();
}

/**
 * Cleans up drag state and visuals
 */
function cleanupDrag() {
  if (dragState.ghost) {
    dragState.ghost.remove();
  }

  if (dragState.draggedElement) {
    dragState.draggedElement.classList.remove('dragging');
  }

  if (dragState.container) {
    dragState.container.classList.remove('drag-active');
    const selector = dragState.isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
    dragState.container.querySelectorAll(`${selector}.drag-over`).forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', endDrag);

  dragState = {
    isDragging: false,
    draggedElement: null,
    draggedId: null,
    startX: 0,
    startY: 0,
    ghost: null,
    container: null,
    isAttackTab: false
  };
}

/**
 * Reorders scramblers in DOM and updates order state
 */
function reorderScramblers(draggedEl, targetEl) {
  const container = dragState.container;
  const isAttackTab = dragState.isAttackTab;
  const selector = isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';

  // Get current DOM order
  const items = Array.from(container.querySelectorAll(selector));
  const draggedIndex = items.indexOf(draggedEl);
  const targetIndex = items.indexOf(targetEl);

  if (draggedIndex === -1 || targetIndex === -1) return;

  // Reorder in DOM
  if (draggedIndex < targetIndex) {
    targetEl.after(draggedEl);
  } else {
    targetEl.before(draggedEl);
  }

  // Update order state from new DOM order
  updateOrderFromDOM(container, isAttackTab);

  // Update legend labels to show new order
  updateScramblerLabels(container, isAttackTab);

  // Trigger auto-save
  if (typeof debouncedSaveSettings === 'function') {
    debouncedSaveSettings();
  }
  if (document.getElementById('input-text')?.value) {
    updateOutput();
  }
}

/**
 * Updates order state from current DOM order
 */
function updateOrderFromDOM(container, isAttackTab) {
  const selector = isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const idAttr = isAttackTab ? 'attackScramblerId' : 'scramblerId';

  const items = container.querySelectorAll(selector);
  const newOrder = Array.from(items).map(item => parseInt(item.dataset[idAttr]));

  setScramblerOrder(newOrder, isAttackTab);
}

/**
 * Updates scrambler legend labels - preserves original ID
 * Labels are NOT renumbered; they keep their original scrambler ID
 */
function updateScramblerLabels(container, isAttackTab) {
  // Labels are preserved based on data-scrambler-id, no renumbering needed
  // This function now just ensures the label matches the original ID
  const selector = isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const idAttr = isAttackTab ? 'attackScramblerId' : 'scramblerId';
  const items = container.querySelectorAll(selector);

  items.forEach((item) => {
    const label = item.querySelector('.toggle-label span');
    if (label) {
      const originalId = parseInt(item.dataset[idAttr]);
      label.textContent = `Scrambler ${originalId}`;
    }
  });
}

// =================================
// Touch Drag Support
// =================================

let touchState = {
  item: null,
  container: null,
  isAttackTab: false,
  isDragging: false,
  ghost: null,
  currentX: 0,
  currentY: 0
};

/**
 * Starts touch drag operation
 */
function startTouchDrag(e, item, container, isAttackTab) {
  e.preventDefault();

  const touch = e.touches[0];
  const idAttr = isAttackTab ? 'attackScramblerId' : 'scramblerId';

  touchState = {
    item: item,
    container: container,
    isAttackTab: isAttackTab,
    isDragging: true,
    ghost: null,
    currentX: touch.clientX,
    currentY: touch.clientY
  };

  // Create ghost immediately
  const ghost = item.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.width = `${item.offsetWidth}px`;
  ghost.style.left = `${touch.clientX - item.offsetWidth / 2}px`;
  ghost.style.top = `${touch.clientY - 30}px`;
  document.body.appendChild(ghost);
  touchState.ghost = ghost;

  item.classList.add('dragging', 'touch-active');
  container.classList.add('drag-active');

  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', endTouchDrag);
  document.addEventListener('touchcancel', cancelTouchDrag);
}

/**
 * Handles touch movement
 */
function handleTouchMove(e) {
  if (!touchState.isDragging) return;
  e.preventDefault();

  const touch = e.touches[0];
  touchState.currentX = touch.clientX;
  touchState.currentY = touch.clientY;

  // Update ghost position
  if (touchState.ghost) {
    touchState.ghost.style.left = `${touch.clientX - touchState.ghost.offsetWidth / 2}px`;
    touchState.ghost.style.top = `${touch.clientY - 30}px`;
  }

  // Find element under touch point
  if (touchState.ghost) touchState.ghost.style.display = 'none';
  const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
  if (touchState.ghost) touchState.ghost.style.display = '';

  const selector = touchState.isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const dropTarget = elemBelow?.closest(selector);

  // Update visuals
  const container = touchState.container;
  container.querySelectorAll(`${selector}.drag-over`).forEach(el => {
    el.classList.remove('drag-over');
  });

  if (dropTarget && dropTarget !== touchState.item) {
    dropTarget.classList.add('drag-over');
  }
}

/**
 * Ends touch drag
 */
function endTouchDrag(e) {
  if (!touchState.isDragging) {
    cleanupTouchDrag();
    return;
  }

  // Find drop target
  if (touchState.ghost) touchState.ghost.style.display = 'none';
  const elemBelow = document.elementFromPoint(touchState.currentX, touchState.currentY);
  if (touchState.ghost) touchState.ghost.style.display = '';

  const selector = touchState.isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const dropTarget = elemBelow?.closest(selector);

  if (dropTarget && dropTarget !== touchState.item) {
    // Set up dragState for reorderScramblers
    dragState = {
      isDragging: true,
      draggedElement: touchState.item,
      draggedId: parseInt(touchState.item.dataset[touchState.isAttackTab ? 'attackScramblerId' : 'scramblerId']),
      container: touchState.container,
      isAttackTab: touchState.isAttackTab
    };
    reorderScramblers(touchState.item, dropTarget);
  }

  cleanupTouchDrag();
}

/**
 * Cleans up touch drag state
 */
function cleanupTouchDrag() {
  if (touchState.ghost) {
    touchState.ghost.remove();
  }

  if (touchState.item) {
    touchState.item.classList.remove('dragging', 'touch-active');
  }

  if (touchState.container) {
    touchState.container.classList.remove('drag-active');
    const selector = touchState.isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
    touchState.container.querySelectorAll(`${selector}.drag-over`).forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  document.removeEventListener('touchmove', handleTouchMove);
  document.removeEventListener('touchend', endTouchDrag);
  document.removeEventListener('touchcancel', cancelTouchDrag);

  touchState = {
    item: null,
    container: null,
    isAttackTab: false,
    isDragging: false,
    ghost: null,
    currentX: 0,
    currentY: 0
  };
}

function cancelTouchDrag() {
  cleanupTouchDrag();
}

/**
 * Handles keyboard-based reordering
 */
function handleKeyboardReorder(e, item, container, isAttackTab) {
  const selector = isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const items = Array.from(container.querySelectorAll(selector));
  const currentIndex = items.indexOf(item);

  let targetIndex = -1;

  switch (e.key) {
    case 'ArrowUp':
    case 'ArrowLeft':
      if (currentIndex > 0) {
        targetIndex = currentIndex - 1;
      }
      break;
    case 'ArrowDown':
    case 'ArrowRight':
      if (currentIndex < items.length - 1) {
        targetIndex = currentIndex + 1;
      }
      break;
    default:
      return;
  }

  if (targetIndex !== -1) {
    e.preventDefault();

    // Set up drag state for reorderScramblers
    const idAttr = isAttackTab ? 'attackScramblerId' : 'scramblerId';
    dragState = {
      isDragging: true,
      draggedElement: item,
      draggedId: parseInt(item.dataset[idAttr]),
      container: container,
      isAttackTab: isAttackTab
    };

    reorderScramblers(item, items[targetIndex]);

    // Refocus the handle after reorder
    setTimeout(() => {
      item.querySelector('.drag-handle')?.focus();
    }, 10);
  }
}

/**
 * Reorders DOM elements to match saved order state
 */
function reorderDOMFromState(isAttackTab) {
  const container = document.querySelector(
    isAttackTab ? '.attack-scramblers' : '.scramblers-container'
  );
  if (!container) return;

  const order = getScramblerOrder(isAttackTab);
  const selector = isAttackTab ? '.attack-fieldset[data-attack-scrambler-id]' : '.scrambler[data-scrambler-id]';
  const idAttr = isAttackTab ? 'attackScramblerId' : 'scramblerId';

  // Get all items
  const items = Array.from(container.querySelectorAll(selector));

  // Reorder by appending in order
  order.forEach(id => {
    const item = items.find(el => parseInt(el.dataset[idAttr]) === id);
    if (item) {
      container.appendChild(item);
    }
  });

  // Update labels
  updateScramblerLabels(container, isAttackTab);
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
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
  currentLanguage = requestedLanguage === 'en' ? 'en' : getStoredLanguage();
  applyStaticTranslations();
  populatePresets();

  // Load settings: URL params take priority over localStorage
  const loadedFromURL = loadFromURL();
  if (!loadedFromURL) {
    loadSettings();
  }
  syncPresetSelections();

  bindEvents();
  bindAttackEvents();
  setupAutoSave();
  setupRealtimeProcessing();

  // Initialize drag-and-drop for both tabs
  const mainContainer = document.querySelector('.scramblers-container');
  if (mainContainer) {
    initDragAndDrop(mainContainer, false);
  }

  const attackContainer = document.querySelector('.attack-scramblers');
  if (attackContainer) {
    initDragAndDrop(attackContainer, true);
  }

  // Reorder DOM to match loaded state
  reorderDOMFromState(false);
  reorderDOMFromState(true);

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

// =================================
// Known Plaintext Attack Module
// =================================

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates attack-specific settings
 * @param {Object} settings - Attack settings
 * @returns {Object} {valid: boolean, errors: string[]}
 */
function validateAttackSettings(settings) {
  const errors = [];

  if (!settings.ciphertext || !settings.ciphertext.trim()) {
    errors.push(t('attackCipherRequired'));
  } else if (settings.ciphertext.length > Core.MAX_ATTACK_LENGTH) {
    errors.push(t('attackTooLong', { max: Core.MAX_ATTACK_LENGTH }));
  }

  if (!settings.knownPairs || settings.knownPairs.length === 0) {
    errors.push(t('attackKnownRequired'));
  }

  const cipherAlphaLength = (settings.ciphertext?.match(/[A-Za-z]/g) || []).length;

  // Check if any known position exceeds ciphertext length
  if (settings.knownPairs) {
    for (const pair of settings.knownPairs) {
      if (pair.pos >= cipherAlphaLength) {
        errors.push(t('attackPositionOutOfRange', { position: pair.pos }));
        break;
      }
    }
  }

  const enabledScramblers = settings.baseSettings?.scramblers?.filter(
    s => s.enabled && s.wiring && s.wiring.length === 26
  ) || [];

  if (enabledScramblers.length === 0) {
    errors.push(t('attackScramblerRequired'));
  }

  settings.baseSettings?.scramblers?.forEach((scrambler) => {
    if (!scrambler.enabled) return;
    const result = Core.validateWiring(scrambler.wiring, { allowEmpty: false });
    if (!result.valid) {
      errors.push(t('scramblerError', {
        number: scrambler.id,
        message: validationMessage(result)
      }));
    }
  });

  if (settings.baseSettings?.reflectorEnabled) {
    const result = Core.validateReflectorWiring(settings.baseSettings.reflector);
    if (!result.valid) {
      errors.push(t('reflectorError', { message: validationMessage(result) }));
    }
  }

  return { valid: errors.length === 0, errors };
}

// =================================
// Known Plaintext Attack UI
// =================================

/**
 * Generates plaintext grid from ciphertext
 * @param {string} ciphertext - Ciphertext to generate grid for
 */
function generatePlaintextGrid(ciphertext) {
  const gridContainer = document.getElementById('plaintext-grid');
  if (!gridContainer) return;

  if (!ciphertext || !ciphertext.trim()) {
    gridContainer.innerHTML = `<p class="grid-placeholder">${escapeHtml(t('gridPlaceholder'))}</p>`;
    return;
  }

  gridContainer.innerHTML = '';
  let alphaIndex = 0;

  for (const char of ciphertext.toUpperCase()) {
    if (/[A-Z]/.test(char)) {
      // Create column for alphabet character
      const column = document.createElement('div');
      column.className = 'grid-column';

      const cipherChar = document.createElement('span');
      cipherChar.className = 'grid-cipher-char';
      cipherChar.textContent = char;

      const plainInput = document.createElement('input');
      plainInput.type = 'text';
      plainInput.className = 'grid-plain-input';
      plainInput.maxLength = 1;
      plainInput.dataset.position = alphaIndex;
      plainInput.setAttribute('autocomplete', 'off');
      plainInput.setAttribute('pattern', '[A-Za-z]');

      // Block non-ASCII input before it happens
      plainInput.addEventListener('beforeinput', (e) => {
        if (e.data && !/^[A-Za-z]$/.test(e.data)) {
          e.preventDefault();
        }
      });

      // Block IME composition (full-width input)
      let isComposing = false;
      plainInput.addEventListener('compositionstart', () => {
        isComposing = true;
      });
      plainInput.addEventListener('compositionend', (e) => {
        isComposing = false;
        // Clear any composed text and keep only ASCII
        const value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
        e.target.value = value;
      });

      // Auto-move to next input on valid input
      plainInput.addEventListener('input', (e) => {
        // Skip processing during IME composition
        if (isComposing) return;

        // Filter to A-Z only and limit to 1 character
        const value = e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1);
        e.target.value = value;

        if (/^[A-Z]$/.test(value)) {
          // Move to next input
          const nextInput = gridContainer.querySelector(
            `.grid-plain-input[data-position="${parseInt(e.target.dataset.position) + 1}"]`
          );
          if (nextInput) nextInput.focus();
        }
      });

      // Handle backspace to move to previous input
      plainInput.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value) {
          const prevInput = gridContainer.querySelector(
            `.grid-plain-input[data-position="${parseInt(e.target.dataset.position) - 1}"]`
          );
          if (prevInput) {
            prevInput.focus();
            prevInput.select();
          }
        } else if (e.key === 'ArrowLeft') {
          const prevInput = gridContainer.querySelector(
            `.grid-plain-input[data-position="${parseInt(e.target.dataset.position) - 1}"]`
          );
          if (prevInput) prevInput.focus();
        } else if (e.key === 'ArrowRight') {
          const nextInput = gridContainer.querySelector(
            `.grid-plain-input[data-position="${parseInt(e.target.dataset.position) + 1}"]`
          );
          if (nextInput) nextInput.focus();
        }
      });

      column.appendChild(cipherChar);
      column.appendChild(plainInput);
      gridContainer.appendChild(column);
      alphaIndex++;
    } else {
      // Create separator for non-alphabet character
      const separator = document.createElement('span');
      separator.className = 'grid-separator';
      separator.textContent = char === ' ' ? '\u00A0' : char;
      gridContainer.appendChild(separator);
    }
  }
}

/**
 * Gets known plaintext pairs from grid
 * @returns {Array} Array of {pos, char} pairs
 */
function getKnownPlaintextFromGrid() {
  const gridContainer = document.getElementById('plaintext-grid');
  if (!gridContainer) return [];

  const pairs = [];
  const inputs = gridContainer.querySelectorAll('.grid-plain-input');

  inputs.forEach(input => {
    const value = input.value.toUpperCase();
    if (/^[A-Z]$/.test(value)) {
      pairs.push({
        pos: parseInt(input.dataset.position, 10),
        char: value
      });
    }
  });

  return pairs;
}

/**
 * Gets attack settings from UI (uses attack tab's own settings)
 * @returns {Object} Attack settings
 */
function getAttackSettingsFromUI() {
  const ciphertext = document.getElementById('attack-ciphertext')?.value || '';
  const knownPairs = getKnownPlaintextFromGrid();

  // Get scramblers in current visual order
  const order = getScramblerOrder(true);

  // Build settings from attack tab inputs
  const baseSettings = {
    plugboard: document.getElementById('attack-plugboard')?.value || '',
    plugboardEnabled: document.getElementById('attack-plugboard-enabled')?.checked || false,
    scramblers: order.map(id => ({
      id: id, // original scrambler ID
      wiring: document.getElementById(`attack-wiring${id}`)?.value || '',
      position: 'A',
      notch: document.getElementById(`attack-notch${id}`)?.value || 'Z',
      notchEnabled: document.getElementById(`attack-notch${id}-enabled`)?.checked ?? true,
      enabled: document.getElementById(`attack-scrambler${id}-enabled`)?.checked || false
    })),
    reflector: document.getElementById('attack-reflector')?.value || '',
    reflectorEnabled: document.getElementById('attack-reflector-enabled')?.checked || false
  };

  return {
    ciphertext,
    knownPairs,
    baseSettings
  };
}

/**
 * Displays attack error messages
 * @param {string[]} errors - Array of error messages
 */
function displayAttackErrors(errors) {
  const container = document.getElementById('attack-error-messages');
  if (!container) return;

  if (errors.length === 0) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }

  container.hidden = false;
  container.innerHTML = errors.map(e => `<p>${escapeHtml(e)}</p>`).join('');
}

function setAttackControlsRunning(running) {
  const runButton = document.getElementById('attack-run-btn');
  const cancelButton = document.getElementById('attack-cancel-btn');
  if (runButton) runButton.disabled = running;
  if (cancelButton) cancelButton.hidden = !running;
}

function updateAttackProgress(summary, options = {}) {
  const progress = document.getElementById('attack-progress');
  const progressBar = document.getElementById('attack-progress-bar');
  const progressText = document.getElementById('attack-progress-text');
  const spinner = document.getElementById('attack-progress-spinner');
  if (!progress || !progressBar || !progressText) return;

  const total = Math.max(summary.total, 1);
  const percent = Math.min(100, Math.floor((summary.checked / total) * 100));
  progress.hidden = false;
  progressBar.max = total;
  progressBar.value = summary.checked;
  if (spinner) spinner.hidden = Boolean(options.complete || options.cancelled);

  const variables = {
    checked: summary.checked.toLocaleString(currentLanguage),
    total: summary.total.toLocaleString(currentLanguage),
    percent,
    matches: summary.matchCount.toLocaleString(currentLanguage)
  };
  if (options.cancelled) progressText.textContent = t('searchCancelled', variables);
  else if (options.complete) progressText.textContent = t('searchComplete', variables);
  else progressText.textContent = t('searchProgress', variables);
}

function displayNarrowingSummary(summary, cancelled = false) {
  const section = document.getElementById('attack-narrowing-section');
  const note = document.getElementById('attack-narrowing-note');
  const body = document.getElementById('attack-narrowing-body');
  if (!section || !note || !body) return;

  section.hidden = summary.narrowingRows.length === 0;
  note.textContent = t(cancelled ? 'narrowingPartialHelp' : 'narrowingHelp');
  body.innerHTML = summary.narrowingRows.map((row) => `
    <tr>
      <th scope="row">${row.step}</th>
      <td>${escapeHtml(t('narrowingClueValue', {
        position: row.position,
        cipher: row.cipherChar,
        plain: row.plainChar
      }))}</td>
      <td>${row.before.toLocaleString(currentLanguage)}</td>
      <td>${row.after.toLocaleString(currentLanguage)}</td>
      <td>${row.eliminated.toLocaleString(currentLanguage)}</td>
    </tr>
  `).join('');
}

/**
 * Displays attack results and generates detailed traces only when opened.
 * @param {Object} summary - Search summary from attack-core.js
 */
function displayAttackResults(summary, searchInfo, cancelled = false, remember = true) {
  const resultsContainer = document.getElementById('attack-results');
  const countDisplay = document.getElementById('attack-result-count');
  const retentionNote = document.getElementById('attack-retention-note');

  if (!resultsContainer || !countDisplay) return;

  if (remember) {
    lastAttackResults = { summary, searchInfo, cancelled };
  }

  if (retentionNote) {
    retentionNote.hidden = !summary.truncated;
    retentionNote.textContent = summary.truncated
      ? t('retainedCandidates', {
        total: summary.matchCount.toLocaleString(currentLanguage),
        shown: summary.shownCount.toLocaleString(currentLanguage)
      })
      : '';
  }

  if (cancelled) {
    countDisplay.textContent = t('partialCandidateCount', {
      count: summary.matchCount.toLocaleString(currentLanguage),
      checked: summary.checked.toLocaleString(currentLanguage)
    });
  } else if (summary.truncated) {
    countDisplay.textContent = t('candidateCountLimited', {
      total: summary.matchCount.toLocaleString(currentLanguage),
      shown: summary.shownCount.toLocaleString(currentLanguage)
    });
  } else {
    countDisplay.textContent = t('candidateCount', {
      count: summary.matchCount.toLocaleString(currentLanguage)
    });
  }

  if (summary.candidates.length === 0) {
    resultsContainer.innerHTML = `<p class="no-results">${escapeHtml(t('noCandidateBody'))}</p>`;
    return;
  }

  resultsContainer.innerHTML = summary.candidates.map((candidate, index) => `
    <div class="attack-result-item">
      <div class="result-header">
        <span class="result-number">#${index + 1}</span>
        <span class="result-positions">${escapeHtml(candidate.positionsString)}</span>
        <button type="button" class="btn-apply-result" data-positions="${escapeHtml(candidate.positionsString)}">
          ${escapeHtml(t('applyToSettings'))}
        </button>
      </div>
      <div class="result-match-reason">
        <label>${escapeHtml(t('reason'))}:</label>
        <div class="match-reason-content">
          ${escapeHtml(t('candidateReason', { positions: candidate.positionsString }))}
          <ul class="match-pairs-list">
            ${candidate.matchedPairs.map(pair => `<li>${escapeHtml(t('matchedAt', { position: pair.pos + 1, char: pair.char }))}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="result-decrypted">
        <label>${escapeHtml(t('decryptedResult'))}:</label>
        <code>${escapeHtml(candidate.decryptedFull)}</code>
      </div>
      <details class="result-trace" data-candidate-index="${index}">
        <summary>${escapeHtml(t('traceDetails'))}</summary>
        <pre class="trace-log">${escapeHtml(t('traceOnDemand'))}</pre>
      </details>
    </div>
  `).join('');

  // Bind apply buttons
  resultsContainer.querySelectorAll('.btn-apply-result').forEach(btn => {
    btn.addEventListener('click', () => {
      showApplyConfirmDialog(btn.dataset.positions);
    });
  });

  resultsContainer.querySelectorAll('.result-trace').forEach((details) => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      const trace = details.querySelector('.trace-log');
      if (!trace || trace.dataset.loaded === 'true') return;
      const candidate = summary.candidates[Number(details.dataset.candidateIndex)];
      const positionIndexes = candidate.positions.map((position) => ALPHABET.indexOf(position));
      const settings = Attack.buildAttackSettings(positionIndexes, searchInfo.baseSettings);
      trace.textContent = processText(searchInfo.ciphertext, settings).log;
      trace.dataset.loaded = 'true';
    });
  });
}

// Store pending positions for apply confirm dialog
let pendingApplyPositions = null;

/**
 * Shows apply confirm dialog
 * @param {string} positionsString - Positions string (e.g., "A-B-C")
 */
function showApplyConfirmDialog(positionsString) {
  pendingApplyPositions = positionsString;

  const modal = document.getElementById('apply-confirm-modal');
  const message = document.getElementById('apply-confirm-message');

  if (modal && message) {
    message.textContent = t('applyPositionsQuestion', { positions: positionsString });
    modal.hidden = false;
  }
}

/**
 * Closes apply confirm dialog
 */
function closeApplyConfirmDialog() {
  const modal = document.getElementById('apply-confirm-modal');
  if (modal) {
    modal.hidden = true;
  }
  pendingApplyPositions = null;
}

/**
 * Applies attack result positions to main settings
 * Copies attack tab settings (wiring, plugboard, reflector) to main tab
 */
function applyAttackResult() {
  if (!pendingApplyPositions) return;

  const positions = pendingApplyPositions.split('-');

  // Copy plugboard settings
  const attackPlugboardEnabled = document.getElementById('attack-plugboard-enabled');
  const attackPlugboard = document.getElementById('attack-plugboard');
  const mainPlugboardEnabled = document.getElementById('plugboard-enabled');
  const mainPlugboard = document.getElementById('plugboard');

  if (mainPlugboardEnabled && attackPlugboardEnabled) {
    mainPlugboardEnabled.checked = attackPlugboardEnabled.checked;
    updateToggleState(mainPlugboardEnabled);
  }
  if (mainPlugboard && attackPlugboard) {
    mainPlugboard.value = attackPlugboard.value;
  }

  // Copy reflector settings
  const attackReflectorEnabled = document.getElementById('attack-reflector-enabled');
  const attackReflector = document.getElementById('attack-reflector');
  const mainReflectorEnabled = document.getElementById('reflector-enabled');
  const mainReflector = document.getElementById('reflector');

  if (mainReflectorEnabled && attackReflectorEnabled) {
    mainReflectorEnabled.checked = attackReflectorEnabled.checked;
    updateToggleState(mainReflectorEnabled);
  }
  if (mainReflector && attackReflector) {
    mainReflector.value = attackReflector.value;
  }

  // Copy scrambler settings and apply positions
  let posIndex = 0;
  for (let i = 1; i <= 3; i++) {
    const attackEnabled = document.getElementById(`attack-scrambler${i}-enabled`);
    const attackWiring = document.getElementById(`attack-wiring${i}`);
    const attackNotch = document.getElementById(`attack-notch${i}`);
    const attackNotchEnabled = document.getElementById(`attack-notch${i}-enabled`);
    const mainEnabled = document.getElementById(`scrambler${i}-enabled`);
    const mainWiring = document.getElementById(`wiring${i}`);
    const mainPosition = document.getElementById(`position${i}`);
    const mainNotch = document.getElementById(`notch${i}`);
    const mainNotchEnabled = document.getElementById(`notch${i}-enabled`);

    if (mainEnabled && attackEnabled) {
      mainEnabled.checked = attackEnabled.checked;
      updateToggleState(mainEnabled);
    }
    if (mainWiring && attackWiring) {
      mainWiring.value = attackWiring.value;
    }
    // Copy notch settings
    if (mainNotch && attackNotch) {
      mainNotch.value = attackNotch.value || 'Z';
    }
    // Copy notch enabled state
    if (mainNotchEnabled && attackNotchEnabled) {
      mainNotchEnabled.checked = attackNotchEnabled.checked;
    }

    // Apply position if this scrambler was enabled and had valid wiring
    if (attackEnabled?.checked && attackWiring?.value.length === 26 && mainPosition) {
      if (positions[posIndex]) {
        mainPosition.value = positions[posIndex];
        posIndex++;
      }
    }
  }

  // Close dialog
  closeApplyConfirmDialog();

  // Switch to cipher tab
  switchTab('cipher');

  // Save settings
  syncPresetSelections();
  saveSettings();
}

/**
 * Switches to specified tab
 * @param {string} tabId - Tab ID ('cipher' or 'analysis')
 */
function switchTab(tabId) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
  });

  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
}

/**
 * Updates search space display based on enabled scramblers in attack tab
 */
function updateAttackSearchSpaceDisplay() {
  const infoEl = document.getElementById('attack-combinations');
  if (!infoEl) return;

  const enabledCount = [1, 2, 3].filter(i => {
    const checkbox = document.getElementById(`attack-scrambler${i}-enabled`);
    const wiring = document.getElementById(`attack-wiring${i}`);
    return checkbox?.checked && wiring?.value.length === 26;
  }).length;

  if (enabledCount === 0) {
    infoEl.textContent = t('noActiveScrambler');
    return;
  }

  const combinations = Math.pow(26, enabledCount);
  infoEl.textContent = t('combinations', {
    count: combinations.toLocaleString(currentLanguage),
    power: enabledCount
  });
}

function yieldAttackSearch() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function cancelKnownPlaintextAttack() {
  if (!activeAttackSearch) return;
  activeAttackSearch.cancelled = true;
  const cancelButton = document.getElementById('attack-cancel-btn');
  if (cancelButton) cancelButton.disabled = true;
}

/**
 * Runs the known plaintext attack in small batches so the UI stays responsive.
 */
async function runKnownPlaintextAttack() {
  if (activeAttackSearch) return;
  const settings = getAttackSettingsFromUI();

  // Validate
  const validation = validateAttackSettings(settings);
  if (!validation.valid) {
    displayAttackErrors(validation.errors);
    return;
  }

  displayAttackErrors([]);
  lastAttackResults = null;
  const narrowingSection = document.getElementById('attack-narrowing-section');
  const retentionNote = document.getElementById('attack-retention-note');
  const resultsContainer = document.getElementById('attack-results');
  const countDisplay = document.getElementById('attack-result-count');
  if (narrowingSection) narrowingSection.hidden = true;
  if (retentionNote) retentionNote.hidden = true;
  if (resultsContainer) resultsContainer.innerHTML = `<p class="placeholder-message">${escapeHtml(t('searching'))}</p>`;
  if (countDisplay) countDisplay.textContent = '-';

  const state = Attack.createSearchState(settings);
  const token = { state, cancelled: false };
  activeAttackSearch = token;
  setAttackControlsRunning(true);
  updateAttackProgress(Attack.getSearchSummary(state));

  try {
    while (!state.done && !token.cancelled) {
      Attack.advanceSearch(state, 64);
      updateAttackProgress(Attack.getSearchSummary(state));
      if (!state.done) await yieldAttackSearch();
    }

    const summary = Attack.getSearchSummary(state);
    const cancelled = token.cancelled && !state.done;
    updateAttackProgress(summary, { complete: !cancelled, cancelled });
    displayNarrowingSummary(summary, cancelled);
    displayAttackResults(summary, settings, cancelled);
  } catch (error) {
    console.error(error);
    displayAttackErrors([t('searchFailed')]);
    document.getElementById('attack-progress').hidden = true;
  } finally {
    if (activeAttackSearch === token) activeAttackSearch = null;
    setAttackControlsRunning(false);
    const cancelButton = document.getElementById('attack-cancel-btn');
    if (cancelButton) cancelButton.disabled = false;
  }
}

/**
 * Populates attack presets dropdowns
 */
function populateAttackPresets() {
  // Scrambler presets
  for (let i = 1; i <= 3; i++) {
    const select = document.getElementById(`attack-preset${i}`);
    if (select) {
      const selectedValue = select.value;
      select.innerHTML = '';
      PRESET_WIRINGS.scrambler.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.wiring;
        option.textContent = t(preset.nameKey);
        select.appendChild(option);
      });
      if ([...select.options].some(option => option.value === selectedValue)) {
        select.value = selectedValue;
      }
    }
  }

  // Reflector presets
  const reflectorSelect = document.getElementById('attack-preset-reflector');
  if (reflectorSelect) {
    const selectedValue = reflectorSelect.value;
    reflectorSelect.innerHTML = '';
    PRESET_WIRINGS.reflector.forEach(preset => {
      const option = document.createElement('option');
      option.value = preset.wiring;
      option.textContent = t(preset.nameKey);
      reflectorSelect.appendChild(option);
    });
    reflectorSelect.value = [...reflectorSelect.options].some(option => option.value === selectedValue)
      ? selectedValue
      : (PRESET_WIRINGS.reflector[1]?.wiring || '');
  }
}

/**
 * Updates attack toggle state for fieldsets
 */
function updateAttackToggleState(checkbox) {
  const fieldset = checkbox.closest('.toggleable');
  if (fieldset) {
    fieldset.classList.toggle('disabled', !checkbox.checked);
  }
}

/**
 * Binds attack-related events
 */
function bindAttackEvents() {
  // Populate attack presets
  populateAttackPresets();

  // Run attack button
  const attackRunBtn = document.getElementById('attack-run-btn');
  if (attackRunBtn) {
    attackRunBtn.addEventListener('click', runKnownPlaintextAttack);
  }
  const attackCancelBtn = document.getElementById('attack-cancel-btn');
  if (attackCancelBtn) {
    attackCancelBtn.addEventListener('click', cancelKnownPlaintextAttack);
  }

  // Ciphertext input - generate grid and filter to ASCII only
  const ciphertextInput = document.getElementById('attack-ciphertext');
  if (ciphertextInput) {
    // Block non-ASCII input
    ciphertextInput.addEventListener('beforeinput', (e) => {
      if (e.data && /[^\x00-\x7F]/.test(e.data)) {
        e.preventDefault();
      }
    });

    // Filter on input and generate grid
    ciphertextInput.addEventListener('input', (e) => {
      // Remove any non-ASCII characters that slipped through
      const filtered = e.target.value.replace(/[^\x00-\x7F]/g, '');
      if (filtered !== e.target.value) {
        e.target.value = filtered;
      }
    });

    const debouncedGenerate = debounce(() => {
      generatePlaintextGrid(ciphertextInput.value);
    }, 300);
    ciphertextInput.addEventListener('input', debouncedGenerate);
  }

  // Apply confirm dialog buttons
  const applyConfirmCancel = document.getElementById('apply-confirm-cancel');
  const applyConfirmOk = document.getElementById('apply-confirm-ok');
  const applyConfirmModal = document.getElementById('apply-confirm-modal');

  if (applyConfirmCancel) {
    applyConfirmCancel.addEventListener('click', closeApplyConfirmDialog);
  }

  if (applyConfirmOk) {
    applyConfirmOk.addEventListener('click', applyAttackResult);
  }

  // Close on overlay click
  if (applyConfirmModal) {
    const overlay = applyConfirmModal.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', closeApplyConfirmDialog);
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !applyConfirmModal.hidden) {
        closeApplyConfirmDialog();
      }
    });
  }

  // Attack preset selection handlers
  document.querySelectorAll('.attack-preset-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const targetId = e.target.dataset.target;
      const targetInput = document.getElementById(targetId);
      if (targetInput && e.target.value) {
        targetInput.value = e.target.value;
        updateAttackSearchSpaceDisplay();
      }
    });
  });

  // Attack toggle state handlers
  const attackToggles = [
    'attack-plugboard-enabled',
    'attack-scrambler1-enabled',
    'attack-scrambler2-enabled',
    'attack-scrambler3-enabled',
    'attack-reflector-enabled'
  ];

  attackToggles.forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      // Set initial state
      updateAttackToggleState(checkbox);
      // Listen for changes
      checkbox.addEventListener('change', () => {
        updateAttackToggleState(checkbox);
        updateAttackSearchSpaceDisplay();
      });
    }
  });

  // Update search space when attack wiring changes
  ['attack-wiring1', 'attack-wiring2', 'attack-wiring3'].forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', debounce(updateAttackSearchSpaceDisplay, 300));
    }
  });

  // Initial search space display
  updateAttackSearchSpaceDisplay();
}
