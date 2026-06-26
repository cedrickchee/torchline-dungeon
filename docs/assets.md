# Asset Pipeline

## Principles

Runtime assets should be local, explicit, and validated.

The project avoids remote runtime dependencies for images and audio. Source art can be messy during production, but runtime assets should be packed, named, referenced through manifests, and checked before they are used by the game.

## Directory Layout

```text
assets/
  atlas/       runtime atlases loaded by the game
  audio/       runtime audio files
  source/      source sheets, generated art, and production inputs
src/assets/
  manifest.ts           atlas images, frames, animations
  asset-loader.ts       browser loading
  validate-manifest.ts  local validation
src/audio/
  manifest.ts           audio cue list
  mixer.ts              Web Audio playback
```

## Runtime Asset Groups

The current slice uses:

- Environment atlases for floor plates, wall kits, wall spans, doors, stairs, pillars, and props.
- Actor atlases for player and monsters.
- Loot frames for gold, potions, weapons, armor, and charms.
- UI atlas frames for panels and skill icons.
- FX frames for bloom, embers, fog, hits, pickups, and loot feedback.
- Local Ogg audio for ambience, torch loop, footsteps, hits, loot, pause, save/load, shrine, buff, floor transition, and skill cues.

## Manifest Rules

Manifest entries should describe:

- Asset ID.
- Local path.
- Atlas size.
- Frame rectangle.
- Anchor/pivot.
- Tags.
- Animation frames, FPS, and loop behavior where relevant.

Validation should catch:

- Missing files.
- Atlas frames outside image bounds.
- Duplicate or broken frame references.
- Authored scene references without backing frames.
- Remote runtime asset URLs.

Run:

```sh
bun run validate:assets
```

## Actor Sprites

Actor sprites are fixed-camera billboard frames. Required states are:

- Idle.
- Run.
- Attack.
- Hit.
- Death.

Actors use 8 directions. Pivots should keep feet grounded and avoid frame drift. The engine adds contact shadows; actor sheets should not include baked floor ovals.

## Audio

Audio unlocks after the first click or key press. Missing audio should be reported but should not break gameplay.

Audio cues are emitted from gameplay/effect events and routed by the mixer. Ambience and SFX are separate gain groups so pause can duck ambience.

## Generating Assets

Use:

```sh
bun run generate:assets
```

Then run:

```sh
bun run validate:assets
bun run test
```

Generated or AI-assisted art should be treated as raw input until it has clean alpha, stable scale, correct pivots, and a validated runtime manifest entry.

## Asset Provenance

- Confirm all assets are owned by the project or licensed for distribution.
- Keep source prompts or source files where useful for provenance.
- Do not use the concept image as a texture source.
- Document any third-party asset licenses.
- Make sure all runtime assets are committed and referenced locally.
