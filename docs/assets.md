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

## Image Generation Prompts

### Actor Sheet Spec

**Required Sheet Layout**

Generate one PNG per actor:

```txt
8 rows x 14 columns sprite sheet.
Rows are directions:
1 east
2 southeast
3 south
4 southwest
5 west
6 northwest
7 north
8 northeast

Columns are animations:
1-2 idle
3-6 run
7-9 attack
10-11 hit
12-14 death
```

#### Shared Prompt

Paste this base prompt, then append one actor block below:

```md
Create a complete game-ready pre-rendered sprite sheet for a fixed-camera torchlit gothic action RPG.

Reference image: use the provided Torchlit ARPG concept image only for mood, camera angle, lighting weight, dark gothic painterly quality, and ARPG readability. Do not copy exact characters or UI.

Output: one transparent PNG sprite sheet, or perfectly flat #00ff00 chroma-key background for later removal.

Sheet layout: exactly 8 rows x 14 columns. Equal-size cells. No labels, no text, no grid lines, no frame numbers.

Rows, top to bottom:
east, southeast, south, southwest, west, northwest, north, northeast.

Columns, left to right:
idle frame 1, idle frame 2,
run frame 1, run frame 2, run frame 3, run frame 4,
attack frame 1, attack frame 2, attack frame 3,
hit frame 1, hit frame 2,
death frame 1, death frame 2, death frame 3.

Camera: fixed isometric/top-down ARPG angle, about 3/4 overhead, consistent across every frame.
Frame constraints: full body visible in every cell, feet visible, centered foot pivot, consistent scale, no cropping, no body drift, no baked floor shadow, no oval base, no background scene.
Animation constraints: stable identity and costume across all frames, readable run cycle, clear attack anticipation/strike/recovery, clear hit reaction, clear death fall/collapse sequence.
Lighting: warm torch key light from lower front/right, subtle cold blue rim from upper left, high contrast, sharp silhouette.
Style: highly polished dark fantasy painted sprite, gritty dungeon mood, sharp details, not cartoon, not low-poly, not pixel art.
Avoid: motion blur, blurry painterly mush, white halo, black halo, smoke covering the body, duplicate pasted frames, inconsistent weapons, inconsistent face/costume, text, watermark.
```

**Player Actor Block**

```md
Subject: a lone torchbearer adventurer, hooded and armored in dark leather and worn iron, carrying a bright hand torch and a short blade. Face mostly hidden in shadow with small warm eye glints. Heroic but grounded silhouette, ragged cloak edges, readable armor plates, vivid orange torch flame that never hides the body.
```

**Gutter Fiend Block**

```
Subject: a small fast melee dungeon fiend, hunched and sinewy, reddish raw skin, clawed hands, gaunt skull-like face, aggressive low silhouette. Quick swarming enemy, not cute, not bulky. Sharp claws, bony ridges, ember-lit skin highlights, cold shadowed back planes.
```

**Bone Warden Block**

```
Subject: a skeletal guard enemy in broken gothic armor, carrying a round shield and spear or rusted blade. Tall readable ribcage and skull, iron pauldrons, aged bone, tarnished metal, defensive stance. Tough melee guard with clear shield, clear weapon, sharp silhouette.
```

**Ash Chanter Block**

```
Subject: a robed undead caster, tall and narrow, dark tattered robes, bone mask or skull face, staff or censer with cyan-blue ghost light. Occult and threatening, cold spectral accents contrasting warm torchlight. Robe silhouette readable, staff hand clear, no large fog clouds hiding the body.
```

If the image generator struggles with the 8x14 sheet, split by actor animation next, not by direction. But try the full 8x14 sheet first.

#### Save Targets

Use these paths when you save the outputs:

```
assets/source/actor-sheets/player-torchbearer.png
assets/source/actor-sheets/gutter-fiend.png
assets/source/actor-sheets/bone-warden.png
assets/source/actor-sheets/ash-chanter.png
```

### Environment Sheet

#### Floor Plates Prompt

Replace the procedural/tile-like floor read with painted stone mass.

```md
Create a game-ready painted dungeon floor texture sheet for a fixed-camera torchlit gothic action RPG.

Reference image: use the Torchlit ARPG concept only for mood, lighting weight, gothic stone richness, and painterly material quality. Do not copy exact content.

Output: transparent PNG or flat #00ff00 chroma-key background.
Sheet layout: 4 rows x 6 columns, equal-size cells, no labels, no text, no grid lines.
Asset type: top-down/isometric painted floor plates and overlays.

Include:
- large dark stone floor plate variants
- cracked flagstone slabs
- chipped broken stone edges
- grime and soot overlays
- blood stains
- bone dust / ash patches
- small rubble scatter
- subtle occult/rune floor markings
- darker foreground shadow overlays

Style: highly detailed painterly dark fantasy stone, warm torch highlights, cold blue rim shadows, gritty but readable at game scale.
Constraints: no perspective scene background, no walls, no characters, no UI, no text, no watermark. Each cell should be usable as a separate game texture/decal.
```

#### Wall / Arch / Door Kit Prompt

Make the chamber walls and openings feel like contiguous gothic architecture rather than simple blocks.

```md
Create a game-ready wall, arch, and door asset kit for a fixed-camera torchlit gothic action RPG.

Reference image: use the Torchlit ARPG concept only for mood, gothic architecture, stone richness, warm/cold lighting, and heavy carved detail. Do not copy exact content.

Output: transparent PNG or flat #00ff00 chroma-key background.
Sheet layout: 4 rows x 6 columns, equal-size cells, no labels, no text, no grid lines.
Asset type: isometric/front-facing wall dressing and architectural overlays for a locked ARPG camera.

Include:
- gothic stone wall face segments
- wall cap/top stone segments
- carved archway fronts
- side arch pieces
- closed heavy wooden/iron door
- open door variant
- broken wall chunks
- pillar/jamb pieces
- carved trim strips
- iron spikes/grates
- wall torch mount without flame
- red hanging banner / occult door banner

Style: dark painterly gothic stone, thick carved shapes, chipped edges, soot, grime, torchlit amber edges, cold blue shadow pockets.
Constraints: no full scene background, no characters, no UI, no text, no watermark. Assets should be separable, clean-edged, and usable as sprites/textures.
```

#### Props / Debris Prompt

Add concept density: bones, candles, rubble, gold piles, occult clutter.

```md
Create a game-ready dungeon prop and debris sheet for a fixed-camera torchlit gothic action RPG.

Reference image: use the Torchlit ARPG concept only for mood, prop density, gothic dungeon clutter, torchlit material quality, and painterly detail. Do not copy exact content.

Output: transparent PNG or flat #00ff00 chroma-key background.
Sheet layout: 4 rows x 6 columns, equal-size cells, no labels, no text, no grid lines.
Asset type: isometric prop sprites and ground decals.

Include:
- candle clusters
- bone piles
- skull clusters
- broken stone rubble
- ash piles
- small blood smears
- scattered coins
- treasure pile
- occult pedestal
- brazier
- blue crystal obelisk
- broken crate/planks
- iron grate
- chain fragments
- torn banner pieces
- small corpse/remains silhouette, non-graphic

Style: painterly dark fantasy, sharp readable silhouettes, warm torch highlights, cold blue shadow accents, grounded and non-cartoon.
Constraints: no floor base baked underneath props, no oval shadows, no full background, no characters, no UI, no text, no watermark.
```

#### Save Targets

Use these paths when you save the outputs:

```
assets/source/environment-sheets/stone-floor-plates.png
assets/source/environment-sheets/wall-arch-door-kit.png
assets/source/environment-sheets/dungeon-props-debris.png
```

### Checklist Before Integrating Sprites

- Transparent PNG or clean flat chroma-key background.
- Full body visible, feet visible, no floor/base/shadow.
- Sharp at gameplay scale.
- Same isometric camera angle as the concept.
- Strong silhouette and readable weapon/tool.
- No pasted white/black halo around edges.
- No background scene baked into the asset.
