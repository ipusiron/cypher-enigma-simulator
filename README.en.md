<!--
---
id: day108
slug: cypher-enigma-simulator

title: "Cypher Enigma Simulator"

subtitle_ja: "暗号解読ゲーム「Cypher」用の簡易エニグマシミュレーター"
subtitle_en: "Simplified Enigma simulator for the Cypher puzzle game"

description_ja: "Cypher系パズルの簡略エニグマを再現し、信号経路・初期位置探索・Enigma I教育サブセットとの差を検証する日英対応の学習ツール"
description_en: "A bilingual tool for studying Cypher-style Enigma puzzles, initial-position searches, and differences from an Enigma I educational subset"

category_ja:
  - 古典暗号
  - 機械式暗号
  - シミュレーター
category_en:
  - Classical Cryptography
  - Mechanised Cryptography
  - Simulator

difficulty: 4

tags:
  - enigma
  - cipher
  - puzzle
  - cryptography
  - vanilla-js
  - simulator

repo_url: "https://github.com/ipusiron/cypher-enigma-simulator"
demo_url: "https://ipusiron.github.io/cypher-enigma-simulator/"

hub: true
---
-->

# Cypher Enigma Simulator - simplified Enigma learning tool for the puzzle game Cypher

![GitHub Repo stars](https://img.shields.io/github/stars/ipusiron/cypher-enigma-simulator?style=social)
![GitHub forks](https://img.shields.io/github/forks/ipusiron/cypher-enigma-simulator?style=social)
![GitHub last commit](https://img.shields.io/github/last-commit/ipusiron/cypher-enigma-simulator)
![GitHub license](https://img.shields.io/github/license/ipusiron/cypher-enigma-simulator)
[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue?logo=github)](https://ipusiron.github.io/cypher-enigma-simulator/)

**Day108 - Security Tools with Generative AI 200**

This browser-only learning tool reproduces a Cypher-style Enigma machine and lets you inspect each letter's signal path and search for initial positions.

**Important:** The Encrypt / decrypt tab follows the simplified Cypher puzzle model. The Model comparison tab demonstrates the differences from an Enigma I educational subset with ring settings and double-stepping, but it is not a complete machine or military-procedure simulation.

[日本語版README](README.md)

---

## 🌐 Demo

👉 **[https://ipusiron.github.io/cypher-enigma-simulator/](https://ipusiron.github.io/cypher-enigma-simulator/)**

The tool runs directly in a browser.

---

## 📸 Screenshots

> ![Machine settings](assets/screenshot1.png)
>
> *Machine settings*

> ![Processing trace](assets/screenshot2.png)
>
> *Processing trace*

> ![Known-plaintext initial-position search](assets/screenshot3.png)
>
> *Initial-position search with progress and per-clue candidate reduction*

> ![Simplified model and Enigma I educational subset comparison](assets/screenshot4.png)
>
> *Keypress-by-keypress comparison of a known vector, ring settings, and double-stepping*

---

## ✨ Features

### Encryption and decryption

- Bidirectional plugboard letter pairs
- One to three scramblers with Enigma I-V presets
- Drag, touch, and keyboard reordering
- Configurable notch positions and an odometer-style fallback when a notch is disabled
- Reflector B/C presets and strict validation of custom reflectors
- Explicit separation between a reflector round trip and a reflectorless direct experiment
- Forward encryption and inverse decryption for the direct experiment

### Inspection and utilities

- Per-letter processing trace with the post-step positions and each component transition
- Automatic setting storage in `localStorage`
- Shareable settings URL
- Japanese/English UI with remembered language selection
- Copy controls for output and traces
- Mobile-first layout from 320px and keyboard-accessible controls

### Known-plaintext initial-position search

- Searches the starting positions when wiring and some plaintext letters are known
- Search spaces of 26, 676, or 17,576 combinations for one, two, or three scramblers
- Accepts multiple separated known-plaintext letters
- Searches in asynchronous batches of 64 with progress and cancellation
- Shows how each added known letter reduces the candidate set
- Counts every match while retaining only the first 100 for display
- Generates a candidate's detailed processing trace only when its disclosure is opened
- Applies a selected candidate to the main tab only after confirmation

The candidates satisfy the supplied conditions. They do not prove the correct answer or recover unknown wiring or a complete historical key.
If a search is cancelled, the displayed candidates and narrowing counts cover only the combinations already checked. Candidate order and counts are not probabilities, confidence scores, or accuracy measurements.

### Model comparison

- Compares the Cypher-oriented simplified model with an Enigma I educational subset under the same settings
- Offers rotors I-V, reflectors B/C, starting positions, and ring settings
- Reproduces the known vector `AAAAA → BDZGO` with one action
- Shows the middle-rotor double-step in the position sequence `ADU → ADV → AEW → BFX`
- Compares positions before and after each keypress, the stepping reason, and both output letters
- Counts the output differences from the AAA-ring baseline

---

## 📖 Usage

### 1. Configure the machine

1. Enable the plugboard and any scramblers you need.
2. Select a preset or enter a 26-letter permutation.
3. Enter each starting position from A to Z.
4. Configure the simplified notch behaviour if needed.
5. Keep the reflector on for the Cypher/Enigma-style round trip, or turn it off for the direct experiment.
6. Reorder scramblers with the handle, touch dragging, or arrow keys.

### 2. Process text

1. Enter up to 20,000 characters.
2. Select **Process**.
3. Inspect both the output and the per-letter trace.

Only A-Z letters are transformed. Spaces, digits, punctuation, and other characters pass through without advancing the scramblers.

### 3. Search from known plaintext

1. Open **Analysis aid**.
2. Enter the known plugboard, scrambler, and reflector settings.
3. Enter up to 200 ciphertext characters.
4. Fill in only the plaintext letters whose positions are known.
5. Select **Run search** and monitor checked combinations, total combinations, and matches. Use **Cancel search** if needed.
6. Compare the narrowing table to see how many candidates each additional known letter eliminates.
7. Open a candidate only when you need its detailed processing trace, or apply it to the main tab after confirmation.

### 4. Compare the models

1. Open **Model comparison**.
2. Select **Known vector (AAAAA)** to verify `BDZGO` with rotors I-II-III, starting positions AAA, rings AAA, and reflector B.
3. Select **Double-step example (ADU)** and confirm that the educational subset moves through `ADV → AEW → BFX`.
4. Change the rotors, starting positions, rings, reflector, or input of up to 40 letters, then select **Compare**.
5. Inspect the output differences, the AAA-ring baseline count, and the keypress timeline.

The comparison model omits the plugboard and operational procedures such as daily and message keys. It is a deliberately bounded teaching model for observing differences, not a complete historical machine.

---

## 🔬 Signal paths

### Reflector on

```text
Input → Plugboard → Scrambler (1→2→3) → Reflector → Scrambler (3→2→1) → Plugboard → Output
```

A valid reflector is self-inverse and fixed-point-free. With identical starting settings, the same operation encrypts and decrypts. The mode labels describe the user's intent; the path and leftward stepping are the same.

### Reflector off: direct experiment

```text
Encrypt: Input → Plugboard → Scrambler (1→2→3) → Plugboard → Output
Decrypt: Input → Plugboard → inverse Scrambler (3→2→1) → Plugboard → Output
```

The first scrambler advances left before every processed letter in both modes. Decryption reverses the signal path instead of reversing the stepping direction, so the same initial settings make the two operations inverses. This direct path is a teaching experiment, not a historical Enigma configuration.

---

## 🔔 Simplified stepping and notches

- The first active scrambler advances before every A-Z letter.
- If its previous position equals the configured notch, crossing to the next letter advances the following scrambler.
- With a notch disabled, the following scrambler advances on the Z-to-A wrap.
- The cascade can continue through the third scrambler.
- Historical double-stepping is not simulated.

For example, a first scrambler at C with notch C moves to D before the next letter is processed, and the second scrambler advances from A to B.

---

## ⚙️ Bundled wirings

### Scramblers

| Name | Wiring |
|---|---|
| Enigma I | `EKMFLGDQVZNTOWYHXUSPAIBRCJ` |
| Enigma II | `AJDKSIRUXBLHWTMCQGZNPYFVOE` |
| Enigma III | `BDFHJLCPRTXVZNYEIWGAKMUSQO` |
| Enigma IV | `ESOVPZJAYQUIRHXLNFTGKDCMWB` |
| Enigma V | `VZBRGITYUPSDNHLXAWMJQOFECK` |

### Reflectors

| Name | Wiring |
|---|---|
| Reflector B | `YRUHQSLDPXNGOKMIEBFZCWVJAT` |
| Reflector C | `FVPJIAOYEDRZXWGCTKUQSBNMHL` |

Custom reflector wiring must contain A-Z exactly once, map every letter back to itself after two applications, and contain no fixed point.

---

## 🎯 Use cases

### Uses specific to this tool

- **Trace the Cypher Puzzle 01 vector:** set scrambler wiring to `UWYGADFPVZBECKMTHXSLRINQOJ`, start at A, use Reflector B, and follow all five transitions from `ZYDNI` to `ULTRA`.
- **Observe the reflector invariant:** process `ULTRA → ZYDNI → ULTRA` with identical settings and see why the reflector path uses the same operation in both directions.
- **Compare a direct inverse:** disable the reflector and verify that forward encryption and inverse decryption return to the original text.
- **Inspect a notch boundary:** start the first scrambler at C with notch C and see the second scrambler move from A to B as the first crosses C to D.
- **Narrow initial positions from a crib:** search 26, 676, or 17,576 initial-position combinations and inspect why each returned candidate matched.

### Cypher walkthroughs

- [MECHANISED CRYPTOGRAPHY PUZZLE 01 (Cypher)](https://akademeia.info/?p=36324)
- [MECHANISED CRYPTOGRAPHY PUZZLE 02 (Cypher)](https://akademeia.info/?p=36348)
- [MECHANISED CRYPTOGRAPHY PUZZLE 03 (Cypher)](https://akademeia.info/?p=36372)

The tool also works as a compact teaching aid for permutations, inverse mappings, odometer-style stepping, custom-wiring validation, and trace-based implementation comparison.

---

## 📚 Model-comparison sources

The rotor wiring, notches, ring settings, and double-step behavior in the comparison tab are based on these period and research materials:

- [H.Dv.g. 14: Schlüsselanleitung zur Schlüsselmaschine Enigma (1940)](https://enigma.3d.pl/files/enigma-manual1940-german.pdf)
- [NSA: Introduction to Cryptology, Part VI](https://www.nsa.gov/portals/75/documents/news-features/declassified-documents/friedman-documents/lectures-speeches/FOLDER_179/41758629079776.pdf)
- [NSA Cryptographic Mathematics: Enigma Wiring](https://www.cryptomuseum.com/crypto/enigma/files/enigma_wiring_catalog.pdf)
- [David H. Hamer: Enigma: Actions Involved in the Double Stepping of the Middle Rotor](https://www.cryptomuseum.com/people/hamer/files/double_stepping.pdf)

The subset reproduces the major differences used by this lesson; it does not cover machine variants, a plugboard, key distribution, or message procedures.

---

## ⚠️ Limits

- No ring settings or double-step in the Encrypt / decrypt tab
- No plugboard in the Model comparison tab
- No faithful military Enigma operating procedure or machine variant
- No claim that a known-plaintext candidate is the unique or historically correct key
- No security use: this is an educational classical-cipher simulator

---

## 🔧 Local use and tests

```bash
git clone https://github.com/ipusiron/cypher-enigma-simulator.git
cd cypher-enigma-simulator

# Open index.html directly, or use any static HTTP server.

npm test
```

No third-party package is required.

---

## 📁 Directory structure

```text
cypher-enigma-simulator/
├── index.html              # Main page
├── style.css               # Responsive styles
├── logic.js                # DOM-independent cipher core
├── attack-core.js          # Batched search and candidate-narrowing calculations
├── comparison-core.js      # Enigma I educational subset and model comparison
├── messages.js             # Japanese and English UI messages
├── main.js                 # UI, persistence, position search, and model comparison
├── README.md               # Japanese documentation
├── README.en.md            # This document
├── LICENSE                 # MIT License
├── package.json            # Node.js test command
├── .github/workflows/
│   └── test.yml            # Test workflow for push and pull requests
├── test/
│   ├── attack-core.test.js # Batching, retention limit, narrowing counts
│   ├── comparison-core.test.js # Known vectors, rings, and double-stepping
│   ├── core.test.js        # Vectors, round trips, stepping, validation
│   └── ui-contract.test.js # Bilingual UI, CSP, responsive contracts
├── assets/                 # screenshot1.png through screenshot4.png
└── docs/
    ├── UI_SPEC.md          # UI specification
    └── DETAILED_SPEC.md    # Detailed behaviour
```

---

## 📄 License

See [LICENSE](LICENSE).

---

## 🛠️ About this project

This tool is part of the “Security Tools with Generative AI 200” project, which builds and publishes security-related learning tools with AI assistance over 100 days.

See the project page for the other tools:

🔗 [https://akademeia.info/?page_id=44607](https://akademeia.info/?page_id=44607)
