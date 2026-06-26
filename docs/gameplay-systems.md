# Gameplay Systems

## Core Loop

The slice is built around a compact ARPG loop: move through a fixed-camera chamber, fight in real time, collect loot, use shrine buffs, make small equipment decisions, and progress through stairs or skill choices.

The important product choice is that the game should feel like an action RPG, not a dressed-up grid roguelike. That is why pointer movement, continuous position, attack cooldowns, hit feedback, loot drops, and authored visual staging matter more than adding more generated rooms early.

## Torch Identity

The torch is not only a light source. It is the game's main identity hook.

Torchlight supports:

- Scene readability.
- Fog memory.
- Gothic mood.
- Pressure from darkness.
- Future mechanics around light radius, fear, shrine buffs, and item affixes.

Systems that affect visibility should preserve this identity instead of treating fog as a generic map-reveal feature.

## Authored Floor One

Floor one is authored because the first job is to prove the intended feel. A procedural layout can create more content, but it cannot guarantee composition, sightlines, encounter pacing, or clean wall and prop placement.

The authored scene gives direct control over:

- Camera composition.
- Walkable space and blockers.
- Wall runs, doors, pillars, stairs, and foreground occluders.
- Light and fog placement.
- Monster, loot, and shrine staging.

Procedural generation can return later, but it should emit scene-aware data rather than only tile arrays.

## Combat And Monsters

Combat should be readable before it is deep. Monsters need clear states, obvious threat roles, and visible feedback when they chase, attack, take hits, die, or drop loot.

Current monster identities:

- Gutter Fiend: fast melee pressure.
- Bone Warden: tougher guard.
- Ash Chanter: caster threat.

Elite modifiers should stay simple enough to understand on sight. Their job is to change a fight and improve reward drama, not create dense modifier parsing.

## Loot And Items

Loot exists to make small, immediate decisions meaningful. Gold, potions, weapons, armor, and charms cover the slice without requiring a full inventory economy.

Gear uses deterministic rarity and affix rolls because reproducible item generation helps testing, save/load, and replay. Current affix themes are ember, warded, keen, gravebound, lucent, vampiric, and swift.

Rarity presentation should be visible in the world and understandable in the UI. A rare drop should feel different before the player reads a tooltip.

## Shrines And Progression

Shrines are timed local power spikes. They add variety without requiring permanent meta progression.

Current shrine themes are ember, coin, warden, fleet, and sight. Each should have clear activation feedback, visible buff state, and an expiration moment.

Progression currently uses XP, level-ups, skill choices, and stairs. The skill trees are Flame, Steel, Shadow, and Survival. The first slice uses a default torchbearer archetype; class selection can wait until the slice feel is proven.

## Pause, Death, Save, And Replay

Pause must freeze simulation while leaving UI responsive because the game is real time.

Save/load must serialize only game state so rendering, audio, and DOM details can be rebuilt safely.

Replay records command intents and timing because visual and combat bugs need short reproducible sequences. It is a debugging tool first, not a multiplayer determinism promise.
