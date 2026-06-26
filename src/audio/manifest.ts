import type { AudioCueId } from "../core/types";

export type AudioCue = {
  id: AudioCueId;
  path: string;
  category: "ambience" | "sfx";
  volume: number;
  loop: boolean;
  preload: boolean;
};

const audioUrl = (name: string): string => new URL(`../../assets/audio/${name}.ogg`, import.meta.url).href;

export const audioManifest: AudioCue[] = [
  { id: "ambience-crypt-loop", path: audioUrl("ambience-crypt-loop"), category: "ambience", volume: 0.28, loop: true, preload: true },
  { id: "torch-loop", path: audioUrl("torch-loop"), category: "ambience", volume: 0.2, loop: true, preload: true },
  { id: "footstep-stone-1", path: audioUrl("footstep-stone-1"), category: "sfx", volume: 0.28, loop: false, preload: true },
  { id: "footstep-stone-2", path: audioUrl("footstep-stone-2"), category: "sfx", volume: 0.26, loop: false, preload: true },
  { id: "footstep-stone-3", path: audioUrl("footstep-stone-3"), category: "sfx", volume: 0.25, loop: false, preload: true },
  { id: "door-open", path: audioUrl("door-open"), category: "sfx", volume: 0.42, loop: false, preload: true },
  { id: "hit-light", path: audioUrl("hit-light"), category: "sfx", volume: 0.32, loop: false, preload: true },
  { id: "hit-heavy", path: audioUrl("hit-heavy"), category: "sfx", volume: 0.44, loop: false, preload: true },
  { id: "elite-alert", path: audioUrl("elite-alert"), category: "sfx", volume: 0.42, loop: false, preload: true },
  { id: "monster-death", path: audioUrl("monster-death"), category: "sfx", volume: 0.35, loop: false, preload: true },
  { id: "loot-pickup", path: audioUrl("loot-pickup"), category: "sfx", volume: 0.35, loop: false, preload: true },
  { id: "rare-item-drop", path: audioUrl("rare-item-drop"), category: "sfx", volume: 0.5, loop: false, preload: true },
  { id: "potion-drink", path: audioUrl("potion-drink"), category: "sfx", volume: 0.32, loop: false, preload: true },
  { id: "pause-open", path: audioUrl("pause-open"), category: "sfx", volume: 0.32, loop: false, preload: true },
  { id: "save-confirm", path: audioUrl("save-confirm"), category: "sfx", volume: 0.34, loop: false, preload: true },
  { id: "load-confirm", path: audioUrl("load-confirm"), category: "sfx", volume: 0.34, loop: false, preload: true },
  { id: "shrine-activate", path: audioUrl("shrine-activate"), category: "sfx", volume: 0.48, loop: false, preload: true },
  { id: "buff-expire", path: audioUrl("buff-expire"), category: "sfx", volume: 0.3, loop: false, preload: true },
  { id: "floor-transition", path: audioUrl("floor-transition"), category: "sfx", volume: 0.45, loop: false, preload: true },
  { id: "skill-select", path: audioUrl("skill-select"), category: "sfx", volume: 0.4, loop: false, preload: true }
];
