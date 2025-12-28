# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cypher Enigma Simulator - a simplified Enigma-style cipher simulator for solving and analyzing Cypher puzzle challenges. This is an educational/analytical tool, NOT a historically accurate Enigma machine.

**Intentionally omitted features:** Ring settings, double-stepping, military variants.

## Tech Stack

- Static web app (GitHub Pages deployment)
- Vanilla JavaScript only - no frameworks or external dependencies
- Single-page architecture: `index.html`, `style.css`, `main.js`

## Development

No build process required. Open `index.html` directly in a browser for local development.

```bash
# Preview locally
start index.html
```

## Architecture

### Cipher Flow (per character)

1. Rotor rotation (direction depends on mode)
2. Plugboard (input substitution)
3. Forward scrambler pass (1→N)
4. Reflector
5. Reverse scrambler pass (N→1)
6. Plugboard (output substitution)

### Key Components

- **Plugboard**: Bidirectional letter pair substitution (e.g., `A-B, S-Z`)
- **Scramblers (1-3)**: Each has 26-char wiring, starting position (A-Z), and notch position (A-Z, default Z)
  - Drag-and-drop reordering supported
  - When a scrambler passes its notch position, the next scrambler rotates (cascade)
- **Reflector**: 26-char substitution string (self-inverse)

### Mode Difference

- Encrypt: rotors rotate right (+1)
- Decrypt: rotors rotate left (-1)

### Character Handling

- Target: A-Z uppercase only
- Non-alphabetic characters pass through unchanged

## Known Plaintext Attack Feature

### Attack Flow

1. User sets plugboard, scrambler wirings, and reflector in the analysis tab
2. User enters ciphertext (plaintext grid is auto-generated)
3. User fills in known plaintext characters at corresponding positions
4. Attack function iterates through all 26^n position combinations
5. For each combination, decrypt ciphertext and check if all known plaintext positions match
6. Display matching candidates with trace information

### Key Functions

- `indexToPositions(index, count)`: Convert linear index to position array
- `buildAttackSettings(positions, baseSettings)`: Construct settings object for testing
- `testPositionCombination(settings)`: Test a single position combination
- `performKnownPlaintextAttack(settings)`: Main brute-force search function
- `generatePlaintextGrid(ciphertext)`: Generate UI grid for plaintext input
- `getKnownPlaintextFromGrid()`: Collect {position, char} pairs from grid

### Search Space

- 1 scrambler: 26 combinations
- 2 scramblers: 676 combinations
- 3 scramblers: 17,576 combinations

### Security Considerations

- ASCII-only input filter on ciphertext textarea (blocks non-ASCII via `beforeinput` event)
- HTML escaping via `escapeHtml()` for all dynamic content inserted via `innerHTML`
- No external dependencies (reduces supply chain risk)

## UI Skills

This project uses mobile-first web UI design principles (see `.claude/skills/mobile-first-web-ui/SKILL.md`):
- Base CSS for mobile (360-414px width)
- Breakpoints: 600px (tablet), 900px (PC)
- Flexbox/Grid for layouts
- No fixed widths; use max-width constraints
