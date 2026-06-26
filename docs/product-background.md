# Product Background and Decisions

## Overview

Dungeon Torch Crawler began as a playable dungeon prototype with roguelike systems: rooms, doors, fog of war, monsters, items, equipment, shrines, skills, audio, save/load, pause, debug state, and replay support.

The product direction changed because the earlier version still felt like a flat tile-board roguelike. The current direction is a fixed-camera torchlit action RPG slice: one dense chamber, real-time interaction, stronger visual depth, and integrated lighting, fog, actors, loot, and UI.

## Product Goal

Build one impressive vertical slice before expanding the game.

The slice should prove that the project can deliver:

- A readable gothic dungeon scene.
- Contiguous walls, doors, pillars, stairs, props, and occluders.
- Real-time click-to-move movement and click-to-target combat.
- Grounded animated characters.
- Torchlight and fog as identity, not decoration.
- Loot, shrines, elites, and item comparison.
- Save/load, pause, replay/debug, and browser QA hooks.
- Stable 30 FPS minimum in local Chrome.

## Core Product Decisions

### One Chamber First

The first playable slice should make one chamber feel excellent before adding procedural breadth. This keeps art, performance, combat feel, and UX measurable.

### Fixed Perspective Camera

The renderer uses a locked perspective camera. The camera does not rotate or zoom during normal play. This supports controlled composition, authored lighting, billboard actors, and optimized fixed-angle art.

### Three.js Primary Renderer

The old Canvas path exists in the repo, but the primary demo direction is Three.js. The renderer owns visual objects. Core gameplay state remains serializable and renderer-independent.

### Click-To-Move ARPG Feel

Mouse movement and targeting are the main interaction model. Keyboard input remains useful for abilities, debug, pause, and testing, but the product should not feel like a turn-based grid game.

### Single Player Now

Networking is out of scope for the vertical slice. The code still keeps future options open by preserving command intents, replay data, serializable state, and renderer separation.

### Local Runtime Assets

Runtime art and audio are local to the project. The game should not depend on remote image, audio, or CDN assets at runtime.

### Deterministic Where Useful

Seeded RNG, replay logs, and serializable saves make bugs easier to reproduce. The goal is practical reproducibility, not full multiplayer lockstep determinism.

## What This Is Not

This is not yet:

- A complete campaign.
- A procedural content platform.
- A multiplayer game.
- A live-service backend.
- A general 3D free-camera engine.
- A clone of any existing ARPG.

The project borrows broad ARPG values such as loot, readable combat, elites, shrines, and build choices while keeping original naming, mechanics, art direction, and identity.

## Roadmap Direction

Near-term work should strengthen the slice:

- Tighten combat feel and enemy readability.
- Improve visual integration of actors, props, lights, fog, and HUD.
- Expand QA around browser interaction and performance.
- Confirm asset provenance and licenses.
- Keep docs aligned with implementation changes.

Later work can add:

- More floors using the same visual grammar.
- Procedural layouts that emit authored scene data.
- Additional classes and skill loadouts.
- More item powers, affixes, and rarity tiers.
- Boss encounters, hazards, traps, and deeper progression.
- Multiplayer investigation after the single-player slice is stable.
