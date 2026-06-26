import { describe, expect, it } from "vitest";
import {
  ACTOR_ANIMATION_FRAME_COUNTS,
  ACTOR_BASE_FRAMES,
  ACTOR_DIRECTIONS,
  actorAnimationFrame,
  actorDirectionFromFacing,
  isActorSpriteFrame,
  parseActorSpriteFrameId,
  resolveActorSpriteFrame
} from "../render/actor-sprites";
import { atlasManifest } from "../assets/manifest";
import { floorOneScene } from "../scene/floor-one";

describe("actor sprite frame resolver", () => {
  it("maps world movement to locked-camera screen actor directions", () => {
    expect(actorDirectionFromFacing(0)).toBe("southeast");
    expect(actorDirectionFromFacing(Math.PI / 4)).toBe("south");
    expect(actorDirectionFromFacing(Math.PI / 2)).toBe("southwest");
    expect(actorDirectionFromFacing(Math.PI)).toBe("northwest");
    expect(actorDirectionFromFacing(-Math.PI / 2)).toBe("northeast");
    expect(ACTOR_DIRECTIONS).toHaveLength(8);
  });

  it("uses the same locked-camera actor directions for keyboard, mouse, attacks, and monsters", () => {
    const facingTo = (dx: number, dy: number): number => Math.atan2(dy, dx);
    expect(actorDirectionFromFacing(facingTo(0, -1))).toBe("northeast");
    expect(actorDirectionFromFacing(facingTo(1, 0))).toBe("southeast");
    expect(actorDirectionFromFacing(facingTo(0, 1))).toBe("southwest");
    expect(actorDirectionFromFacing(facingTo(-1, 0))).toBe("northwest");
    expect(resolveActorSpriteFrame("sprite-player", "run", facingTo(0, -1), 0).direction).toBe("northeast");
    expect(resolveActorSpriteFrame("sprite-player", "run", facingTo(1, 0), 0).direction).toBe("southeast");
    expect(resolveActorSpriteFrame("sprite-player", "attack", facingTo(-1, 0), 0).direction).toBe("northwest");
    expect(resolveActorSpriteFrame("sprite-fiend", "run", facingTo(0, 1), 0).direction).toBe("southwest");
  });

  it("builds parseable virtual frames for every actor animation state", () => {
    const states = Object.keys(ACTOR_ANIMATION_FRAME_COUNTS) as Array<
      keyof typeof ACTOR_ANIMATION_FRAME_COUNTS
    >;
    for (const animation of states) {
      const frame = resolveActorSpriteFrame("sprite-player", animation, Math.PI / 4, 1000);
      expect(isActorSpriteFrame(frame.frameId)).toBe(true);
      expect(parseActorSpriteFrameId(frame.frameId)).toEqual(frame);
      expect(frame.frameIndex).toBeLessThan(ACTOR_ANIMATION_FRAME_COUNTS[animation]);
    }
  });

  it("advances running frames faster than idle frames", () => {
    expect(actorAnimationFrame("idle", 360)).toBe(1);
    expect(actorAnimationFrame("run", 360)).toBe(3);
  });

  it("backs every actor resolver frame with a packed atlas cell", () => {
    const animations = Object.keys(ACTOR_ANIMATION_FRAME_COUNTS) as Array<
      keyof typeof ACTOR_ANIMATION_FRAME_COUNTS
    >;
    for (const baseFrame of ACTOR_BASE_FRAMES) {
      const directionFacings = {
        east: -Math.PI / 4,
        southeast: 0,
        south: Math.PI / 4,
        southwest: Math.PI / 2,
        west: (Math.PI * 3) / 4,
        northwest: Math.PI,
        north: (-Math.PI * 3) / 4,
        northeast: -Math.PI / 2
      } satisfies Record<(typeof ACTOR_DIRECTIONS)[number], number>;
      for (const direction of ACTOR_DIRECTIONS) {
        const facing = directionFacings[direction];
        for (const animation of animations) {
          for (let frameIndex = 0; frameIndex < ACTOR_ANIMATION_FRAME_COUNTS[animation]; frameIndex += 1) {
            expect(resolveActorSpriteFrame(baseFrame, animation, facing, 0).direction).toBe(direction);
            const frameId = `actor:${baseFrame}:${animation}:${direction}:${frameIndex}`;
            const frame = atlasManifest.frames[frameId];
            expect(frame, frameId).toBeDefined();
            expect(frame.atlas).toBe("actors");
            expect(frame.w).toBe(150);
            expect(frame.h).toBe(180);
            expect(atlasManifest.animations[`actor:${baseFrame}:${animation}:${direction}`]?.frames).toContain(frameId);
          }
        }
      }
    }
  });
});

describe("authored scene art references", () => {
  it("backs floor-one dressing clusters with atlas frames", () => {
    for (const cluster of floorOneScene.dressingClusters) {
      expect(atlasManifest.frames[cluster.stamp], `${cluster.id} stamp`).toBeDefined();
      expect(atlasManifest.frames[cluster.sprite], `${cluster.id} sprite`).toBeDefined();
    }
  });

  it("backs authored wall accents and dressing with valid wall runs and atlas frames", () => {
    const wallRunIds = new Set(floorOneScene.wallRuns.map((run) => run.id));
    for (const accent of floorOneScene.wallAccents) {
      expect(wallRunIds.has(accent.runId), `${accent.id} wall run`).toBe(true);
    }
    for (const dressing of floorOneScene.wallDressing) {
      expect(atlasManifest.frames[dressing.frame], `${dressing.id} frame`).toBeDefined();
    }
  });
});
