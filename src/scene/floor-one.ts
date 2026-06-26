import type { MonsterKind, Point, ShrineKind, Slot } from "../core/types";

export const FLOOR_ONE_SCENE_ID = "floor-one-torchlit-undercroft";

export type SceneCameraSpec = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  near: number;
  far: number;
};

export type ScenePropSpec = {
  id: string;
  frame: string;
  x: number;
  y: number;
  scale: number;
  height?: number;
  light?: {
    color: number;
    intensity: number;
    distance: number;
  };
};

export type SceneRect = {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type SceneCircle = {
  id: string;
  x: number;
  y: number;
  radius: number;
};

export type SceneFloorDecalSpec = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  color: number;
  opacity: number;
  rotation?: number;
  kind?: "ellipse" | "rect";
};

export type SceneFogBandSpec = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  color: number;
  opacity: number;
  rotation?: number;
  lift?: number;
};

export type ScenePillarSpec = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  color: number;
  topColor: number;
};

export type SceneRubbleClusterSpec = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  count: number;
  color: number;
  accentColor?: number;
  rotation?: number;
};

export type SceneDressingClusterSpec = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  count: number;
  rotation: number;
  stamp: string;
  color: number;
  accent: number;
  shadow: number;
  sprite: string;
};

export type SceneWallAccentSpec = {
  id: string;
  runId: string;
  kind: "warm" | "cold" | "shadow" | "rim";
  along: number;
  centerY: number;
  width: number;
  height: number;
  color: number;
  normalOffset?: number;
};

export type SceneWallRun = {
  id: string;
  from: Point;
  to: Point;
  height: number;
  thickness: number;
};

export type SceneDoorSpec = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  closedFrame: string;
  openFrame: string;
};

export type FloorOneSceneSpec = {
  id: string;
  worldScale: number;
  camera: SceneCameraSpec;
  walkableBounds: SceneRect;
  propBlockers: SceneCircle[];
  floorDecals: SceneFloorDecalSpec[];
  fogBands: SceneFogBandSpec[];
  pillars: ScenePillarSpec[];
  rubbleClusters: SceneRubbleClusterSpec[];
  dressingClusters: SceneDressingClusterSpec[];
  wallAccents: SceneWallAccentSpec[];
  wallDressing: ScenePropSpec[];
  doorways: SceneDoorSpec[];
  propPlacements: ScenePropSpec[];
  wallRuns: SceneWallRun[];
  torchPlacements: Point[];
  showcaseMonsters: { kind: MonsterKind; dx: number; dy: number; elite?: boolean }[];
  showcaseLoot: { forced: Slot | "potion" | "gold"; dx: number; dy: number; rare?: boolean }[];
  shrineHint: { kind: ShrineKind; dx: number; dy: number };
};

// Locked perspective authored against the concept: slight depth scaling, no rotation or user zoom.
export const floorOneScene: FloorOneSceneSpec = {
  id: FLOOR_ONE_SCENE_ID,
  worldScale: 1,
  camera: {
    position: [9.35, 11.45, 15.35],
    target: [0, 0.35, 0.72],
    fov: 35,
    near: 0.1,
    far: 90
  },
  walkableBounds: { id: "main-chamber", minX: -8.05, minY: -5.95, maxX: 8.05, maxY: 6.05 },
  propBlockers: [
    { id: "north-brazier", x: 0.1, y: -4.7, radius: 0.68 },
    { id: "blue-obelisk", x: -5.5, y: -3.8, radius: 0.58 },
    { id: "candles-west", x: -6.4, y: 0.1, radius: 0.32 },
    { id: "candles-east", x: 6.4, y: 0.2, radius: 0.32 },
    { id: "skulls", x: -3.8, y: 3.5, radius: 0.36 },
    { id: "bones", x: 2.7, y: 3.8, radius: 0.38 },
    { id: "treasure", x: 5.7, y: 2.8, radius: 0.55 },
    { id: "northwest-pillar", x: -6.9, y: -4.9, radius: 0.48 },
    { id: "northeast-pillar", x: 6.9, y: -4.8, radius: 0.48 },
    { id: "foreground-left-pier", x: -2.45, y: 5.95, radius: 0.52 },
    { id: "foreground-right-pier", x: 3.55, y: 5.85, radius: 0.52 }
  ],
  floorDecals: [
    {
      id: "center-warm-pool",
      x: 0.4,
      y: -0.2,
      width: 5.8,
      depth: 2.9,
      color: 0x8e5228,
      opacity: 0.16,
      rotation: -0.22
    },
    {
      id: "player-stage-warmth",
      x: -0.2,
      y: 1.2,
      width: 4.8,
      depth: 2.25,
      color: 0x8a552b,
      opacity: 0.1,
      rotation: -0.18
    },
    {
      id: "foreground-shadow",
      x: 1.2,
      y: 5.8,
      width: 10.8,
      depth: 2.4,
      color: 0x030303,
      opacity: 0.34,
      rotation: 0.04
    },
    {
      id: "north-cold-shadow",
      x: -3.7,
      y: -4.2,
      width: 6.2,
      depth: 2.0,
      color: 0x071014,
      opacity: 0.24,
      rotation: 0.18
    },
    {
      id: "blood-smear-west",
      x: -2.8,
      y: 0.8,
      width: 2.5,
      depth: 1.1,
      color: 0xb03f35,
      opacity: 0.24,
      rotation: -0.3
    },
    {
      id: "blood-thread-north",
      x: -1.25,
      y: -2.65,
      width: 3.2,
      depth: 0.74,
      color: 0x8f2d25,
      opacity: 0.2,
      rotation: 0.18
    },
    {
      id: "ash-stain-east",
      x: 3.1,
      y: -1.6,
      width: 2.1,
      depth: 0.8,
      color: 0x6f572f,
      opacity: 0.18,
      rotation: 0.35
    },
    {
      id: "chanter-miasma",
      x: 3.75,
      y: -1.1,
      width: 3.2,
      depth: 1.2,
      color: 0x4e6a2f,
      opacity: 0.2,
      rotation: 0.1
    },
    {
      id: "blackened-rune-field",
      x: 0.7,
      y: 2.4,
      width: 2.8,
      depth: 1.0,
      color: 0x0b0b09,
      opacity: 0.2,
      rotation: 0.2
    },
    {
      id: "stair-fog-shadow",
      x: 5.7,
      y: 4.3,
      width: 3.4,
      depth: 1.8,
      color: 0x02161a,
      opacity: 0.24,
      rotation: -0.18
    },
    {
      id: "stairwell-drop-shadow",
      x: 6.35,
      y: 5.45,
      width: 4.3,
      depth: 2.1,
      color: 0x010303,
      opacity: 0.38,
      rotation: -0.16
    },
    {
      id: "door-grime",
      x: -7.2,
      y: -4.1,
      width: 2.4,
      depth: 1.4,
      color: 0x0b0a08,
      opacity: 0.26,
      rotation: 0.12
    },
    {
      id: "loot-warmth",
      x: 4.9,
      y: 2.3,
      width: 3.2,
      depth: 1.5,
      color: 0xa46724,
      opacity: 0.18,
      rotation: -0.4
    },
    {
      id: "southwest-rubble-shadow",
      x: -5.7,
      y: 4.5,
      width: 3.7,
      depth: 1.2,
      color: 0x030303,
      opacity: 0.27,
      rotation: -0.25
    }
  ],
  fogBands: [
    {
      id: "northwest-blue-haze",
      x: -6.8,
      y: -5.6,
      width: 5.4,
      depth: 1.9,
      color: 0x31535d,
      opacity: 0.28,
      rotation: 0.08,
      lift: 0.052
    },
    {
      id: "east-stair-mist",
      x: 7.4,
      y: 5.2,
      width: 5.2,
      depth: 2.2,
      color: 0x27434a,
      opacity: 0.31,
      rotation: -0.18,
      lift: 0.056
    },
    {
      id: "north-brazier-smoke",
      x: 4.8,
      y: -5.8,
      width: 3.8,
      depth: 1.35,
      color: 0x36515a,
      opacity: 0.23,
      rotation: -0.2,
      lift: 0.058
    },
    {
      id: "west-door-fog",
      x: -7.6,
      y: 2.8,
      width: 3.6,
      depth: 1.25,
      color: 0x263f46,
      opacity: 0.22,
      rotation: 0.32,
      lift: 0.054
    },
    {
      id: "foreground-cold-mist",
      x: 1.4,
      y: 5.9,
      width: 5.4,
      depth: 1.45,
      color: 0x1f3940,
      opacity: 0.3,
      rotation: 0.04,
      lift: 0.058
    },
    {
      id: "center-low-smoke",
      x: -1.0,
      y: 0.6,
      width: 4.6,
      depth: 1.35,
      color: 0x172c31,
      opacity: 0.08,
      rotation: -0.28,
      lift: 0.05
    },
    {
      id: "obelisk-cold-pool",
      x: -5.2,
      y: -3.2,
      width: 2.6,
      depth: 1.35,
      color: 0x2c6b78,
      opacity: 0.24,
      rotation: 0.16,
      lift: 0.062
    },
    {
      id: "treasure-smoke",
      x: 5.4,
      y: 2.8,
      width: 3.4,
      depth: 1.4,
      color: 0x34332b,
      opacity: 0.13,
      rotation: -0.38,
      lift: 0.052
    },
    {
      id: "upper-black-void",
      x: -1.2,
      y: -6.2,
      width: 10.4,
      depth: 1.35,
      color: 0x020303,
      opacity: 0.24,
      rotation: 0.03,
      lift: 0.06
    },
    {
      id: "chanter-green-smoke",
      x: 3.2,
      y: -0.9,
      width: 3.9,
      depth: 1.25,
      color: 0x4f6932,
      opacity: 0.13,
      rotation: -0.2,
      lift: 0.064
    },
    {
      id: "stairwell-teal-depth",
      x: 6.3,
      y: 5.75,
      width: 4.0,
      depth: 1.75,
      color: 0x1e5e62,
      opacity: 0.27,
      rotation: -0.22,
      lift: 0.066
    }
  ],
  pillars: [
    {
      id: "northwest-pillar",
      x: -6.9,
      y: -4.9,
      width: 0.65,
      depth: 0.78,
      height: 2.15,
      color: 0x18130f,
      topColor: 0x3b3327
    },
    {
      id: "northeast-pillar",
      x: 6.9,
      y: -4.8,
      width: 0.68,
      depth: 0.8,
      height: 2.25,
      color: 0x1b1510,
      topColor: 0x463a2c
    },
    {
      id: "foreground-left-pier",
      x: -2.45,
      y: 5.95,
      width: 0.78,
      depth: 1.0,
      height: 2.05,
      color: 0x120f0c,
      topColor: 0x382e24
    },
    {
      id: "foreground-right-pier",
      x: 3.55,
      y: 5.85,
      width: 0.78,
      depth: 1.0,
      height: 2.0,
      color: 0x120f0c,
      topColor: 0x382e24
    },
    {
      id: "north-altar-left",
      x: -2.05,
      y: -5.7,
      width: 0.48,
      depth: 0.62,
      height: 1.75,
      color: 0x15100c,
      topColor: 0x4b3926
    },
    {
      id: "north-altar-right",
      x: 2.12,
      y: -5.7,
      width: 0.48,
      depth: 0.62,
      height: 1.75,
      color: 0x15100c,
      topColor: 0x4b3926
    },
    {
      id: "stair-guard-left",
      x: 4.15,
      y: 5.15,
      width: 0.52,
      depth: 0.7,
      height: 1.2,
      color: 0x211a13,
      topColor: 0x4b3e2f
    },
    {
      id: "stair-guard-right",
      x: 6.55,
      y: 4.15,
      width: 0.52,
      depth: 0.7,
      height: 1.2,
      color: 0x211a13,
      topColor: 0x4b3e2f
    },
    {
      id: "west-door-jamb",
      x: -7.65,
      y: -3.45,
      width: 0.44,
      depth: 0.7,
      height: 1.55,
      color: 0x17110d,
      topColor: 0x4a3725
    }
  ],
  rubbleClusters: [
    {
      id: "west-door-bones",
      x: -6.95,
      y: -3.35,
      width: 1.65,
      depth: 0.85,
      count: 15,
      color: 0x5c554a,
      accentColor: 0xa88a5d,
      rotation: 0.12
    },
    {
      id: "north-altar-chips",
      x: 0.05,
      y: -3.75,
      width: 3.4,
      depth: 0.9,
      count: 18,
      color: 0x40362b,
      accentColor: 0x8a6540,
      rotation: -0.05
    },
    {
      id: "center-blood-rubble",
      x: -1.95,
      y: 0.75,
      width: 2.25,
      depth: 1.2,
      count: 14,
      color: 0x3d2a23,
      accentColor: 0x8f3a2e,
      rotation: -0.22
    },
    {
      id: "southwest-breakage",
      x: -5.65,
      y: 4.55,
      width: 2.8,
      depth: 1.1,
      count: 18,
      color: 0x2d2923,
      accentColor: 0x6c5c43,
      rotation: -0.32
    },
    {
      id: "foreground-fallen-stone",
      x: 1.2,
      y: 5.55,
      width: 4.2,
      depth: 0.92,
      count: 22,
      color: 0x29231c,
      accentColor: 0x71563a,
      rotation: 0.05
    },
    {
      id: "stairwell-scree",
      x: 5.85,
      y: 4.95,
      width: 2.55,
      depth: 1.15,
      count: 17,
      color: 0x302c26,
      accentColor: 0x6b5d4a,
      rotation: -0.22
    },
    {
      id: "east-wall-coins",
      x: 6.25,
      y: 2.6,
      width: 1.95,
      depth: 0.9,
      count: 13,
      color: 0x4c3920,
      accentColor: 0xd6a44b,
      rotation: -0.42
    },
    {
      id: "blue-shrine-shards",
      x: -5.35,
      y: -3.45,
      width: 1.45,
      depth: 0.8,
      count: 12,
      color: 0x2b4850,
      accentColor: 0x75c9e8,
      rotation: 0.16
    },
    {
      id: "north-wall-fallen-masonry",
      x: -4.1,
      y: -5.35,
      width: 2.7,
      depth: 0.78,
      count: 16,
      color: 0x2f281f,
      accentColor: 0x8f6740,
      rotation: 0.08
    },
    {
      id: "east-arch-scatter",
      x: 7.15,
      y: -0.8,
      width: 1.9,
      depth: 2.1,
      count: 14,
      color: 0x28231d,
      accentColor: 0x6e5132,
      rotation: -0.16
    },
    {
      id: "stairwell-cold-chips",
      x: 6.55,
      y: 5.45,
      width: 2.45,
      depth: 1.05,
      count: 15,
      color: 0x22383b,
      accentColor: 0x5bb9c4,
      rotation: -0.28
    }
  ],
  dressingClusters: [
    {
      id: "west-door-bone-spill",
      x: -6.4,
      y: -3.3,
      width: 2.1,
      depth: 1.0,
      count: 20,
      rotation: 0.12,
      stamp: "raster-floor-rubble",
      color: 0x6f5f4c,
      accent: 0xb38a56,
      shadow: 0x090605,
      sprite: "sprite-bones"
    },
    {
      id: "north-altar-skull-scatter",
      x: -1.5,
      y: -3.45,
      width: 3.8,
      depth: 1.15,
      count: 22,
      rotation: -0.08,
      stamp: "raster-floor-cracked",
      color: 0x534331,
      accent: 0xb66f32,
      shadow: 0x120806,
      sprite: "sprite-skulls"
    },
    {
      id: "center-blood-and-bones",
      x: -1.1,
      y: 0.85,
      width: 3.3,
      depth: 1.4,
      count: 26,
      rotation: -0.2,
      stamp: "raster-floor-rubble",
      color: 0x4d3027,
      accent: 0xb03f35,
      shadow: 0x100606,
      sprite: "sprite-bones"
    },
    {
      id: "chanter-plague-scatter",
      x: 3.8,
      y: -1.05,
      width: 3.1,
      depth: 1.25,
      count: 18,
      rotation: 0.18,
      stamp: "raster-floor-cracked",
      color: 0x4c4d35,
      accent: 0x7b9148,
      shadow: 0x10150b,
      sprite: "sprite-skulls"
    },
    {
      id: "east-loot-gold-spill",
      x: 5.8,
      y: 2.55,
      width: 2.5,
      depth: 1.2,
      count: 24,
      rotation: -0.38,
      stamp: "raster-floor-rubble",
      color: 0x5f431f,
      accent: 0xf1c86a,
      shadow: 0x100a04,
      sprite: "sprite-gold"
    },
    {
      id: "stairwell-cold-bones",
      x: 5.85,
      y: 4.75,
      width: 3.2,
      depth: 1.3,
      count: 20,
      rotation: -0.25,
      stamp: "raster-floor-grate",
      color: 0x30434a,
      accent: 0x75c9e8,
      shadow: 0x061013,
      sprite: "sprite-bones"
    },
    {
      id: "southwest-bone-breakage",
      x: -5.6,
      y: 4.5,
      width: 2.8,
      depth: 1.05,
      count: 18,
      rotation: -0.35,
      stamp: "raster-floor-rubble",
      color: 0x3c3328,
      accent: 0x8a7450,
      shadow: 0x070606,
      sprite: "sprite-bones"
    },
    {
      id: "foreground-skull-run",
      x: 0.8,
      y: 5.35,
      width: 4.6,
      depth: 1.0,
      count: 24,
      rotation: 0.06,
      stamp: "raster-floor-cracked",
      color: 0x3a3025,
      accent: 0xae7d42,
      shadow: 0x080504,
      sprite: "sprite-skulls"
    },
    {
      id: "center-ritual-aftermath",
      x: 0.38,
      y: 0.0,
      width: 4.45,
      depth: 1.65,
      count: 34,
      rotation: -0.16,
      stamp: "raster-floor-rune",
      color: 0x4b271f,
      accent: 0xd06932,
      shadow: 0x150705,
      sprite: "sprite-bones"
    },
    {
      id: "blue-obelisk-shattered-relics",
      x: -5.25,
      y: -2.95,
      width: 2.25,
      depth: 1.1,
      count: 22,
      rotation: 0.2,
      stamp: "raster-floor-cracked",
      color: 0x263f46,
      accent: 0x75c9e8,
      shadow: 0x061013,
      sprite: "sprite-skulls"
    },
    {
      id: "loot-beam-coin-field",
      x: 4.3,
      y: 2.95,
      width: 2.7,
      depth: 1.1,
      count: 28,
      rotation: -0.24,
      stamp: "raster-floor-rubble",
      color: 0x6d4b24,
      accent: 0xf1c86a,
      shadow: 0x110a03,
      sprite: "sprite-gold"
    },
    {
      id: "north-brazier-ash-fall",
      x: 0.7,
      y: -4.25,
      width: 4.2,
      depth: 0.88,
      count: 26,
      rotation: 0.04,
      stamp: "raster-floor-cracked",
      color: 0x443327,
      accent: 0xff8a36,
      shadow: 0x0d0704,
      sprite: "sprite-bones"
    }
  ],
  wallAccents: [
    {
      id: "north-altar-deep-red-recess",
      runId: "north",
      kind: "shadow",
      along: 0.05,
      centerY: 1.28,
      width: 2.35,
      height: 2.08,
      color: 0x160606,
      normalOffset: 1.08
    },
    {
      id: "north-altar-ember-wash",
      runId: "north",
      kind: "warm",
      along: 0.05,
      centerY: 1.26,
      width: 3.85,
      height: 2.32,
      color: 0xff5528,
      normalOffset: 1.12
    },
    {
      id: "north-altar-vertical-rim",
      runId: "north",
      kind: "rim",
      along: -0.72,
      centerY: 1.36,
      width: 0.18,
      height: 2.18,
      color: 0xffc079,
      normalOffset: 1.16
    },
    {
      id: "north-altar-right-rim",
      runId: "north",
      kind: "rim",
      along: 0.86,
      centerY: 1.36,
      width: 0.16,
      height: 2.06,
      color: 0xffb15f,
      normalOffset: 1.16
    },
    {
      id: "northwest-cold-recess",
      runId: "north",
      kind: "cold",
      along: -5.7,
      centerY: 1.12,
      width: 3.2,
      height: 1.86,
      color: 0x66c9d8,
      normalOffset: 1.1
    },
    {
      id: "west-door-lantern-wash",
      runId: "west-door-return",
      kind: "warm",
      along: -7.35,
      centerY: 0.98,
      width: 1.95,
      height: 1.52,
      color: 0xff9a3e,
      normalOffset: 1.02
    },
    {
      id: "west-rail-blue-smoke",
      runId: "west-rail",
      kind: "cold",
      along: 1.8,
      centerY: 1.04,
      width: 2.9,
      height: 1.52,
      color: 0x5ebdcc,
      normalOffset: 1.08
    },
    {
      id: "east-caster-amber-face",
      runId: "east",
      kind: "warm",
      along: -1.8,
      centerY: 1.02,
      width: 3.45,
      height: 1.86,
      color: 0xff9c48,
      normalOffset: 1.08
    },
    {
      id: "east-stair-teal-depth",
      runId: "east",
      kind: "cold",
      along: 4.4,
      centerY: 1.08,
      width: 3.0,
      height: 1.7,
      color: 0x55cbd5,
      normalOffset: 1.1
    },
    {
      id: "stairwell-ledge-cool-face",
      runId: "stairwell-ledge",
      kind: "cold",
      along: 5.7,
      centerY: 0.72,
      width: 2.4,
      height: 1.0,
      color: 0x44b7c5,
      normalOffset: 1.05
    },
    {
      id: "south-rail-ember-cut",
      runId: "south-rail",
      kind: "warm",
      along: 4.9,
      centerY: 0.74,
      width: 4.2,
      height: 1.06,
      color: 0xdd7d32,
      normalOffset: 1.02
    },
    {
      id: "foreground-low-readable-edge",
      runId: "foreground",
      kind: "rim",
      along: 0.1,
      centerY: 1.48,
      width: 4.1,
      height: 0.32,
      color: 0xd18743,
      normalOffset: 1.04
    }
  ],
  wallDressing: [
    { id: "north-center-hung-banner", frame: "env-wall-torch-banner", x: 0.12, y: -5.95, scale: 1.62, height: 2.82 },
    { id: "north-blue-arch", frame: "env-wall-window", x: -5.55, y: -6.18, scale: 1.58, height: 2.58 },
    { id: "north-broken-arch", frame: "env-wall-ruin-low", x: 4.55, y: -6.16, scale: 1.46, height: 2.22 },
    { id: "west-door-arch-dressing", frame: "env-door-open-side", x: -7.85, y: -4.25, scale: 1.5, height: 2.38 },
    { id: "west-rail-broken-dressing", frame: "env-wall-ruin-corner", x: -8.02, y: 1.5, scale: 1.32, height: 2.02 },
    { id: "east-stair-arch-dressing", frame: "env-arch-clover", x: 8.05, y: 3.9, scale: 1.38, height: 2.24 },
    { id: "east-caster-banner", frame: "env-banner-wide", x: 8.02, y: -1.5, scale: 1.02, height: 1.96 }
  ],
  doorways: [
    {
      id: "boss-door",
      x: -7.45,
      y: -4.75,
      width: 1.15,
      depth: 1.15,
      closedFrame: "env-door-iron",
      openFrame: "env-door-open"
    }
  ],
  wallRuns: [
    { id: "north", from: { x: -8.5, y: -6.5 }, to: { x: 8.5, y: -6.5 }, height: 3.35, thickness: 0.68 },
    {
      id: "north-altar-left",
      from: { x: -2.35, y: -6.45 },
      to: { x: -2.35, y: -5.0 },
      height: 2.72,
      thickness: 0.52
    },
    {
      id: "north-altar-right",
      from: { x: 2.38, y: -6.45 },
      to: { x: 2.38, y: -5.0 },
      height: 2.72,
      thickness: 0.52
    },
    { id: "east", from: { x: 8.5, y: -6.5 }, to: { x: 8.5, y: 6.5 }, height: 3.08, thickness: 0.68 },
    {
      id: "east-stair-return",
      from: { x: 6.7, y: 3.55 },
      to: { x: 8.5, y: 3.55 },
      height: 1.68,
      thickness: 0.54
    },
    {
      id: "stairwell-ledge",
      from: { x: 4.0, y: 4.25 },
      to: { x: 7.35, y: 4.25 },
      height: 1.5,
      thickness: 0.54
    },
    { id: "south-rail", from: { x: -2.2, y: 6.5 }, to: { x: 8.5, y: 6.5 }, height: 1.68, thickness: 0.58 },
    { id: "west-rail", from: { x: -8.5, y: -3.4 }, to: { x: -8.5, y: 5.6 }, height: 2.72, thickness: 0.68 },
    {
      id: "west-door-return",
      from: { x: -8.5, y: -5.15 },
      to: { x: -6.2, y: -5.15 },
      height: 2.78,
      thickness: 0.58
    },
    {
      id: "southwest-foreground-rail",
      from: { x: -8.1, y: 5.85 },
      to: { x: -4.65, y: 5.85 },
      height: 1.76,
      thickness: 0.56
    },
    { id: "foreground", from: { x: -3.4, y: 7.2 }, to: { x: 3.2, y: 7.2 }, height: 2.72, thickness: 0.72 }
  ],
  torchPlacements: [
    { x: -4.4, y: -5.7 },
    { x: 0, y: -5.6 },
    { x: 2.35, y: -5.45 },
    { x: 6.2, y: -3.6 },
    { x: -7.4, y: 1.4 },
    { x: 7.4, y: 3.8 },
    { x: 4.35, y: 4.2 }
  ],
  propPlacements: [
    {
      id: "north-brazier",
      frame: "sprite-brazier",
      x: 0.1,
      y: -4.7,
      scale: 1.15,
      light: { color: 0xff7a2b, intensity: 3.4, distance: 8.5 }
    },
    {
      id: "blue-obelisk",
      frame: "sprite-obelisk",
      x: -5.5,
      y: -3.8,
      scale: 1.15,
      light: { color: 0x5cc9ff, intensity: 2.5, distance: 5.5 }
    },
    {
      id: "candles-west",
      frame: "sprite-candles",
      x: -6.4,
      y: 0.1,
      scale: 0.72,
      light: { color: 0xffc16a, intensity: 1.5, distance: 3.5 }
    },
    {
      id: "candles-east",
      frame: "sprite-candles",
      x: 6.4,
      y: 0.2,
      scale: 0.72,
      light: { color: 0xffc16a, intensity: 1.5, distance: 3.5 }
    },
    { id: "skulls", frame: "sprite-skulls", x: -3.8, y: 3.5, scale: 0.7 },
    { id: "bones", frame: "sprite-bones", x: 2.7, y: 3.8, scale: 0.75 },
    { id: "bones-near-door", frame: "sprite-bones", x: -6.7, y: -3.4, scale: 0.62 },
    { id: "skulls-foreground", frame: "sprite-skulls", x: 4.2, y: 5.1, scale: 0.58 },
    { id: "bones-southwest", frame: "sprite-bones", x: -5.75, y: 4.45, scale: 0.64 },
    { id: "skulls-north-center", frame: "sprite-skulls", x: -0.95, y: -3.2, scale: 0.5 },
    { id: "bones-east-wall", frame: "sprite-bones", x: 7.0, y: -1.55, scale: 0.56 },
    {
      id: "candles-altar-left",
      frame: "sprite-candles",
      x: -2.2,
      y: -5.05,
      scale: 0.54,
      light: { color: 0xffb45e, intensity: 1.0, distance: 2.8 }
    },
    {
      id: "candles-altar-right",
      frame: "sprite-candles",
      x: 2.2,
      y: -5.0,
      scale: 0.54,
      light: { color: 0xffb45e, intensity: 1.0, distance: 2.8 }
    },
    {
      id: "candles-stairs",
      frame: "sprite-candles",
      x: 6.9,
      y: 4.9,
      scale: 0.62,
      light: { color: 0xffb45e, intensity: 1.25, distance: 3.0 }
    },
    {
      id: "candles-door",
      frame: "sprite-candles",
      x: -7.1,
      y: -3.6,
      scale: 0.6,
      light: { color: 0xffb45e, intensity: 1.05, distance: 2.7 }
    },
    {
      id: "candles-foreground-left",
      frame: "sprite-candles",
      x: -4.65,
      y: 5.2,
      scale: 0.55,
      light: { color: 0xffb45e, intensity: 0.85, distance: 2.4 }
    },
    {
      id: "treasure",
      frame: "sprite-treasure",
      x: 5.7,
      y: 2.8,
      scale: 0.88,
      light: { color: 0xffc85a, intensity: 1.65, distance: 4.2 }
    },
    { id: "stairs", frame: "sprite-stairs", x: 5.4, y: 4.6, scale: 1.05 }
  ],
  showcaseMonsters: [
    { kind: "gutter-fiend", dx: -5, dy: -1 },
    { kind: "bone-warden", dx: 4, dy: -2, elite: true },
    { kind: "ash-chanter", dx: 1, dy: -4 },
    { kind: "gutter-fiend", dx: 5, dy: -1 },
    { kind: "bone-warden", dx: -2, dy: 4 },
    { kind: "gutter-fiend", dx: -6, dy: 2 },
    { kind: "ash-chanter", dx: 6, dy: 3 },
    { kind: "gutter-fiend", dx: 2, dy: 5 }
  ],
  showcaseLoot: [
    { forced: "charm", dx: -3, dy: 0, rare: true },
    { forced: "gold", dx: 2, dy: 1 },
    { forced: "potion", dx: 3, dy: -1 },
    { forced: "armor", dx: -2, dy: 3, rare: true },
    { forced: "weapon", dx: -5, dy: 4, rare: true },
    { forced: "gold", dx: 6, dy: 1 },
    { forced: "potion", dx: -6, dy: -2 }
  ],
  shrineHint: { kind: "ember", dx: -5, dy: -3 }
};
