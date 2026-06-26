import type { ActorAnimation } from "../core/types";

export type ActorDirection =
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest"
  | "north"
  | "northeast";

export type ActorSpriteFrame = {
  frameId: string;
  baseFrame: ActorBaseFrame;
  animation: ActorAnimation;
  direction: ActorDirection;
  frameIndex: number;
};

export type ActorBaseFrame = (typeof ACTOR_BASE_FRAMES)[number];

export const ACTOR_BASE_FRAMES = [
  "sprite-player",
  "sprite-fiend",
  "sprite-bone-warden",
  "sprite-ash-chanter"
] as const;

export const ACTOR_DIRECTIONS: ActorDirection[] = [
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
  "north",
  "northeast"
];

export const ACTOR_ANIMATION_FRAME_COUNTS: Record<ActorAnimation, number> = {
  idle: 2,
  run: 4,
  attack: 3,
  hit: 2,
  death: 3
};

const ACTOR_ANIMATION_FPS: Record<ActorAnimation, number> = {
  idle: 3,
  run: 10,
  attack: 12,
  hit: 8,
  death: 6
};

const ACTOR_FRAME_PREFIX = "actor";
// Screen-space basis for the locked floor-one camera. Actor sheets are authored
// as visible screen directions, while simulation facing is stored in world x/y.
const WORLD_X_TO_SCREEN = { x: 0.0629, y: 0.0407 };
const WORLD_Y_TO_SCREEN = { x: -0.0392, y: 0.0647 };

export function isActorBaseFrame(frame: string): frame is ActorBaseFrame {
  return (ACTOR_BASE_FRAMES as readonly string[]).includes(frame);
}

export function isActorSpriteFrame(frame: string): boolean {
  return isActorBaseFrame(frame) || parseActorSpriteFrameId(frame) !== null;
}

export function actorDirectionFromFacing(facing: number): ActorDirection {
  const worldX = Math.cos(facing);
  const worldY = Math.sin(facing);
  const screenX = worldX * WORLD_X_TO_SCREEN.x + worldY * WORLD_Y_TO_SCREEN.x;
  const screenY = worldX * WORLD_X_TO_SCREEN.y + worldY * WORLD_Y_TO_SCREEN.y;
  const screenFacing = Math.atan2(screenY, screenX);
  const normalized = ((screenFacing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const index = Math.round(normalized / (Math.PI / 4)) % ACTOR_DIRECTIONS.length;
  return ACTOR_DIRECTIONS[index]!;
}

export function actorAnimationFrame(animation: ActorAnimation, nowMs: number): number {
  const count = ACTOR_ANIMATION_FRAME_COUNTS[animation];
  const fps = ACTOR_ANIMATION_FPS[animation];
  return Math.floor((Math.max(0, nowMs) / 1000) * fps) % count;
}

export function resolveActorSpriteFrame(
  baseFrame: string,
  animation: ActorAnimation,
  facing: number,
  nowMs: number
): ActorSpriteFrame {
  if (!isActorBaseFrame(baseFrame)) {
    throw new Error(`Cannot animate non-actor sprite frame: ${baseFrame}`);
  }
  const direction = actorDirectionFromFacing(facing);
  const frameIndex = actorAnimationFrame(animation, nowMs);
  return {
    frameId: `${ACTOR_FRAME_PREFIX}:${baseFrame}:${animation}:${direction}:${frameIndex}`,
    baseFrame,
    animation,
    direction,
    frameIndex
  };
}

export function parseActorSpriteFrameId(frameId: string): ActorSpriteFrame | null {
  const [prefix, baseFrame, animation, direction, frameIndexText, extra] = frameId.split(":");
  if (prefix !== ACTOR_FRAME_PREFIX || extra !== undefined) return null;
  if (!baseFrame || !isActorBaseFrame(baseFrame)) return null;
  if (!animation || !isActorAnimation(animation)) return null;
  if (!direction || !isActorDirection(direction)) return null;
  const frameIndex = Number(frameIndexText);
  if (
    !Number.isInteger(frameIndex) ||
    frameIndex < 0 ||
    frameIndex >= ACTOR_ANIMATION_FRAME_COUNTS[animation]
  )
    return null;
  return {
    frameId,
    baseFrame,
    animation,
    direction,
    frameIndex
  };
}

function isActorAnimation(value: string): value is ActorAnimation {
  return value === "idle" || value === "run" || value === "attack" || value === "hit" || value === "death";
}

function isActorDirection(value: string): value is ActorDirection {
  return (ACTOR_DIRECTIONS as readonly string[]).includes(value);
}
