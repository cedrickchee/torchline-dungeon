# Testing

## Why These Checks Matter

The project depends on three things that are easy to break quietly: deterministic game state, authored scene data, and browser rendering. The checks below are meant to catch those failures before they become visual or save/load bugs.

## Local Checks

Run these after behavior, renderer, asset, or documentation changes:

```sh
bun run typecheck
bun run test
bun run build
bun run lint
bun run validate:assets
```

Use `bun run format` when editing many files or touching Markdown tables.

## Automated Coverage

Current Vitest coverage protects the systems most likely to regress:

- Dungeon reachability, doors, and line of sight.
- Deterministic item generation, affixes, and gear comparison.
- Combat, death, XP, and replay recording.
- Real-time animation locks and pause behavior.
- Authored floor-one interactables and navigation blockers.
- Shrine activation and buff expiration.
- Save/load round trips and invalid save handling.
- Actor sprite frame resolution.
- Asset manifest validity and authored scene art references.

## Browser QA

The game is visual and interactive, so unit tests are not enough. A browser pass should confirm:

- App loads without console errors.
- Desktop and mobile renders are nonblank.
- Click-to-move changes player position.
- Click-to-target starts combat.
- Pause freezes simulation.
- Save/load restores supported state.
- Audio starts after a click or key press.
- Torchlight, fog, actors, loot, and UI read clearly together.

## Performance Gate

The target for the slice is stable 30 FPS minimum in local Chrome.

Use the debug overlay or `window.__torchlineQa.metrics()` to inspect:

- FPS, average FPS, frame time, and p95 frame time.
- Slow frame count.
- Update and render time.
- Draw calls, triangles, and object count.
- Animated sprite and particle count.
- HUD render and skip counts.

Performance is part of the product feel. A scene that looks correct but regularly drops below the target still needs work.

## Persistent Risks

- Asset ownership and licenses must stay clear.
- Browser behavior should be checked on at least one desktop and one mobile viewport.
- The package name is currently `torchline-dungeon` while the repository directory is `dungeon-torch-crawler`; align naming if branding changes.
