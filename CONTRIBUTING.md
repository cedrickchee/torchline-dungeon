# Contributing

Thanks for helping improve Dungeon Torch Crawler.

This project values focused changes. The current priority is a polished torchlit ARPG vertical slice, not broad feature expansion.

## Start Here

1. Read [README.md](README.md).
2. Read [docs/Developer Guide](docs/developer-guide.md).
3. For product direction, read [docs/Product Background and Decisions](docs/product-background.md).

## Setup

```sh
bun install
bun run dev
```

Before opening a pull request, run:

```sh
bun run typecheck
bun run test
bun run build
bun run lint
bun run validate:assets
```

## Contribution Guidelines

- Keep gameplay state serializable.
- Do not put Three.js objects, DOM nodes, loaded images, audio buffers, or browser events into core state.
- Keep renderer code separate from combat and progression rules.
- Prefer typed manifests over ad hoc asset paths.
- Keep runtime assets local.
- Add or update tests for behavior changes.
- Update docs when user-facing controls, setup, or system boundaries change.
- Keep changes scoped. Avoid unrelated refactors in feature or bug-fix PRs.

## Good First Areas

- Documentation cleanup.
- Tests around existing systems.
- Small HUD accessibility or readability improvements.
- Asset manifest validation improvements.
- Browser QA scripts using the existing `window.__torchlineQa` hook.

## Product Guardrails

Do not add these to the first slice unless maintainers explicitly approve:

- Multiplayer.
- Free-camera controls.
- Backend persistence.
- Broad procedural content expansion.
- Large class systems.
- Unverified remote runtime assets.

The first slice should stay focused: one chamber, one camera, real-time movement and combat, readable dungeon art, loot, shrines, save/load, debug, and measured performance.
