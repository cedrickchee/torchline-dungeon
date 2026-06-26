import {
  ACTOR_ANIMATION_FRAME_COUNTS,
  ACTOR_BASE_FRAMES,
  ACTOR_DIRECTIONS,
  type ActorDirection
} from "../render/actor-sprites";
import type { ActorAnimation } from "../core/types";

export type AtlasImage = {
  path: string;
  width: number;
  height: number;
};

export type AtlasFrame = {
  atlas: keyof AtlasManifest["images"];
  x: number;
  y: number;
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  tags?: string[];
};

export type AtlasManifest = {
  images: Record<string, AtlasImage>;
  frames: Record<string, AtlasFrame>;
  tileVariants: Record<string, string[]>;
  animations: Record<string, { frames: string[]; fps: number; loop: boolean }>;
};

const atlasUrls = {
  "dungeon-atlas.png": new URL("../../assets/atlas/dungeon-atlas.png", import.meta.url).href,
  "walls-doors-atlas.png": new URL("../../assets/atlas/walls-doors-atlas.png", import.meta.url).href,
  "loot-atlas.png": new URL("../../assets/atlas/loot-atlas.png", import.meta.url).href,
  "ui-atlas.png": new URL("../../assets/atlas/ui-atlas.png", import.meta.url).href,
  "fx-atlas.png": new URL("../../assets/atlas/fx-atlas.png", import.meta.url).href,
  "raster-asset-sheet.png": new URL("../../assets/atlas/raster-asset-sheet.png", import.meta.url).href,
  "environment-floor-atlas.png": new URL("../../assets/atlas/environment-floor-atlas.png", import.meta.url).href,
  "environment-wall-kit-atlas.png": new URL("../../assets/atlas/environment-wall-kit-atlas.png", import.meta.url).href,
  "environment-wall-spans-atlas.png": new URL("../../assets/atlas/environment-wall-spans-atlas.png", import.meta.url).href,
  "raster-sprites-atlas.png": new URL("../../assets/atlas/raster-sprites-atlas.png", import.meta.url).href,
  "actor-sprites-atlas.png": new URL("../../assets/atlas/actor-sprites-atlas.png", import.meta.url).href
} as const;

const atlasUrl = (name: keyof typeof atlasUrls): string => atlasUrls[name];

const ACTOR_FRAME_WIDTH = 150;
const ACTOR_FRAME_HEIGHT = 180;
const ACTOR_ATLAS_COLUMNS = 28;
const ACTOR_ATLAS_ROWS = 16;
const ACTOR_ANIMATION_ORDER: ActorAnimation[] = ["idle", "run", "attack", "hit", "death"];
const ENVIRONMENT_WALL_KIT_FRAME_SIZE = 192;
const ENVIRONMENT_WALL_SPAN_FRAME = { width: 768, height: 384 };
const ENVIRONMENT_WALL_KIT_FRAMES = [
  "env-wall-window",
  "env-wall-blocks",
  "env-wall-triple-arch",
  "env-wall-cracked",
  "env-wall-niche",
  "env-wall-arcade",
  "env-wall-cap-arcade",
  "env-wall-cap-block",
  "env-wall-cap-heavy",
  "env-arch-gothic",
  "env-arch-round",
  "env-arch-clover",
  "env-door-wood",
  "env-door-open",
  "env-door-iron",
  "env-door-open-side",
  "env-wall-ruin-low",
  "env-wall-ruin-corner",
  "env-pillar-left",
  "env-pillar-right",
  "env-stone-railing",
  "env-iron-fence",
  "env-wall-torch-banner",
  "env-banner-wide"
] as const;
const ENVIRONMENT_WALL_SPAN_FRAMES = [
  "env-span-north-wall",
  "env-span-door-arch",
  "env-span-side-return",
  "env-span-foreground-occluder"
] as const;
const ACTOR_FRAMES_PER_DIRECTION = ACTOR_ANIMATION_ORDER.reduce(
  (sum, animation) => sum + ACTOR_ANIMATION_FRAME_COUNTS[animation],
  0
);
const ACTOR_FRAMES_PER_BASE = ACTOR_DIRECTIONS.length * ACTOR_FRAMES_PER_DIRECTION;

const actorFrameOffset = (animation: ActorAnimation): number =>
  ACTOR_ANIMATION_ORDER.slice(0, ACTOR_ANIMATION_ORDER.indexOf(animation)).reduce(
    (sum, entry) => sum + ACTOR_ANIMATION_FRAME_COUNTS[entry],
    0
  );

function buildActorFrames(): Record<string, AtlasFrame> {
  const frames: Record<string, AtlasFrame> = {};
  for (let baseIndex = 0; baseIndex < ACTOR_BASE_FRAMES.length; baseIndex += 1) {
    const baseFrame = ACTOR_BASE_FRAMES[baseIndex]!;
    for (let directionIndex = 0; directionIndex < ACTOR_DIRECTIONS.length; directionIndex += 1) {
      const direction: ActorDirection = ACTOR_DIRECTIONS[directionIndex]!;
      for (const animation of ACTOR_ANIMATION_ORDER) {
        for (let frameIndex = 0; frameIndex < ACTOR_ANIMATION_FRAME_COUNTS[animation]; frameIndex += 1) {
          const linearIndex =
            baseIndex * ACTOR_FRAMES_PER_BASE +
            directionIndex * ACTOR_FRAMES_PER_DIRECTION +
            actorFrameOffset(animation) +
            frameIndex;
          frames[`actor:${baseFrame}:${animation}:${direction}:${frameIndex}`] = {
            atlas: "actors",
            x: (linearIndex % ACTOR_ATLAS_COLUMNS) * ACTOR_FRAME_WIDTH,
            y: Math.floor(linearIndex / ACTOR_ATLAS_COLUMNS) * ACTOR_FRAME_HEIGHT,
            w: ACTOR_FRAME_WIDTH,
            h: ACTOR_FRAME_HEIGHT,
            anchorX: 0.5,
            anchorY: baseFrame === "sprite-fiend" ? 0.78 : 0.9,
            tags: ["actor", animation, direction, baseFrame]
          };
        }
      }
    }
  }
  return frames;
}

function buildEnvironmentWallKitFrames(): Record<string, AtlasFrame> {
  const frames: Record<string, AtlasFrame> = {};
  for (let index = 0; index < ENVIRONMENT_WALL_KIT_FRAMES.length; index += 1) {
    frames[ENVIRONMENT_WALL_KIT_FRAMES[index]!] = {
      atlas: "environmentWallKit",
      x: index * ENVIRONMENT_WALL_KIT_FRAME_SIZE,
      y: 0,
      w: ENVIRONMENT_WALL_KIT_FRAME_SIZE,
      h: ENVIRONMENT_WALL_KIT_FRAME_SIZE,
      anchorX: 0.5,
      anchorY: 0.92,
      tags: ["environment", "wall-kit"]
    };
  }
  return frames;
}

function buildEnvironmentWallSpanFrames(): Record<string, AtlasFrame> {
  const frames: Record<string, AtlasFrame> = {};
  for (let index = 0; index < ENVIRONMENT_WALL_SPAN_FRAMES.length; index += 1) {
    frames[ENVIRONMENT_WALL_SPAN_FRAMES[index]!] = {
      atlas: "environmentWallSpans",
      x: index * ENVIRONMENT_WALL_SPAN_FRAME.width,
      y: 0,
      w: ENVIRONMENT_WALL_SPAN_FRAME.width,
      h: ENVIRONMENT_WALL_SPAN_FRAME.height,
      anchorX: 0.5,
      anchorY: 0.88,
      tags: ["environment", "wall-span"]
    };
  }
  return frames;
}

function buildActorAnimations(): Record<string, { frames: string[]; fps: number; loop: boolean }> {
  const fps: Record<ActorAnimation, number> = { idle: 3, run: 10, attack: 12, hit: 8, death: 6 };
  const animations: Record<string, { frames: string[]; fps: number; loop: boolean }> = {};
  for (const baseFrame of ACTOR_BASE_FRAMES) {
    for (const direction of ACTOR_DIRECTIONS) {
      for (const animation of ACTOR_ANIMATION_ORDER) {
        animations[`actor:${baseFrame}:${animation}:${direction}`] = {
          frames: Array.from(
            { length: ACTOR_ANIMATION_FRAME_COUNTS[animation] },
            (_, frameIndex) => `actor:${baseFrame}:${animation}:${direction}:${frameIndex}`
          ),
          fps: fps[animation],
          loop: animation === "idle" || animation === "run"
        };
      }
    }
  }
  return animations;
}

export const atlasManifest: AtlasManifest = {
  images: {
    dungeon: { path: atlasUrl("dungeon-atlas.png"), width: 512, height: 128 },
    walls: { path: atlasUrl("walls-doors-atlas.png"), width: 512, height: 128 },
    loot: { path: atlasUrl("loot-atlas.png"), width: 640, height: 128 },
    ui: { path: atlasUrl("ui-atlas.png"), width: 640, height: 128 },
    fx: { path: atlasUrl("fx-atlas.png"), width: 640, height: 128 },
    raster: { path: atlasUrl("raster-asset-sheet.png"), width: 1536, height: 1024 },
    environmentFloor: { path: atlasUrl("environment-floor-atlas.png"), width: 960, height: 160 },
    environmentWallKit: {
      path: atlasUrl("environment-wall-kit-atlas.png"),
      width: ENVIRONMENT_WALL_KIT_FRAME_SIZE * ENVIRONMENT_WALL_KIT_FRAMES.length,
      height: ENVIRONMENT_WALL_KIT_FRAME_SIZE
    },
    environmentWallSpans: {
      path: atlasUrl("environment-wall-spans-atlas.png"),
      width: ENVIRONMENT_WALL_SPAN_FRAME.width * ENVIRONMENT_WALL_SPAN_FRAMES.length,
      height: ENVIRONMENT_WALL_SPAN_FRAME.height
    },
    sprites: { path: atlasUrl("raster-sprites-atlas.png"), width: 4000, height: 160 },
    actors: {
      path: atlasUrl("actor-sprites-atlas.png"),
      width: ACTOR_ATLAS_COLUMNS * ACTOR_FRAME_WIDTH,
      height: ACTOR_ATLAS_ROWS * ACTOR_FRAME_HEIGHT
    }
  },
  frames: {
    "floor-slab": { atlas: "dungeon", x: 0, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "floor-cracked": { atlas: "dungeon", x: 128, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "floor-rune": { atlas: "dungeon", x: 256, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "floor-grate": { atlas: "dungeon", x: 384, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "wall-face": { atlas: "walls", x: 0, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "wall-top": { atlas: "walls", x: 128, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "door-closed": { atlas: "walls", x: 256, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "door-open": { atlas: "walls", x: 384, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "loot-gold": { atlas: "loot", x: 0, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.55 },
    "loot-potion": { atlas: "loot", x: 128, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.65 },
    "loot-weapon": { atlas: "loot", x: 256, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.65 },
    "loot-armor": { atlas: "loot", x: 384, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.65 },
    "loot-charm": { atlas: "loot", x: 512, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.65 },
    "ui-panel": { atlas: "ui", x: 0, y: 0, w: 128, h: 128, anchorX: 0, anchorY: 0 },
    "skill-flame": { atlas: "ui", x: 128, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "skill-steel": { atlas: "ui", x: 256, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "skill-shadow": { atlas: "ui", x: 384, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "skill-survival": { atlas: "ui", x: 512, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "fx-bloom": { atlas: "fx", x: 0, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "fx-ember": { atlas: "fx", x: 128, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "fx-fog": { atlas: "fx", x: 256, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "fx-hit": { atlas: "fx", x: 384, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "fx-pickup": { atlas: "fx", x: 512, y: 0, w: 128, h: 128, anchorX: 0.5, anchorY: 0.5 },
    "raster-floor-slab": { atlas: "environmentFloor", x: 0, y: 0, w: 160, h: 160, anchorX: 0, anchorY: 0 },
    "raster-floor-rune": { atlas: "environmentFloor", x: 160, y: 0, w: 160, h: 160, anchorX: 0, anchorY: 0 },
    "raster-floor-compass": { atlas: "environmentFloor", x: 320, y: 0, w: 160, h: 160, anchorX: 0, anchorY: 0 },
    "raster-floor-grate": { atlas: "environmentFloor", x: 480, y: 0, w: 160, h: 160, anchorX: 0, anchorY: 0 },
    "raster-floor-rubble": { atlas: "environmentFloor", x: 640, y: 0, w: 160, h: 160, anchorX: 0, anchorY: 0 },
    "raster-floor-cracked": { atlas: "environmentFloor", x: 800, y: 0, w: 160, h: 160, anchorX: 0, anchorY: 0 },
    "raster-player": { atlas: "raster", x: 18, y: 422, w: 138, h: 136, anchorX: 0.5, anchorY: 0.94 },
    "sprite-player": { atlas: "sprites", x: 0, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.9 },
    "sprite-fiend": { atlas: "sprites", x: 160, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.78 },
    "sprite-bone-warden": { atlas: "sprites", x: 320, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-ash-chanter": { atlas: "sprites", x: 480, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-brazier": { atlas: "sprites", x: 640, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.78 },
    "sprite-obelisk": { atlas: "sprites", x: 800, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.9 },
    "sprite-candles": { atlas: "sprites", x: 960, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.88 },
    "sprite-bones": { atlas: "sprites", x: 1120, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.76 },
    "sprite-skulls": { atlas: "sprites", x: 1280, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.76 },
    "sprite-gold": { atlas: "sprites", x: 1440, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.72 },
    "sprite-treasure": { atlas: "sprites", x: 1600, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.78 },
    "sprite-potion": { atlas: "sprites", x: 1760, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.72 },
    "sprite-weapon": { atlas: "sprites", x: 1920, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.72 },
    "sprite-armor": { atlas: "sprites", x: 2080, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.72 },
    "sprite-charm": { atlas: "sprites", x: 2240, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.72 },
    "sprite-wall-torch": { atlas: "sprites", x: 2400, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-wall-banner": { atlas: "sprites", x: 2560, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-wall-broken": { atlas: "sprites", x: 2720, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-wall-arch": { atlas: "sprites", x: 2880, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-door-boss": { atlas: "sprites", x: 3040, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-stairs": { atlas: "sprites", x: 3200, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-wall-torch-side": { atlas: "sprites", x: 3360, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-wall-banner-side": { atlas: "sprites", x: 3520, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-wall-broken-side": { atlas: "sprites", x: 3680, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    "sprite-wall-arch-side": { atlas: "sprites", x: 3840, y: 0, w: 160, h: 160, anchorX: 0.5, anchorY: 0.92 },
    ...buildEnvironmentWallSpanFrames(),
    ...buildEnvironmentWallKitFrames(),
    ...buildActorFrames()
  },
  tileVariants: {
    floor: ["raster-floor-slab", "raster-floor-cracked", "raster-floor-slab", "raster-floor-grate", "raster-floor-rubble", "raster-floor-rune"]
  },
  animations: {
    "torch-idle": { frames: ["fx-bloom", "fx-ember"], fps: 8, loop: true },
    ...buildActorAnimations()
  }
};
