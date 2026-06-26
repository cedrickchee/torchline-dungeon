# Developer Guide

## Prerequisites

- Bun.
- A modern browser with WebGL support.
- Node-compatible tooling for TypeScript, Vite, Vitest, ESLint, and Prettier. The repo uses Bun to run scripts.

## Install

```sh
bun install
```

The repository includes `bun.lock`. Use Bun unless you are deliberately testing another package manager.

## Run Locally

```sh
bun run dev
```

Vite prints a local URL. Open it in a browser.

The game starts audio only after the first user gesture, which is required by browser autoplay policies.

## Scripts

| Command                   | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `bun run dev`             | Start the Vite dev server.                 |
| `bun run build`           | Create a production build in `dist/`.      |
| `bun run typecheck`       | Run TypeScript without emitting files.     |
| `bun run test`            | Run Vitest tests.                          |
| `bun run lint`            | Run ESLint.                                |
| `bun run format`          | Format files with Prettier.                |
| `bun run generate:assets` | Rebuild runtime assets from source sheets. |
| `bun run validate:assets` | Validate manifest paths and atlas bounds.  |

## Project Structure

```text
src/main.ts                  browser entry point, frame loop, save/load, QA hook
src/core/game.ts             core simulation and command handling
src/core/types.ts            shared state and action types
src/core/persistence.ts      save serialization and loading
src/core/items.ts            item generation, rarity, affixes, comparison text
src/core/elites.ts           elite monster modifiers
src/core/shrines.ts          shrine definitions and buffs
src/core/replay.ts           command replay state
src/scene/floor-one.ts       authored scene spec
src/scene/navigation.ts      floor-one navigation and collision helpers
src/render/three-renderer.ts Three.js renderer and input hit tests
src/render/actor-sprites.ts  actor animation frame resolution
src/assets/manifest.ts       atlas images, frames, and animations
src/audio/mixer.ts           Web Audio mixer
src/ui/hud.ts                DOM HUD controller
src/tests/                   Vitest tests
```

## Runtime Flow

1. `src/main.ts` creates the game, renderer, audio mixer, HUD, and frame stats.
2. User input dispatches typed `GameAction` commands.
3. `TorchlineGame` updates serializable game state.
4. Effects are drained and passed to audio/rendering.
5. `ThreeRenderer` renders the current state.
6. HUD updates only when state changes or debug cadence requires it.

## QA Hook

The browser exposes `window.__torchlineQa` for automation and manual diagnostics.

Useful calls from DevTools:

```js
window.__torchlineQa.state();
window.__torchlineQa.metrics();
window.__torchlineQa.dispatch({ type: "pause" });
window.__torchlineQa.advance(1000);
window.__torchlineQa.killPlayer();
window.__torchlineQa.resetMetrics();
```

The hook is intended for smoke tests, screenshots, performance checks, and reproducible debugging.

## Save Data

The current local save key is `torchline-dungeon-save-v1`.

Save data is JSON-compatible and versioned. It includes player state, dungeon arrays, monsters, items, shrines, buffs, replay metadata, and progress counters. It must not include Three.js objects, DOM nodes, loaded images, audio buffers, or browser event objects.

## Common Development Tasks

### Add A Gameplay Action

1. Add the action to `GameAction` in `src/core/types.ts`.
2. Handle it in `TorchlineGame.dispatch`.
3. Record it through replay when needed.
4. Add tests for state changes and edge cases.
5. Update HUD, input, and docs if it is user-facing.

### Add A Runtime Asset

1. Add or generate the source asset under `assets/source/`.
2. Pack or generate the runtime atlas under `assets/atlas/`.
3. Add frames or animations in `src/assets/manifest.ts`.
4. Run `bun run validate:assets`.
5. Add tests if authored scene data depends on the new frame.

### Add A Scene Object

1. Add data to `src/scene/floor-one.ts`.
2. Add collision or navigation data in `src/scene/navigation.ts` if it blocks movement.
3. Render it in `src/render/three-renderer.ts`.
4. Validate that pointer hit testing, depth, and occlusion still behave.

## Troubleshooting

- Blank screen: check browser console, then run `bun run typecheck` and `bun run build`.
- No audio: click or press a key once to unlock Web Audio.
- Missing assets: open debug overlay or call `window.__torchlineQa.state()` and check messages; then run `bun run validate:assets`.
- Unexpected save behavior: clear local storage for the dev origin or restart with a new seed through the QA hook.
- Slow frames: enable debug overlay and inspect `window.__torchlineQa.metrics()`.
