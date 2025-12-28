# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cypher Enigma Simulator - a simplified Enigma-style cipher simulator for solving and analyzing Cypher puzzle challenges. This is an educational/analytical tool, NOT a historically accurate Enigma machine.

**Intentionally omitted features:** Ring settings, notches/double-stepping, military variants.

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
- **Scramblers (1-3)**: Each has 26-char wiring and starting position (A-Z)
- **Reflector**: 26-char substitution string (self-inverse)

### Mode Difference

- Encrypt: rotors rotate right (+1)
- Decrypt: rotors rotate left (-1)

### Character Handling

- Target: A-Z uppercase only
- Non-alphabetic characters pass through unchanged

## UI Skills

This project uses mobile-first web UI design principles (see `.claude/skills/mobile-first-web-ui/SKILL.md`):
- Base CSS for mobile (360-414px width)
- Breakpoints: 600px (tablet), 900px (PC)
- Flexbox/Grid for layouts
- No fixed widths; use max-width constraints
