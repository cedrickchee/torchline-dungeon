import * as THREE from "three";
import type { LoadedAtlas } from "../assets/asset-loader";
import { calculatePlayerStats } from "../core/game";
import { idx } from "../core/dungeon";
import {
  Tile,
  type ActorAnimation,
  type EffectEvent,
  type GameState,
  type Item,
  type MonsterKind,
  type MonsterState,
  type Point,
  type ShrineState
} from "../core/types";
import { floorOneScene } from "../scene/floor-one";
import { floorOneCollisionDebug, floorOneSceneDoors, type SceneDoorRuntime } from "../scene/navigation";
import {
  ACTOR_ANIMATION_FRAME_COUNTS,
  isActorBaseFrame,
  isActorSpriteFrame,
  parseActorSpriteFrameId,
  resolveActorSpriteFrame,
  type ActorDirection,
  type ActorSpriteFrame
} from "./actor-sprites";

type InputHit = { type: "monster"; id: string } | { type: "world"; x: number; y: number } | null;

type SpriteRecord = {
  sprite: THREE.Sprite;
  shadow?: THREE.Mesh;
  frame: string;
};

type RuntimeFx = {
  id: string;
  object: THREE.Object3D;
  born: number;
  duration: number;
  baseY: number;
  kind: "text" | "beam" | "spark" | "ring" | "corpse";
};

type FloorDetailInstance = {
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
};

type WallDetailInstance = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: THREE.Color;
};

type WallFacadeInstance = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotationY: number;
  color: THREE.Color;
};

type WallLightPanelInstance = WallFacadeInstance;

type WallKitFacadeInstance = WallFacadeInstance & {
  frame: string;
  opacity?: number;
};

type WallSpanInstance = {
  frame: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotationY: number;
  color: THREE.Color;
  additive?: boolean;
  billboard?: boolean;
  opacity?: number;
  depthTest?: boolean;
  depthWrite?: boolean;
  renderOrder?: number;
};

type StoneBlockInstance = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  rotation: number;
  color: THREE.Color;
};

type StaticBillboardInstance = {
  frame: string;
  x: number;
  z: number;
  scale: number;
  height: number;
};

type AtmosphereWispInstance = {
  x: number;
  z: number;
  width: number;
  height: number;
  lift: number;
  rotation: number;
  color: THREE.Color;
};

type GroundPrimitiveInstance = {
  x: number;
  z: number;
  width: number;
  depth: number;
  rotation: number;
  color: THREE.Color;
  opacity: number;
};

type DynamicGroundGlowInstance = GroundPrimitiveInstance & {
  key: string;
};

type ActorFrameTransform = {
  xOffset: number;
  yOffset: number;
  scaleX: number;
  scaleY: number;
  shear: number;
  shade: number;
  warm: number;
  hitGlow: number;
};

type StaticBoxInstance = {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: THREE.Color;
};

const COLOR_BACKGROUND = 0x020505;
const COLOR_GOLD = 0xf1c86a;
const COLOR_AMBER = 0xf2a84b;
const COLOR_BLUE = 0x75c9e8;
const COLOR_BLOOD = 0xb03f35;
const PROCEDURAL_FLOOR_TEXTURE = "procedural-painted-floor-v1";
const PROCEDURAL_WALL_TEXTURE = "procedural-painted-wall-v4";
const PROCEDURAL_WALL_FACADE_TEXTURE = "procedural-wall-facade-v2";
const PROCEDURAL_WALL_LIGHT_TEXTURE = "procedural-wall-light-v1";
const PROCEDURAL_CAP_TEXTURE = "procedural-painted-cap-v2";
const PROCEDURAL_CONTACT_SHADOW_TEXTURE = "procedural-contact-shadow-v1";
const PROCEDURAL_GROUND_GLOW_TEXTURE = "procedural-ground-glow-v1";
const PROCEDURAL_FOG_WISP_TEXTURE = "procedural-fog-wisp-v1";
const PROCEDURAL_LOOT_BEAM_TEXTURE = "procedural-loot-beam-v2";
const STATIC_POINT_LIGHT_PROP_IDS = new Set([
  "north-brazier",
  "blue-obelisk",
  "treasure",
  "candles-door",
  "candles-stairs",
  "candles-altar-left",
  "candles-altar-right"
]);
const ACTOR_BASE_FADE_START: Record<string, number> = {
  "sprite-player": 0.76,
  "sprite-fiend": 0.73,
  "sprite-bone-warden": 0.76,
  "sprite-ash-chanter": 0.75
};
const PLAYER_VISUAL_SCALE = 1.26;
const PLAYER_VISUAL_HEIGHT = 2.02;
const DIRECTION_PROFILES: Record<
  ActorDirection,
  { mirror: boolean; shear: number; scaleX: number; yOffset: number; shade: number; warm: number }
> = {
  east: { mirror: false, shear: 0.12, scaleX: 0.88, yOffset: 1, shade: 0.96, warm: 0.02 },
  southeast: { mirror: false, shear: 0.05, scaleX: 0.98, yOffset: 0, shade: 1.04, warm: 0.05 },
  south: { mirror: false, shear: 0, scaleX: 1.02, yOffset: 0, shade: 1.08, warm: 0.08 },
  southwest: { mirror: true, shear: -0.05, scaleX: 0.98, yOffset: 0, shade: 1.04, warm: 0.05 },
  west: { mirror: true, shear: -0.12, scaleX: 0.88, yOffset: 1, shade: 0.96, warm: 0.02 },
  northwest: { mirror: true, shear: -0.05, scaleX: 0.9, yOffset: 2, shade: 0.78, warm: -0.03 },
  north: { mirror: false, shear: 0, scaleX: 0.86, yOffset: 3, shade: 0.72, warm: -0.05 },
  northeast: { mirror: false, shear: 0.05, scaleX: 0.9, yOffset: 2, shade: 0.78, warm: -0.03 }
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const detailNoise = (seed: number): number => Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1;
const nextPowerOfTwo = (value: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, value)));

function itemFrame(item: Item): string {
  if (item.kind === "gold") return "sprite-gold";
  if (item.kind === "potion") return "sprite-potion";
  if (item.slot === "weapon") return "sprite-weapon";
  if (item.slot === "armor") return "sprite-armor";
  return "sprite-charm";
}

function monsterFrameForKind(kind: MonsterKind): string {
  if (kind === "bone-warden") return "sprite-bone-warden";
  if (kind === "ash-chanter") return "sprite-ash-chanter";
  return "sprite-fiend";
}

function monsterFrame(monster: MonsterState): string {
  return monsterFrameForKind(monster.kind);
}

function colorFromHex(hex: string, fallback: number): THREE.Color {
  try {
    return new THREE.Color(hex);
  } catch {
    return new THREE.Color(fallback);
  }
}

export class ThreeRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly staticWorld = new THREE.Group();
  private readonly dynamicWorld = new THREE.Group();
  private readonly fxWorld = new THREE.Group();
  private readonly debugWorld = new THREE.Group();
  private readonly playerTorchLight = new THREE.PointLight(0xff9b3d, 2.8, 8.6, 1.65);
  private readonly textureCache = new Map<string, THREE.Texture>();
  private readonly spriteRecords = new Map<string, SpriteRecord>();
  private readonly beamRecords = new Map<string, THREE.Sprite>();
  private readonly runtimeFx = new Map<string, RuntimeFx>();
  private readonly pendingGroundDecals: GroundPrimitiveInstance[] = [];
  private readonly pendingGroundGlowDecals: GroundPrimitiveInstance[] = [];
  private readonly pendingGroundRects: GroundPrimitiveInstance[] = [];
  private readonly pendingDynamicGroundGlows: DynamicGroundGlowInstance[] = [];
  private dynamicGroundGlowMesh: THREE.InstancedMesh | null = null;
  private dynamicGroundGlowCapacity = 0;
  private atlas: LoadedAtlas | null = null;
  private roomKey = "";
  private origin: Point = { x: 0, y: 0 };
  private staticBuilt = false;
  private viewport = { width: 1, height: 1, dpr: 1 };
  private readonly cameraBase = new THREE.Vector3();
  private readonly cameraTarget = new THREE.Vector3();
  private cameraShakeUntil = 0;
  private cameraShakeDuration = 1;
  private cameraShakeStrength = 0;
  private visualClockMs = 0;
  private lastRenderNow = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setClearColor(COLOR_BACKGROUND, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.72;
    this.renderer.shadowMap.enabled = false;
    this.renderer.sortObjects = true;

    const cameraSpec = floorOneScene.camera;
    this.camera = new THREE.PerspectiveCamera(cameraSpec.fov, 1, cameraSpec.near, cameraSpec.far);
    this.cameraBase.fromArray(cameraSpec.position);
    this.cameraTarget.fromArray(cameraSpec.target);
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.cameraTarget);

    this.scene.fog = new THREE.FogExp2(0x071014, 0.0125);
    this.scene.add(this.staticWorld, this.dynamicWorld, this.fxWorld, this.debugWorld);
    this.scene.add(new THREE.AmbientLight(0xa08463, 1.26));
    const moon = new THREE.DirectionalLight(0x86c3d0, 1.42);
    moon.position.set(-5, 9, -3);
    this.scene.add(moon);
    const ember = new THREE.DirectionalLight(0xffa457, 1.86);
    ember.position.set(6, 8, 6);
    this.scene.add(ember);
    this.scene.add(this.playerTorchLight);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  loadAssets(atlas: LoadedAtlas): void {
    this.atlas = atlas;
    this.textureCache.clear();
    this.disposeDynamicGroundGlowMesh();
    this.clearGroup(this.dynamicWorld);
    this.spriteRecords.clear();
    this.beamRecords.clear();
    this.pendingDynamicGroundGlows.length = 0;
    this.staticBuilt = false;
  }

  dispose(): void {
    this.disposeDynamicGroundGlowMesh();
    this.renderer.dispose();
    for (const texture of this.textureCache.values()) texture.dispose();
  }

  getInputHit(clientX: number, clientY: number, state: GameState): InputHit {
    const monsterHit = this.pickMonster(clientX, clientY, state);
    if (monsterHit) return monsterHit;
    const doorHit = this.pickDoor(clientX, clientY, state);
    if (doorHit) return doorHit;
    const world = this.clientToGamePoint(clientX, clientY);
    return world ? { type: "world", ...world } : null;
  }

  clientToGamePoint(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return this.fromWorld(hit);
  }

  render(state: GameState, events: EffectEvent[], _dtMs: number, now: number): void {
    const started = performance.now();
    const visualNow = this.advanceVisualClock(state, now);
    this.resize();
    this.ensureStaticWorld(state);
    this.addEffects(events, visualNow);
    this.syncDynamicWorld(state, visualNow);
    this.syncDebugWorld(state);
    this.updateEffects(visualNow);
    this.syncCameraShake(visualNow);
    this.renderer.render(this.scene, this.camera);
    state.debug.renderMs = Math.round((performance.now() - started) * 10) / 10;
    state.debug.drawCalls = this.renderer.info.render.calls;
    state.debug.triangles = this.renderer.info.render.triangles;
    state.debug.objects =
      this.staticWorld.children.length +
      this.dynamicWorld.children.length +
      this.fxWorld.children.length +
      this.debugWorld.children.length;
    state.debug.animatedSprites = this.spriteRecords.size;
    state.debug.particles = this.runtimeFx.size;
  }

  private advanceVisualClock(state: GameState, now: number): number {
    if (this.lastRenderNow === 0) this.lastRenderNow = now;
    const delta = Math.max(0, Math.min(100, now - this.lastRenderNow));
    this.lastRenderNow = now;
    if (state.mode !== "paused") this.visualClockMs += delta;
    return this.visualClockMs;
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    if (this.viewport.width === width && this.viewport.height === height && this.viewport.dpr === dpr) return;
    this.viewport = { width, height, dpr };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private ensureStaticWorld(state: GameState): void {
    const room = state.dungeon.rooms[0];
    const doorKey = floorOneSceneDoors(state)
      .map((door) => `${door.spec.id}:${door.open ? "open" : "closed"}`)
      .join("|");
    const key = room
      ? `${state.sceneId}:${room.x}:${room.y}:${room.w}:${room.h}:${doorKey}`
      : `${state.sceneId}:${doorKey}`;
    if (this.staticBuilt && this.roomKey === key) return;
    this.roomKey = key;
    this.staticBuilt = true;
    this.clearGroup(this.staticWorld);
    this.pendingGroundDecals.length = 0;
    this.pendingGroundGlowDecals.length = 0;
    this.pendingGroundRects.length = 0;
    this.origin = room ? { x: room.cx, y: room.cy } : { x: state.player.x, y: state.player.y };

    this.buildFloor(state);
    this.buildWalls();
    this.buildProps(state);
    this.buildFogBands();
    this.flushGroundPrimitives();
  }

  private buildFloor(state: GameState): void {
    const room = state.dungeon.rooms[0];
    if (!room) return;

    const floorTexture = this.proceduralTexture(PROCEDURAL_FLOOR_TEXTURE, () => this.createPaintedFloorTexture());
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(room.w + 1.8, room.h + 1.8),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: floorTexture,
        emissive: 0x21150c,
        emissiveIntensity: 0.48,
        roughness: 0.95,
        metalness: 0.02
      })
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, -0.04, 0);
    this.staticWorld.add(base);

    const variants = [
      "raster-floor-slab",
      "raster-floor-cracked",
      "raster-floor-rubble",
      "raster-floor-grate",
      "raster-floor-rune"
    ];
    const tilesByFrame = new Map<
      string,
      { x: number; y: number; color: THREE.Color; rotation: number; lift: number }[]
    >();
    for (let y = room.y + 1; y < room.y + room.h - 1; y += 1) {
      for (let x = room.x + 1; x < room.x + room.w - 1; x += 1) {
        const tile = state.dungeon.tiles[idx(state.dungeon, x, y)] as Tile;
        if (tile === Tile.Wall || tile === Tile.Void || tile === Tile.Door) continue;
        const frame = variants[state.dungeon.tileVariants[idx(state.dungeon, x, y)] % variants.length]!;
        const entries = tilesByFrame.get(frame) ?? [];
        entries.push({
          x,
          y,
          color: new THREE.Color(0.86 + ((x * 13 + y * 7) % 7) * 0.014, 0.78 + ((x + y) % 3) * 0.018, 0.64),
          rotation: ((x + y) % 2) * Math.PI * 0.5,
          lift: ((x + y) % 3) * 0.001
        });
        tilesByFrame.set(frame, entries);
      }
    }

    const tileGeometry = new THREE.PlaneGeometry(1.08, 1.08);
    for (const [frame, entries] of tilesByFrame) {
      const texture = this.texture(frame);
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x382413,
        emissiveIntensity: 0.32,
        roughness: 0.9,
        metalness: 0.02,
        transparent: true,
        opacity: 0.9,
        vertexColors: true
      });
      if (texture) material.map = texture;
      const mesh = new THREE.InstancedMesh(tileGeometry, material, entries.length);
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3(1, 1, 1);
      entries.forEach((entry, index) => {
        const pos = this.toWorld({ x: entry.x, y: entry.y });
        quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, entry.rotation));
        matrix.compose(new THREE.Vector3(pos.x, 0.003 + entry.lift, pos.z), quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, entry.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.staticWorld.add(mesh);
    }

    for (const decal of floorOneScene.floorDecals) {
      if (decal.kind === "rect")
        this.addGroundRect(
          decal.x,
          decal.y,
          decal.width,
          decal.depth,
          decal.color,
          decal.opacity,
          decal.rotation ?? 0
        );
      else
        this.addGroundDecal(
          decal.x,
          decal.y,
          decal.width,
          decal.depth,
          decal.color,
          decal.opacity,
          decal.rotation ?? 0
        );
    }
    this.buildBakedLightWashes();
    this.buildFloorMaterialDetails(room);
    this.buildPaintedFloorMass();
    this.buildRubbleClusters();
    this.buildDenseSceneDressing();
    this.buildVoidEdgeMasks();
  }

  private buildBakedLightWashes(): void {
    this.addGroundGlowDecal(0.25, 0.25, 8.35, 4.3, 0xd17832, 0.42, -0.2);
    this.addGroundGlowDecal(0.2, -4.65, 5.1, 2.28, 0xff7a2b, 0.31, 0.04);
    this.addGroundGlowDecal(-5.45, -3.45, 3.85, 2.05, 0x54b6d6, 0.3, 0.14);
    this.addGroundGlowDecal(5.25, 2.45, 4.35, 1.95, 0xd9963b, 0.28, -0.36);
    this.addGroundGlowDecal(6.4, 4.65, 4.3, 2.15, 0x49a9c5, 0.25, -0.2);
    this.addGroundGlowDecal(-7.05, 4.15, 3.75, 1.82, 0x234f59, 0.16, -0.25);
    this.addGroundGlowDecal(7.45, -2.55, 3.85, 1.72, 0xc7782f, 0.17, 0.18);
  }

  private buildVoidEdgeMasks(): void {
    const masks = [
      { x: -8.65, z: 1.25, width: 2.0, depth: 7.4, opacity: 0.15, rotation: -0.1 },
      { x: -7.45, z: 4.95, width: 3.6, depth: 1.55, opacity: 0.13, rotation: -0.24 },
      { x: 8.7, z: -0.15, width: 2.05, depth: 7.2, opacity: 0.13, rotation: 0.08 },
      { x: 7.15, z: 5.85, width: 4.6, depth: 1.6, opacity: 0.13, rotation: -0.2 },
      { x: -1.15, z: -6.55, width: 8.6, depth: 1.05, opacity: 0.12, rotation: 0.03 },
      { x: 0.55, z: 6.75, width: 8.0, depth: 1.15, opacity: 0.15, rotation: 0.04 }
    ];
    for (const mask of masks)
      this.addGroundRect(mask.x, mask.z, mask.width, mask.depth, 0x020506, mask.opacity, mask.rotation);

    const bites = [
      { x: -6.65, z: -5.65, width: 1.9, depth: 0.8, rotation: 0.18 },
      { x: -3.9, z: -6.15, width: 1.35, depth: 0.72, rotation: -0.26 },
      { x: 4.85, z: -6.08, width: 2.0, depth: 0.86, rotation: 0.28 },
      { x: -7.9, z: -0.92, width: 1.22, depth: 1.86, rotation: 0.36 },
      { x: 8.05, z: 2.35, width: 1.42, depth: 2.1, rotation: -0.18 },
      { x: -4.95, z: 5.82, width: 1.9, depth: 0.84, rotation: -0.32 },
      { x: 3.1, z: 6.22, width: 2.1, depth: 0.9, rotation: 0.2 }
    ];
    for (const bite of bites) this.addGroundDecal(bite.x, bite.z, bite.width, bite.depth, 0x020506, 0.22, bite.rotation);
  }

  private buildFloorMaterialDetails(room: GameState["dungeon"]["rooms"][number]): void {
    const minX = room.x + 1;
    const maxX = room.x + room.w - 1;
    const minY = room.y + 1;
    const maxY = room.y + room.h - 1;
    const seams: FloorDetailInstance[] = [];
    const cracks: FloorDetailInstance[] = [];
    const warmChips: FloorDetailInstance[] = [];
    const coldChips: FloorDetailInstance[] = [];
    const textureStamps: FloorDetailInstance[] = [];

    for (let x = minX + 1; x < maxX; x += 1) {
      for (let y = minY; y < maxY; y += 1) {
        if ((x + y) % 3 === 0) continue;
        seams.push({ x: x - 0.5, y, width: 0.022, depth: 0.88, rotation: 0 });
      }
    }
    for (let y = minY + 1; y < maxY; y += 1) {
      for (let x = minX; x < maxX; x += 1) {
        if ((x * 2 + y) % 4 === 0) continue;
        seams.push({ x, y: y - 0.5, width: 0.88, depth: 0.022, rotation: 0 });
      }
    }

    for (let y = minY; y < maxY; y += 1) {
      for (let x = minX; x < maxX; x += 1) {
        const roll = detailNoise(x * 31 + y * 67 + room.cx * 13);
        if (roll > 0.62) {
          cracks.push({
            x: x + (detailNoise(x * 17 + y * 43) - 0.5) * 0.52,
            y: y + (detailNoise(x * 29 + y * 59) - 0.5) * 0.52,
            width: 0.5 + detailNoise(x * 71 + y * 19) * 0.62,
            depth: 0.024 + detailNoise(x * 11 + y * 97) * 0.026,
            rotation: (detailNoise(x * 41 + y * 23) - 0.5) * Math.PI
          });
        }
        if (roll < 0.22) {
          const chip: FloorDetailInstance = {
            x: x + (detailNoise(x * 53 + y * 7) - 0.5) * 0.62,
            y: y + (detailNoise(x * 83 + y * 5) - 0.5) * 0.62,
            width: 0.05 + detailNoise(x * 37 + y * 89) * 0.11,
            depth: 0.04 + detailNoise(x * 73 + y * 47) * 0.08,
            rotation: detailNoise(x * 109 + y * 3) * Math.PI
          };
          if ((x + y) % 2 === 0) warmChips.push(chip);
          else coldChips.push(chip);
        }
        if ((x * 5 + y * 7) % 31 === 0) {
          textureStamps.push({
            x: x + (detailNoise(x * 13 + y * 17) - 0.5) * 0.2,
            y: y + (detailNoise(x * 19 + y * 31) - 0.5) * 0.2,
            width: 0.78,
            depth: 0.78,
            rotation: ((x + y) % 4) * Math.PI * 0.5
          });
        }
      }
    }

    this.addFloorDetailInstances(seams, 0x18110b, 0.46, 0.027);
    this.addFloorDetailInstances(cracks, 0x21170f, 0.55, 0.032);
    this.addFloorDetailInstances(warmChips, 0xc2965d, 0.42, 0.034);
    this.addFloorDetailInstances(coldChips, 0x6c8080, 0.28, 0.035);
    this.addFloorTextureInstances("raster-floor-compass", textureStamps, 0xb8874e, 0.32, 0.031);
  }

  private buildPaintedFloorMass(): void {
    const stains = [
      { x: -2.65, z: -1.1, width: 4.2, depth: 1.15, color: 0x150908, opacity: 0.24, rotation: -0.2 },
      { x: 2.6, z: -0.45, width: 4.6, depth: 1.25, color: 0x171107, opacity: 0.18, rotation: 0.16 },
      { x: -4.6, z: 1.95, width: 3.6, depth: 1.05, color: 0x0c1516, opacity: 0.18, rotation: 0.28 },
      { x: 4.75, z: 3.45, width: 4.0, depth: 1.25, color: 0x102126, opacity: 0.22, rotation: -0.28 },
      { x: -0.55, z: 3.2, width: 5.4, depth: 1.0, color: 0x2a160d, opacity: 0.16, rotation: 0.08 },
      { x: 1.6, z: -3.25, width: 5.0, depth: 1.1, color: 0x5d3017, opacity: 0.13, rotation: -0.08 }
    ];
    for (const stain of stains)
      this.addGroundDecal(stain.x, stain.z, stain.width, stain.depth, stain.color, stain.opacity, stain.rotation);

    const crackedStamps: FloorDetailInstance[] = [];
    const rubbleStamps: FloorDetailInstance[] = [];
    const runeGhosts: FloorDetailInstance[] = [];
    const darkScars: FloorDetailInstance[] = [];
    const warmScrapes: FloorDetailInstance[] = [];
    const coldScrapes: FloorDetailInstance[] = [];
    const emberSpecks: FloorDetailInstance[] = [];
    const boneFlecks: FloorDetailInstance[] = [];
    const goldFlecks: FloorDetailInstance[] = [];

    for (let index = 0; index < 68; index += 1) {
      const seed = 701 + index * 113;
      const x = -7.15 + detailNoise(seed + 1) * 14.3;
      const z = -5.25 + detailNoise(seed + 3) * 10.5;
      const angle = -0.36 + detailNoise(seed + 5) * 0.72 + (detailNoise(seed + 7) > 0.7 ? Math.PI * 0.5 : 0);
      const width = 0.38 + detailNoise(seed + 11) * 1.55;
      const depth = 0.014 + detailNoise(seed + 13) * 0.032;
      const entry = {
        x,
        y: z,
        width,
        depth,
        rotation: angle + (detailNoise(seed + 17) - 0.5) * 0.18
      };
      const roll = detailNoise(seed + 19);
      if (roll < 0.56) darkScars.push(entry);
      else if (roll < 0.8) warmScrapes.push(entry);
      else coldScrapes.push(entry);
    }

    for (let index = 0; index < 86; index += 1) {
      const seed = 2303 + index * 97;
      const x = -7.35 + detailNoise(seed + 1) * 14.7;
      const z = -5.35 + detailNoise(seed + 3) * 10.6;
      const roll = detailNoise(seed + 5);
      const entry = {
        x,
        y: z,
        width: 0.018 + detailNoise(seed + 7) * 0.08,
        depth: 0.014 + detailNoise(seed + 11) * 0.052,
        rotation: detailNoise(seed + 13) * Math.PI
      };
      if (roll < 0.42) boneFlecks.push(entry);
      else if (roll < 0.6) emberSpecks.push(entry);
      else if (roll < 0.68) goldFlecks.push(entry);
    }

    const stampCenters = [
      { x: -4.25, z: -1.55, frame: "raster-floor-cracked", color: 0x9a6a3a, rotation: -0.14 },
      { x: -0.65, z: -2.35, frame: "raster-floor-rubble", color: 0x8c6a4a, rotation: 0.2 },
      { x: 2.9, z: 1.95, frame: "raster-floor-cracked", color: 0x806444, rotation: -0.32 },
      { x: 4.95, z: -2.55, frame: "raster-floor-rubble", color: 0x9d673b, rotation: 0.12 },
      { x: -3.8, z: 3.65, frame: "raster-floor-rubble", color: 0x6f6857, rotation: 0.28 },
      { x: 1.55, z: 3.85, frame: "raster-floor-cracked", color: 0xa2733f, rotation: -0.18 },
      { x: -0.15, z: 0.25, frame: "raster-floor-rune", color: 0x8c3b2e, rotation: 0.1 }
    ];
    for (const stamp of stampCenters) {
      const entry = {
        x: stamp.x,
        y: stamp.z,
        width: stamp.frame === "raster-floor-rune" ? 1.45 : 1.65,
        depth: stamp.frame === "raster-floor-rune" ? 0.9 : 1.05,
        rotation: stamp.rotation
      };
      if (stamp.frame === "raster-floor-rubble") rubbleStamps.push(entry);
      else if (stamp.frame === "raster-floor-rune") runeGhosts.push(entry);
      else crackedStamps.push(entry);
    }

    this.addLocalFloorTextureInstances("raster-floor-cracked", crackedStamps, 0xa07745, 0.22, 0.036);
    this.addLocalFloorTextureInstances("raster-floor-rubble", rubbleStamps, 0x8e7454, 0.2, 0.037);
    this.addLocalFloorTextureInstances("raster-floor-rune", runeGhosts, 0xb03f35, 0.16, 0.038);
    this.addLocalFloorDetailInstances(darkScars, 0x090604, 0.36, 0.042);
    this.addLocalFloorDetailInstances(warmScrapes, 0x8c512c, 0.18, 0.043);
    this.addLocalFloorDetailInstances(coldScrapes, 0x365257, 0.16, 0.044);
    this.addLocalFloorDetailInstances(emberSpecks, 0x9d5f2d, 0.24, 0.047);
    this.addLocalFloorDetailInstances(boneFlecks, 0x75674d, 0.22, 0.048);
    this.addLocalFloorDetailInstances(goldFlecks, 0xb9843f, 0.26, 0.049);
  }

  private buildRubbleClusters(): void {
    const blocks: StoneBlockInstance[] = [];
    for (const cluster of floorOneScene.rubbleClusters) {
      const cos = Math.cos(cluster.rotation ?? 0);
      const sin = Math.sin(cluster.rotation ?? 0);
      this.addGroundDecal(
        cluster.x,
        cluster.y,
        cluster.width * 1.12,
        cluster.depth * 1.08,
        0x030202,
        0.18,
        cluster.rotation ?? 0
      );
      for (let index = 0; index < cluster.count; index += 1) {
        const seed = index * 97 + cluster.x * 31 + cluster.y * 53;
        const localX = (detailNoise(seed + 3) - 0.5) * cluster.width;
        const localZ = (detailNoise(seed + 7) - 0.5) * cluster.depth;
        const x = cluster.x + localX * cos - localZ * sin;
        const z = cluster.y + localX * sin + localZ * cos;
        const warm = detailNoise(seed + 11);
        const color = new THREE.Color(cluster.color);
        if (cluster.accentColor !== undefined) color.lerp(new THREE.Color(cluster.accentColor), warm * 0.45);
        color.lerp(new THREE.Color(0x0c0906), detailNoise(seed + 13) * 0.12);
        const height = 0.018 + detailNoise(seed + 17) * 0.052;
        blocks.push({
          x,
          y: height * 0.5 + 0.035,
          z,
          width: 0.035 + detailNoise(seed + 19) * 0.14,
          height,
          depth: 0.025 + detailNoise(seed + 23) * 0.11,
          rotation: (cluster.rotation ?? 0) + (detailNoise(seed + 29) - 0.5) * Math.PI,
          color
        });
      }
    }
    this.addSolidBlockInstances(blocks, 0.94);
  }

  private buildDenseSceneDressing(): void {
    const stampsByFrame = new Map<string, FloorDetailInstance[]>();
    const darkFlecks: FloorDetailInstance[] = [];
    const warmFlecks: FloorDetailInstance[] = [];
    const coldFlecks: FloorDetailInstance[] = [];
    const blocks: StoneBlockInstance[] = [];
    const billboards: StaticBillboardInstance[] = [];

    for (let clusterIndex = 0; clusterIndex < floorOneScene.dressingClusters.length; clusterIndex += 1) {
      const cluster = floorOneScene.dressingClusters[clusterIndex]!;
      this.addGroundDecal(
        cluster.x,
        cluster.y,
        cluster.width * 1.18,
        cluster.depth * 1.15,
        cluster.shadow,
        0.2,
        cluster.rotation
      );
      const cos = Math.cos(cluster.rotation);
      const sin = Math.sin(cluster.rotation);
      for (let index = 0; index < cluster.count; index += 1) {
        const seed = clusterIndex * 1009 + index * 97;
        const angle = detailNoise(seed + 1) * Math.PI * 2;
        const radius = Math.sqrt(detailNoise(seed + 3));
        const localX = Math.cos(angle) * radius * cluster.width * 0.5;
        const localZ = Math.sin(angle) * radius * cluster.depth * 0.5;
        const x = cluster.x + localX * cos - localZ * sin;
        const z = cluster.y + localX * sin + localZ * cos;
        const roll = detailNoise(seed + 5);
        const color = new THREE.Color(cluster.color).lerp(new THREE.Color(cluster.accent), detailNoise(seed + 7) * 0.5);

        if (roll < 0.2) {
          const frameEntries = stampsByFrame.get(cluster.stamp) ?? [];
          frameEntries.push({
            x,
            y: z,
            width: 0.36 + detailNoise(seed + 11) * 0.46,
            depth: 0.22 + detailNoise(seed + 13) * 0.28,
            rotation: cluster.rotation + (detailNoise(seed + 17) - 0.5) * Math.PI
          });
          stampsByFrame.set(cluster.stamp, frameEntries);
        } else if (roll < 0.48) {
          const target = detailNoise(seed + 19) > 0.72 ? coldFlecks : warmFlecks;
          target.push({
            x,
            y: z,
            width: 0.035 + detailNoise(seed + 23) * 0.1,
            depth: 0.028 + detailNoise(seed + 29) * 0.08,
            rotation: detailNoise(seed + 31) * Math.PI
          });
        } else if (roll < 0.86) {
          const height = 0.018 + detailNoise(seed + 37) * 0.05;
          blocks.push({
            x,
            y: 0.04 + height * 0.5,
            z,
            width: 0.035 + detailNoise(seed + 41) * 0.13,
            height,
            depth: 0.028 + detailNoise(seed + 43) * 0.1,
            rotation: cluster.rotation + (detailNoise(seed + 47) - 0.5) * Math.PI,
            color
          });
        } else {
          billboards.push({
            frame: cluster.sprite,
            x,
            z,
            scale: 0.18 + detailNoise(seed + 53) * 0.16,
            height: 0.28 + detailNoise(seed + 59) * 0.18
          });
        }

        if (detailNoise(seed + 61) > 0.82) {
          darkFlecks.push({
            x: x + (detailNoise(seed + 67) - 0.5) * 0.18,
            y: z + (detailNoise(seed + 71) - 0.5) * 0.18,
            width: 0.11 + detailNoise(seed + 73) * 0.24,
            depth: 0.018 + detailNoise(seed + 79) * 0.03,
            rotation: detailNoise(seed + 83) * Math.PI
          });
        }
      }
    }

    for (const [frame, entries] of stampsByFrame)
      this.addLocalFloorTextureInstances(frame, entries, 0xb89662, 0.28, 0.038);
    this.addLocalFloorDetailInstances(darkFlecks, 0x080605, 0.5, 0.043);
    this.addLocalFloorDetailInstances(warmFlecks, 0xd0a05f, 0.48, 0.045);
    this.addLocalFloorDetailInstances(coldFlecks, 0x77a5a7, 0.34, 0.046);
    this.addSolidBlockInstances(blocks, 0.95);
    this.addStaticBillboardInstances(billboards);
  }

  private addFloorDetailInstances(
    entries: FloorDetailInstance[],
    color: number,
    opacity: number,
    lift: number
  ): void {
    if (!entries.length) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: true
      }),
      entries.length
    );
    this.writeFloorDetailMatrices(mesh, entries, lift);
    this.staticWorld.add(mesh);
  }

  private addLocalFloorDetailInstances(
    entries: FloorDetailInstance[],
    color: number,
    opacity: number,
    lift: number
  ): void {
    if (!entries.length) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: true
      }),
      entries.length
    );
    this.writeLocalFloorDetailMatrices(mesh, entries, lift);
    this.staticWorld.add(mesh);
  }

  private addFloorTextureInstances(
    frame: string,
    entries: FloorDetailInstance[],
    color: number,
    opacity: number,
    lift: number
  ): void {
    if (!entries.length) return;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true
    });
    const texture = this.texture(frame);
    if (texture) material.map = texture;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, entries.length);
    this.writeFloorDetailMatrices(mesh, entries, lift);
    this.staticWorld.add(mesh);
  }

  private addLocalFloorTextureInstances(
    frame: string,
    entries: FloorDetailInstance[],
    color: number,
    opacity: number,
    lift: number
  ): void {
    if (!entries.length) return;
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true
    });
    const texture = this.texture(frame);
    if (texture) material.map = texture;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, entries.length);
    this.writeLocalFloorDetailMatrices(mesh, entries, lift);
    this.staticWorld.add(mesh);
  }

  private writeFloorDetailMatrices(
    mesh: THREE.InstancedMesh,
    entries: FloorDetailInstance[],
    lift: number
  ): void {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      const pos = this.toWorld({ x: entry.x, y: entry.y });
      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, entry.rotation));
      matrix.compose(
        new THREE.Vector3(pos.x, lift, pos.z),
        quaternion,
        new THREE.Vector3(entry.width, entry.depth, 1)
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private writeLocalFloorDetailMatrices(
    mesh: THREE.InstancedMesh,
    entries: FloorDetailInstance[],
    lift: number
  ): void {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, entry.rotation));
      matrix.compose(
        new THREE.Vector3(entry.x, lift, entry.y),
        quaternion,
        new THREE.Vector3(entry.width, entry.depth, 1)
      );
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private buildWalls(): void {
    const wallTexture = this.proceduralTexture(PROCEDURAL_WALL_TEXTURE, () => this.createPaintedWallTexture());
    const capTexture = this.proceduralTexture(PROCEDURAL_CAP_TEXTURE, () => this.createPaintedCapTexture());
    const wallBlocks: StaticBoxInstance[] = [];
    const foregroundWallBlocks: StaticBoxInstance[] = [];
    const capBlocks: StaticBoxInstance[] = [];
    const buttressBlocks: StaticBoxInstance[] = [];
    const foregroundButtressBlocks: StaticBoxInstance[] = [];
    const gothicReliefBlocks: StaticBoxInstance[] = [];
    const foregroundGothicReliefBlocks: StaticBoxInstance[] = [];
    const archRecessBlocks: StaticBoxInstance[] = [];
    const reliefRimBlocks: StaticBoxInstance[] = [];
    const wallFacadePanels: WallFacadeInstance[] = [];
    const foregroundWallFacadePanels: WallFacadeInstance[] = [];
    const wallLightPanels: WallLightPanelInstance[] = [];
    const foregroundWallLightPanels: WallLightPanelInstance[] = [];
    const authoredWarmWallPanels: WallFacadeInstance[] = [];
    const authoredColdWallPanels: WallFacadeInstance[] = [];
    const authoredShadowWallPanels: WallFacadeInstance[] = [];
    const authoredRimWallPanels: WallFacadeInstance[] = [];
    const wallKitFacades: WallKitFacadeInstance[] = [];
    const wallSpans: WallSpanInstance[] = [];
    const topHighlightBlocks: StaticBoxInstance[] = [];
    const foregroundTopHighlightBlocks: StaticBoxInstance[] = [];
    const faceShadowBlocks: StaticBoxInstance[] = [];
    const foregroundFaceShadowBlocks: StaticBoxInstance[] = [];
    const emberHighlightBlocks: StaticBoxInstance[] = [];
    const capChipBlocks: StoneBlockInstance[] = [];
    const wallDressingBillboards: StaticBillboardInstance[] = [];
    for (const run of floorOneScene.wallRuns) {
      const horizontal = Math.abs(run.to.x - run.from.x) >= Math.abs(run.to.y - run.from.y);
      const length = horizontal ? Math.abs(run.to.x - run.from.x) : Math.abs(run.to.y - run.from.y);
      const midX = (run.from.x + run.to.x) / 2;
      const midZ = (run.from.y + run.to.y) / 2;
      const wallTarget = run.id === "foreground" ? foregroundWallBlocks : wallBlocks;
      wallTarget.push({
        x: midX,
        y: run.height / 2 - 0.02,
        z: midZ,
        width: horizontal ? length : run.thickness,
        height: run.height,
        depth: horizontal ? run.thickness : length,
        color: new THREE.Color(run.id === "foreground" ? 0x674833 : 0x9f7350)
      });
      capBlocks.push({
        x: midX,
        y: run.height + 0.05,
        z: midZ,
        width: horizontal ? length + 0.18 : run.thickness + 0.18,
        height: 0.18,
        depth: horizontal ? run.thickness + 0.18 : length + 0.18,
        color: new THREE.Color(run.id === "foreground" ? 0x876346 : 0xc39062)
      });
      this.collectWallHighlights(
        run,
        horizontal,
        length,
        topHighlightBlocks,
        foregroundTopHighlightBlocks,
        faceShadowBlocks,
        foregroundFaceShadowBlocks,
        emberHighlightBlocks
      );
      this.addWallMasonry(run, horizontal, length);
      this.collectWallCapChips(run, horizontal, length, capChipBlocks);
      this.collectWallButtresses(run, horizontal, buttressBlocks, foregroundButtressBlocks);
      this.collectWallRelief(
        run,
        horizontal,
        length,
        gothicReliefBlocks,
        foregroundGothicReliefBlocks,
        archRecessBlocks,
        reliefRimBlocks
      );
      this.collectWallFacadePanels(run, horizontal, length, wallFacadePanels, foregroundWallFacadePanels);
      this.collectWallKitFacades(run, horizontal, length, wallKitFacades);
      this.collectWallLightPanels(run, horizontal, length, wallLightPanels, foregroundWallLightPanels);
    }
    this.collectAuthoredWallAccents(
      authoredWarmWallPanels,
      authoredColdWallPanels,
      authoredShadowWallPanels,
      authoredRimWallPanels
    );
    this.collectAuthoredWallKitFacades(wallKitFacades);
    this.collectCameraMatchedWallSpans(wallSpans);

    this.addBoxInstances(
      wallBlocks,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: wallTexture,
        emissive: 0x5a381f,
        emissiveIntensity: 0.82,
        roughness: 0.86,
        metalness: 0.03,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      foregroundWallBlocks,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: wallTexture,
        emissive: 0x2c1b11,
        emissiveIntensity: 0.56,
        roughness: 0.86,
        metalness: 0.03,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      capBlocks,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: capTexture,
        emissive: 0x593a22,
        emissiveIntensity: 0.76,
        roughness: 0.82,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      buttressBlocks,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x3a2819,
        emissiveIntensity: 0.56,
        roughness: 0.88,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      foregroundButtressBlocks,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x24170f,
        emissiveIntensity: 0.42,
        roughness: 0.88,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      gothicReliefBlocks,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x6a4526,
        emissiveIntensity: 0.82,
        roughness: 0.86,
        metalness: 0.02,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      foregroundGothicReliefBlocks,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x3d2818,
        emissiveIntensity: 0.58,
        roughness: 0.88,
        metalness: 0.02,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      archRecessBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      reliefRimBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexColors: true
      })
    );
    this.buildWallAtmosphericDepth();
    this.addWallFacadeInstances(wallFacadePanels, 0.34);
    this.addWallFacadeInstances(foregroundWallFacadePanels, 0.26);
    this.addWallAccentPanelInstances(authoredShadowWallPanels, 0.24, false);
    this.addWallKitFacadeInstances(wallKitFacades);
    this.addWallSpanInstances(wallSpans);
    this.addWallLightPanelInstances(wallLightPanels, 0.96);
    this.addWallLightPanelInstances(foregroundWallLightPanels, 0.56);
    this.addWallAccentPanelInstances(authoredWarmWallPanels, 0.88, true);
    this.addWallAccentPanelInstances(authoredColdWallPanels, 0.72, true);
    this.addWallAccentPanelInstances(authoredRimWallPanels, 0.82, true);
    this.addBoxInstances(
      topHighlightBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.66,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      foregroundTopHighlightBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      faceShadowBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      foregroundFaceShadowBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      emberHighlightBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexColors: true
      })
    );
    this.addSolidBlockInstances(capChipBlocks, 0.9);
    this.buildPillars();
    this.buildRuinCrownBlocks();
    this.buildBrokenForegroundSilhouette();

    for (const point of floorOneScene.torchPlacements) {
      wallDressingBillboards.push({
        frame: "sprite-wall-torch",
        x: point.x,
        z: point.y,
        scale: 1.08,
        height: 1.8
      });
      this.addPointLight(point.x, point.y, 0xffb057, 2.04, 5.8, 1.72);
      this.addGroundDecal(point.x, point.y + 0.22, 3.7, 1.9, 0xb5652b, 0.42, 0);
    }
    this.addStaticBillboardInstances(wallDressingBillboards);
  }

  private buildWallAtmosphericDepth(): void {
    const darkRecessBlocks: StaticBoxInstance[] = [];
    const warmWashBlocks: StaticBoxInstance[] = [];
    const coldWashBlocks: StaticBoxInstance[] = [];
    const rimLightBlocks: StaticBoxInstance[] = [];
    const baseContactBlocks: StaticBoxInstance[] = [];

    const pushFaceBlock = (
      target: StaticBoxInstance[],
      run: (typeof floorOneScene.wallRuns)[number],
      horizontal: boolean,
      along: number,
      normalOffset: number,
      alongSize: number,
      normalSize: number,
      y: number,
      height: number,
      color: number
    ): void => {
      const interiorSide = this.wallInteriorSide(run, horizontal);
      const midX = (run.from.x + run.to.x) / 2;
      const midZ = (run.from.y + run.to.y) / 2;
      target.push({
        x: horizontal ? along : midX + interiorSide.x * normalOffset,
        y,
        z: horizontal ? midZ + interiorSide.z * normalOffset : along,
        width: horizontal ? alongSize : normalSize,
        height,
        depth: horizontal ? normalSize : alongSize,
        color: new THREE.Color(color)
      });
    };

    for (const run of floorOneScene.wallRuns) {
      const horizontal = Math.abs(run.to.x - run.from.x) >= Math.abs(run.to.y - run.from.y);
      const length = horizontal ? Math.abs(run.to.x - run.from.x) : Math.abs(run.to.y - run.from.y);
      const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
      const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
      const isForeground = run.id === "foreground";
      const faceOffset = run.thickness * (isForeground ? 0.66 : 0.86);
      const segmentCount = Math.max(2, Math.floor(length / 2.4));

      for (let index = 0; index < segmentCount; index += 1) {
        const seed = length * 127 + index * 199 + run.height * 43 + (horizontal ? 7 : 53);
        const segmentT = (index + 0.5 + (detailNoise(seed + 1) - 0.5) * 0.18) / segmentCount;
        const along = min + (max - min) * segmentT;
        const span = (max - min) / segmentCount;
        const panelLength = Math.max(0.72, span * (0.58 + detailNoise(seed + 3) * 0.26));
        const pocketHeight = run.height * (0.52 + detailNoise(seed + 5) * 0.18);
        const pocketY = 0.28 + pocketHeight * 0.5;
        const warmBias =
          run.id === "north" ||
          run.id === "west-rail" ||
          run.id === "south-rail" ||
          detailNoise(seed + 7) > 0.54;
        const coldBias = run.id === "east" || run.id.includes("stair") || detailNoise(seed + 11) > 0.78;

        pushFaceBlock(
          darkRecessBlocks,
          run,
          horizontal,
          along,
          faceOffset + 0.018,
          panelLength,
          0.044,
          pocketY,
          pocketHeight,
          isForeground ? 0x080504 : coldBias ? 0x041014 : 0x0d0805
        );

        const washHeight = run.height * (0.62 + detailNoise(seed + 13) * 0.22);
        const washY = 0.2 + washHeight * 0.5;
        pushFaceBlock(
          warmBias && !coldBias ? warmWashBlocks : coldWashBlocks,
          run,
          horizontal,
          along + (detailNoise(seed + 17) - 0.5) * span * 0.16,
          faceOffset + 0.05,
          panelLength * (0.48 + detailNoise(seed + 19) * 0.24),
          0.036,
          washY,
          washHeight,
          warmBias && !coldBias ? 0xd97a34 : 0x6dc9d4
        );

        if (!isForeground || index % 2 === 0) {
          const rimOffset = panelLength * (detailNoise(seed + 23) > 0.5 ? -0.43 : 0.43);
          pushFaceBlock(
            rimLightBlocks,
            run,
            horizontal,
            along + rimOffset,
            faceOffset + 0.072,
            0.034,
            0.05,
            run.height * 0.52,
            run.height * 0.64,
            coldBias ? 0xa6e4e8 : 0xe7a45a
          );
        }
      }

      const mid = (min + max) / 2;
      pushFaceBlock(
        baseContactBlocks,
        run,
        horizontal,
        mid,
        faceOffset + 0.034,
        length * 0.92,
        0.06,
        0.12,
        0.12,
        isForeground ? 0x020202 : 0x090504
      );
      pushFaceBlock(
        rimLightBlocks,
        run,
        horizontal,
        mid,
        faceOffset + 0.08,
        length * (isForeground ? 0.42 : 0.72),
        0.048,
        run.height + 0.24,
        0.04,
        isForeground ? 0x8f6037 : 0xf0a45a
      );
    }

    this.addBoxInstances(
      darkRecessBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      warmWashBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      coldWashBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      rimLightBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        vertexColors: true
      })
    );
    this.addBoxInstances(
      baseContactBlocks,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      })
    );
  }

  private collectWallHighlights(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    length: number,
    topHighlightBlocks: StaticBoxInstance[],
    foregroundTopHighlightBlocks: StaticBoxInstance[],
    faceShadowBlocks: StaticBoxInstance[],
    foregroundFaceShadowBlocks: StaticBoxInstance[],
    emberHighlightBlocks: StaticBoxInstance[]
  ): void {
    const midX = (run.from.x + run.to.x) / 2;
    const midZ = (run.from.y + run.to.y) / 2;
    const topTarget = run.id === "foreground" ? foregroundTopHighlightBlocks : topHighlightBlocks;
    topTarget.push({
      x: midX,
      y: run.height + 0.18,
      z: midZ,
      width: horizontal ? length + 0.14 : 0.055,
      height: 0.035,
      depth: horizontal ? 0.055 : length + 0.14,
      color: new THREE.Color(run.id === "foreground" ? 0x9e7140 : 0xf0ad61)
    });

    const interiorSide = this.wallInteriorSide(run, horizontal);
    const faceTarget = run.id === "foreground" ? foregroundFaceShadowBlocks : faceShadowBlocks;
    faceTarget.push({
      x: midX + interiorSide.x * run.thickness * 0.54,
      y: run.height * 0.5,
      z: midZ + interiorSide.z * run.thickness * 0.54,
      width: horizontal ? length * 0.96 : 0.038,
      height: run.height * 0.62,
      depth: horizontal ? 0.038 : length * 0.96,
      color: new THREE.Color(run.id === "foreground" ? 0x84613c : 0xca8b4b)
    });
    faceTarget.push({
      x: midX + interiorSide.x * run.thickness * 0.565,
      y: run.height * 0.28,
      z: midZ + interiorSide.z * run.thickness * 0.565,
      width: horizontal ? length * 0.9 : 0.032,
      height: 0.036,
      depth: horizontal ? 0.032 : length * 0.9,
      color: new THREE.Color(run.id === "foreground" ? 0x2a1b10 : 0x3a2415)
    });

    if (run.id === "north" || run.id === "east" || run.id === "west-rail" || run.id === "south-rail") {
      emberHighlightBlocks.push({
        x: midX + interiorSide.x * run.thickness * 0.58,
        y: run.height * 0.36,
        z: midZ + interiorSide.z * run.thickness * 0.58,
        width: horizontal ? length * 0.58 : 0.035,
        height: 0.05,
        depth: horizontal ? 0.035 : length * 0.52,
        color: new THREE.Color(0xff9b45)
      });
    }
  }

  private collectWallRelief(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    length: number,
    reliefBlocks: StaticBoxInstance[],
    foregroundReliefBlocks: StaticBoxInstance[],
    archRecessBlocks: StaticBoxInstance[],
    reliefRimBlocks: StaticBoxInstance[]
  ): void {
    const interiorSide = this.wallInteriorSide(run, horizontal);
    const isForeground = run.id === "foreground";
    const reliefTarget = isForeground ? foregroundReliefBlocks : reliefBlocks;
    const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
    const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
    const midX = (run.from.x + run.to.x) / 2;
    const midZ = (run.from.y + run.to.y) / 2;
    const faceOffset = run.thickness * 0.72;
    const ribCount = Math.max(1, Math.floor(length / 2.05));
    const span = (max - min) / ribCount;

    const makeBox = (
      along: number,
      normalOffset: number,
      alongSize: number,
      normalSize: number,
      y: number,
      height: number,
      color: THREE.Color
    ): StaticBoxInstance => ({
      x: horizontal ? along : midX + interiorSide.x * normalOffset,
      y,
      z: horizontal ? midZ + interiorSide.z * normalOffset : along,
      width: horizontal ? alongSize : normalSize,
      height,
      depth: horizontal ? normalSize : alongSize,
      color
    });

    for (let index = 0; index <= ribCount; index += 1) {
      const along = min + span * index;
      const seed = length * 53 + index * 97 + run.height * 43;
      const ribHeight = run.height * (0.68 + detailNoise(seed + 1) * 0.12);
      const ribWidth = 0.14 + detailNoise(seed + 3) * 0.08;
      const ribColor = new THREE.Color(isForeground ? 0x5f4329 : 0x8c623a).lerp(
        new THREE.Color(0xd79a55),
        0.24 + detailNoise(seed + 5) * 0.24
      );
      reliefTarget.push(makeBox(along, faceOffset, ribWidth, 0.22, 0.25 + ribHeight * 0.5, ribHeight, ribColor));
      reliefTarget.push(
        makeBox(
          along,
          faceOffset + 0.018,
          ribWidth * 2.35,
          0.18,
          run.height * 0.8,
          0.16,
          new THREE.Color(isForeground ? 0x795532 : 0xba7d42)
        )
      );
    }

    for (let segment = 0; segment < ribCount; segment += 1) {
      const center = min + span * (segment + 0.5);
      const seed = length * 71 + segment * 83 + run.height * 29;
      const panelLength = Math.max(0.5, span * (0.54 + detailNoise(seed + 1) * 0.18));
      const panelHeight = run.height * (0.34 + detailNoise(seed + 3) * 0.12);
      const panelY = 0.5 + panelHeight * 0.5;
      const cold = detailNoise(seed + 5) > 0.68 || run.id.includes("stair") || run.id.includes("west");
      const recessColor = new THREE.Color(isForeground ? 0x120b07 : cold ? 0x102b32 : 0x2a180e);
      const rimColor = new THREE.Color(cold ? 0x8edce7 : 0xffb25c);
      const recessDepth = 0.034;
      const rimDepth = 0.052;
      archRecessBlocks.push(makeBox(center, faceOffset + 0.012, panelLength, recessDepth, panelY, panelHeight, recessColor));

      const sideOffset = panelLength * 0.42;
      const rimHeight = panelHeight * 0.72;
      const rimY = panelY + panelHeight * 0.02;
      reliefRimBlocks.push(makeBox(center - sideOffset, faceOffset + 0.028, 0.026, rimDepth, rimY, rimHeight, rimColor));
      reliefRimBlocks.push(makeBox(center + sideOffset, faceOffset + 0.028, 0.026, rimDepth, rimY, rimHeight, rimColor));
      reliefRimBlocks.push(
        makeBox(
          center,
          faceOffset + 0.03,
          panelLength * 0.74,
          rimDepth,
          panelY + panelHeight * 0.48,
          0.034,
          rimColor
        )
      );
    }
  }

  private collectWallFacadePanels(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    length: number,
    panels: WallFacadeInstance[],
    foregroundPanels: WallFacadeInstance[]
  ): void {
    const target = run.id === "foreground" ? foregroundPanels : panels;
    const interiorSide = this.wallInteriorSide(run, horizontal);
    const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
    const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
    const midX = (run.from.x + run.to.x) / 2;
    const midZ = (run.from.y + run.to.y) / 2;
    const isForeground = run.id === "foreground";
    const segmentCount = Math.max(2, Math.floor(length / 2.15));
    const span = (max - min) / segmentCount;
    const faceOffset = run.thickness * (isForeground ? 0.72 : 0.92);

    for (let segment = 0; segment < segmentCount; segment += 1) {
      if (isForeground && segment % 2 === 1) continue;
      const seed = length * 149 + segment * 181 + run.height * 67 + (horizontal ? 19 : 43);
      const t = (segment + 0.5 + (detailNoise(seed + 1) - 0.5) * 0.18) / segmentCount;
      const along = min + (max - min) * t;
      const width = Math.max(0.66, span * (0.48 + detailNoise(seed + 3) * 0.18));
      const height = run.height * (0.5 + detailNoise(seed + 5) * 0.16);
      const y = 0.34 + height * 0.5 + detailNoise(seed + 7) * 0.08;
      const cold =
        run.id === "east" ||
        run.id.includes("stair") ||
        run.id.includes("west") ||
        detailNoise(seed + 11) > 0.78;
      const base = new THREE.Color(isForeground ? 0x6a472c : 0x9c6839);
      const accent = new THREE.Color(cold ? 0x78c6d4 : 0xffb160);
      const color = base.lerp(accent, cold ? 0.2 : 0.28 + detailNoise(seed + 13) * 0.1);

      target.push({
        x: horizontal ? along : midX + interiorSide.x * faceOffset,
        y,
        z: horizontal ? midZ + interiorSide.z * faceOffset : along,
        width,
        height,
        rotationY: horizontal ? 0 : Math.PI * 0.5,
        color
      });
    }
  }

  private collectWallKitFacades(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    length: number,
    facades: WallKitFacadeInstance[]
  ): void {
    const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
    const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
    const isLowWall = run.height < 1.7 || run.id === "foreground" || run.id.includes("rail");
    const segmentTarget = isLowWall ? 1.62 : run.id === "north" ? 2.24 : 1.96;
    const segmentCount = Math.max(1, Math.floor(length / segmentTarget));
    const span = (max - min) / segmentCount;

    for (let segment = 0; segment < segmentCount; segment += 1) {
      const seed = length * 317 + segment * 197 + run.height * 41 + (horizontal ? 11 : 71);
      const along = min + span * (segment + 0.5);
      const frame = this.wallKitFrameForRun(run.id, horizontal, segment, segmentCount, seed);
      const baseHeight = isLowWall ? run.height * (0.76 + detailNoise(seed + 3) * 0.1) : run.height * 1.02;
      const height = clamp(baseHeight, isLowWall ? 0.92 : 2.05, isLowWall ? 1.96 : 3.28);
      const width = Math.max(1.08, span * (isLowWall ? 1.08 : 1.18));
      facades.push(
        this.wallKitFacadeOnRun(run, horizontal, along, frame, width, height, {
          y: 0.08 + height * 0.5,
          normalOffset: run.thickness * (run.id === "foreground" ? 0.98 : 1.12),
          color: this.wallKitFacadeTint(run, frame, seed).multiplyScalar(run.id === "foreground" ? 1.02 : 1.22),
          opacity: run.id === "foreground" ? 0.88 : isLowWall ? 0.94 : 1
        })
      );

      if (!isLowWall && segment % 3 === 1) {
        const trimFrame = segment % 2 === 0 ? "env-wall-cap-arcade" : "env-wall-cap-heavy";
        facades.push(
          this.wallKitFacadeOnRun(run, horizontal, along, trimFrame, width * 1.02, 0.62, {
            y: run.height - 0.24,
            normalOffset: run.thickness * 1.16,
            color: this.wallKitFacadeTint(run, trimFrame, seed + 17).multiplyScalar(1.12),
            opacity: 0.94
          })
        );
      }

      if (!isLowWall && segment < segmentCount - 1 && (run.id === "north" || segment % 2 === 0)) {
        const pillarFrame = segment % 2 === 0 ? "env-pillar-left" : "env-pillar-right";
        facades.push(
          this.wallKitFacadeOnRun(run, horizontal, min + span * (segment + 1), pillarFrame, 0.54, run.height * 0.92, {
            y: 0.08 + (run.height * 0.92) / 2,
            normalOffset: run.thickness * 1.22,
            color: this.wallKitFacadeTint(run, pillarFrame, seed + 31).multiplyScalar(1.32),
            opacity: 1
          })
        );
      }
    }
  }

  private wallKitFrameForRun(
    runId: string,
    horizontal: boolean,
    segment: number,
    segmentCount: number,
    seed: number
  ): string {
    if (runId === "foreground") return segment % 2 === 0 ? "env-wall-ruin-low" : "env-wall-ruin-corner";
    if (runId.includes("rail") || runId.includes("ledge"))
      return segment % 3 === 0 ? "env-stone-railing" : segment % 3 === 1 ? "env-wall-ruin-low" : "env-wall-cap-arcade";
    if (runId.includes("stair")) return segment % 2 === 0 ? "env-wall-arcade" : "env-wall-cracked";
    if (runId.includes("altar")) return segment % 2 === 0 ? "env-pillar-left" : "env-pillar-right";
    if (runId === "north") {
      const centerDistance = Math.abs(segment - Math.floor(segmentCount / 2));
      if (centerDistance <= 1) return "env-wall-torch-banner";
      const northPattern = ["env-wall-window", "env-wall-arcade", "env-wall-triple-arch", "env-wall-window"];
      return northPattern[segment % northPattern.length]!;
    }
    if (runId === "east")
      return segment % 3 === 0 ? "env-wall-window" : segment % 3 === 1 ? "env-wall-arcade" : "env-wall-triple-arch";
    if (!horizontal && detailNoise(seed + 5) > 0.72) return "env-wall-window";
    const variants = ["env-wall-window", "env-wall-cracked", "env-wall-triple-arch", "env-wall-arcade"];
    return variants[(segment + Math.floor(detailNoise(seed + 9) * variants.length)) % variants.length]!;
  }

  private collectAuthoredWallKitFacades(facades: WallKitFacadeInstance[]): void {
    for (const placement of floorOneScene.wallDressing) {
      const match = this.nearestWallRunForPoint(placement.x, placement.y);
      if (!match) continue;
      const height = placement.height ?? placement.scale * 1.65;
      const frame = placement.frame;
      const seed = placement.x * 101 + placement.y * 157 + height * 61;
      facades.push(
        this.wallKitFacadeOnRun(match.run, match.horizontal, match.along, frame, placement.scale * 1.22, height, {
          y: 0.07 + height * 0.5,
          normalOffset: match.run.thickness * 1.08,
          color: this.wallKitFacadeTint(match.run, frame, seed).multiplyScalar(frame.includes("banner") ? 1.14 : 1.04),
          opacity: frame.includes("banner") ? 0.96 : 0.98
        })
      );
    }
  }

  private collectCameraMatchedWallSpans(spans: WallSpanInstance[]): void {
    spans.push(
      {
        frame: "env-span-north-wall",
        x: -2.8,
        y: 2.16,
        z: -5.28,
        width: 8.9,
        height: 4.18,
        rotationY: 0,
        color: new THREE.Color(2.45, 2.1, 1.62),
        additive: true,
        billboard: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        renderOrder: 8
      },
      {
        frame: "env-span-door-arch",
        x: 4.55,
        y: 2.12,
        z: -5.24,
        width: 6.1,
        height: 4.04,
        rotationY: 0,
        color: new THREE.Color(2.55, 2.18, 1.68),
        additive: true,
        billboard: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        renderOrder: 8
      },
      {
        frame: "env-span-door-arch",
        x: -7.18,
        y: 1.76,
        z: -4.5,
        width: 4.65,
        height: 3.25,
        rotationY: 0,
        color: new THREE.Color(2.0, 1.72, 1.34),
        additive: true,
        billboard: true,
        opacity: 0.88,
        depthTest: false,
        depthWrite: false,
        renderOrder: 8
      },
      {
        frame: "env-span-side-return",
        x: -7.58,
        y: 1.72,
        z: 0.1,
        width: 5.9,
        height: 3.5,
        rotationY: Math.PI * 0.5,
        color: new THREE.Color(1.02, 1.22, 1.22),
        opacity: 0.96
      },
      {
        frame: "env-span-side-return",
        x: 7.58,
        y: 1.68,
        z: 2.35,
        width: -5.5,
        height: 3.28,
        rotationY: Math.PI * 0.5,
        color: new THREE.Color(1.08, 1.18, 1.18),
        opacity: 0.9
      },
      {
        frame: "env-span-foreground-occluder",
        x: 2.3,
        y: 1.16,
        z: 6.36,
        width: 6.45,
        height: 2.7,
        rotationY: 0,
        color: new THREE.Color(1.08, 0.96, 0.8),
        opacity: 0.98,
        depthWrite: true
      }
    );

    this.addGroundRect(-2.0, -5.55, 8.7, 0.92, 0x050303, 0.22, -0.02);
    this.addGroundRect(4.8, -5.48, 5.2, 0.85, 0x050303, 0.24, -0.02);
    this.addGroundRect(-7.25, -4.15, 3.8, 1.0, 0x050303, 0.2, 0.1);
    this.addGroundRect(-7.55, 0.2, 4.8, 1.05, 0x041014, 0.18, 0.18);
    this.addGroundRect(7.3, 2.5, 4.2, 0.95, 0x041014, 0.16, -0.18);
    this.addGroundRect(2.2, 6.05, 6.0, 1.35, 0x030201, 0.32, 0.04);
  }

  private wallKitFacadeOnRun(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    along: number,
    frame: string,
    width: number,
    height: number,
    options: { y: number; normalOffset: number; color: THREE.Color; opacity?: number }
  ): WallKitFacadeInstance {
    const interiorSide = this.wallInteriorSide(run, horizontal);
    const midX = (run.from.x + run.to.x) / 2;
    const midZ = (run.from.y + run.to.y) / 2;
    return {
      frame,
      x: horizontal ? along : midX + interiorSide.x * options.normalOffset,
      y: options.y,
      z: horizontal ? midZ + interiorSide.z * options.normalOffset : along,
      width,
      height,
      rotationY: horizontal ? 0 : Math.PI * 0.5,
      color: options.color,
      opacity: options.opacity
    };
  }

  private nearestWallRunForPoint(
    x: number,
    z: number
  ): { run: (typeof floorOneScene.wallRuns)[number]; horizontal: boolean; along: number; distance: number } | null {
    let best: { run: (typeof floorOneScene.wallRuns)[number]; horizontal: boolean; along: number; distance: number } | null =
      null;
    for (const run of floorOneScene.wallRuns) {
      const horizontal = Math.abs(run.to.x - run.from.x) >= Math.abs(run.to.y - run.from.y);
      const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
      const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
      const along = clamp(horizontal ? x : z, min, max);
      const mid = horizontal ? (run.from.y + run.to.y) / 2 : (run.from.x + run.to.x) / 2;
      const distance = Math.abs((horizontal ? z : x) - mid) + Math.max(min - (horizontal ? x : z), 0, (horizontal ? x : z) - max) * 0.5;
      if (!best || distance < best.distance) best = { run, horizontal, along, distance };
    }
    return best;
  }

  private wallKitFacadeTint(run: (typeof floorOneScene.wallRuns)[number], frame: string, seed: number): THREE.Color {
    const coolRun = run.id === "east" || run.id.includes("stair") || run.id.includes("west");
    const tint = new THREE.Color();
    tint.setRGB(run.id === "foreground" ? 1.02 : 1.56, run.id === "foreground" ? 0.9 : 1.38, run.id === "foreground" ? 0.74 : 1.12);
    if (coolRun) tint.lerp(new THREE.Color(0xa4d6dc), 0.22);
    if (frame.includes("door")) tint.lerp(new THREE.Color(0xf6bf78), 0.22);
    else if (frame.includes("banner")) tint.setRGB(1.68, 0.98, 0.7);
    else if (frame.includes("arch") || frame.includes("pillar")) tint.lerp(new THREE.Color(0xf3d4a8), 0.18);
    else if (frame.includes("ruin")) tint.lerp(new THREE.Color(0xb49a7a), 0.16);
    tint.multiplyScalar(1.08 + detailNoise(seed + 23) * 0.2);
    if (run.id === "foreground") tint.multiplyScalar(0.86);
    return tint;
  }

  private collectWallLightPanels(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    length: number,
    panels: WallLightPanelInstance[],
    foregroundPanels: WallLightPanelInstance[]
  ): void {
    const target = run.id === "foreground" ? foregroundPanels : panels;
    const interiorSide = this.wallInteriorSide(run, horizontal);
    const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
    const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
    const midX = (run.from.x + run.to.x) / 2;
    const midZ = (run.from.y + run.to.y) / 2;
    const faceOffset = run.thickness * (run.id === "foreground" ? 1.08 : 1.18);
    const faceX = midX + interiorSide.x * faceOffset;
    const faceZ = midZ + interiorSide.z * faceOffset;
    const lightSources = [
      ...floorOneScene.torchPlacements.map((point) => ({
        x: point.x,
        z: point.y,
        color: 0xffad5a,
        radius: 4.3,
        strength: 0.98
      })),
      ...floorOneScene.propPlacements
        .filter((prop) => prop.light)
        .map((prop) => ({
          x: prop.x,
          z: prop.y,
          color: prop.light!.color,
          radius: prop.light!.distance * 0.62,
          strength: prop.light!.intensity * 0.24
        }))
    ];

    for (const source of lightSources) {
      const along = horizontal ? source.x : source.z;
      if (along < min - source.radius * 0.42 || along > max + source.radius * 0.42) continue;

      const normalDistance = Math.abs((horizontal ? source.z : source.x) - (horizontal ? faceZ : faceX));
      const falloff = 1 - clamp(normalDistance / Math.max(0.8, source.radius), 0, 1);
      if (falloff <= 0.08) continue;

      const edgeFade = clamp((Math.min(along - min, max - along) + source.radius * 0.32) / source.radius, 0.1, 1);
      const strength = clamp(falloff * edgeFade * source.strength, 0, 1.15);
      if (strength <= 0.08) continue;

      const seed = length * 211 + source.x * 31 + source.z * 47 + run.height * 89;
      const width = clamp(source.radius * (0.7 + strength * 0.62), 0.92, Math.min(4.8, length * 0.72));
      const height = run.height * clamp(0.58 + strength * 0.34, 0.52, 0.88);
      const y = 0.22 + height * 0.5 + detailNoise(seed + 3) * 0.08;
      const jitteredAlong = clamp(along + (detailNoise(seed + 7) - 0.5) * 0.24, min + width * 0.18, max - width * 0.18);
      const color = new THREE.Color(source.color).lerp(
        new THREE.Color(run.id.includes("stair") || run.id === "east" ? 0x76d7e0 : 0xffcf83),
        0.12 + strength * 0.12
      );
      color.multiplyScalar(0.72 + strength * 0.66);

      target.push({
        x: horizontal ? jitteredAlong : faceX,
        y,
        z: horizontal ? faceZ : jitteredAlong,
        width,
        height,
        rotationY: horizontal ? 0 : Math.PI * 0.5,
        color
      });

      if (strength > 0.34 && !run.id.includes("foreground")) {
        const narrowColor = new THREE.Color(source.color).lerp(new THREE.Color(0xfff0b2), 0.26);
        narrowColor.multiplyScalar(0.9 + strength * 0.48);
        target.push({
          x: horizontal ? jitteredAlong + (detailNoise(seed + 11) - 0.5) * width * 0.18 : faceX,
          y: 0.36 + height * 0.38,
          z: horizontal ? faceZ : jitteredAlong + (detailNoise(seed + 13) - 0.5) * width * 0.18,
          width: width * 0.28,
          height: height * 0.72,
          rotationY: horizontal ? 0 : Math.PI * 0.5,
          color: narrowColor
        });
      }
    }
  }

  private collectAuthoredWallAccents(
    warmPanels: WallFacadeInstance[],
    coldPanels: WallFacadeInstance[],
    shadowPanels: WallFacadeInstance[],
    rimPanels: WallFacadeInstance[]
  ): void {
    const runsById = new Map(floorOneScene.wallRuns.map((run) => [run.id, run]));
    for (const accent of floorOneScene.wallAccents) {
      const run = runsById.get(accent.runId);
      if (!run) continue;

      const horizontal = Math.abs(run.to.x - run.from.x) >= Math.abs(run.to.y - run.from.y);
      const interiorSide = this.wallInteriorSide(run, horizontal);
      const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
      const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
      const midX = (run.from.x + run.to.x) / 2;
      const midZ = (run.from.y + run.to.y) / 2;
      const requestedOffset = accent.normalOffset ?? (run.id === "foreground" ? 0.92 : 1.08);
      const faceOffset =
        run.thickness *
        (accent.kind === "shadow" ? requestedOffset : Math.max(requestedOffset, run.id === "foreground" ? 1.1 : 1.2));
      const along = clamp(accent.along, min + accent.width * 0.12, max - accent.width * 0.12);
      const color = new THREE.Color(accent.color);
      if (accent.kind === "warm") color.lerp(new THREE.Color(0xffd08a), 0.12);
      if (accent.kind === "cold") color.lerp(new THREE.Color(0xd2ffff), 0.1);
      if (accent.kind === "rim") color.multiplyScalar(1.18);

      const panel: WallFacadeInstance = {
        x: horizontal ? along : midX + interiorSide.x * faceOffset,
        y: accent.centerY,
        z: horizontal ? midZ + interiorSide.z * faceOffset : along,
        width: accent.width,
        height: accent.height,
        rotationY: horizontal ? 0 : Math.PI * 0.5,
        color
      };

      if (accent.kind === "warm") warmPanels.push(panel);
      else if (accent.kind === "cold") coldPanels.push(panel);
      else if (accent.kind === "shadow") shadowPanels.push(panel);
      else rimPanels.push(panel);
    }
  }

  private addWallAccentPanelInstances(
    entries: WallFacadeInstance[],
    opacity: number,
    additive: boolean
  ): void {
    if (!entries.length) return;
    const texture = this.proceduralTexture(PROCEDURAL_WALL_LIGHT_TEXTURE, () => this.createWallLightTexture());
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: texture,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: true,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        side: THREE.DoubleSide,
        alphaTest: 0.01,
        vertexColors: true
      }),
      entries.length
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      quaternion.setFromEuler(new THREE.Euler(0, entry.rotationY, 0));
      matrix.compose(
        new THREE.Vector3(entry.x, entry.y, entry.z),
        quaternion,
        new THREE.Vector3(entry.width, entry.height, 1)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.staticWorld.add(mesh);
  }

  private addWallLightPanelInstances(entries: WallLightPanelInstance[], opacity: number): void {
    if (!entries.length) return;
    const texture = this.proceduralTexture(PROCEDURAL_WALL_LIGHT_TEXTURE, () => this.createWallLightTexture());
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: texture,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        alphaTest: 0.01,
        vertexColors: true
      }),
      entries.length
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      quaternion.setFromEuler(new THREE.Euler(0, entry.rotationY, 0));
      matrix.compose(
        new THREE.Vector3(entry.x, entry.y, entry.z),
        quaternion,
        new THREE.Vector3(entry.width, entry.height, 1)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.staticWorld.add(mesh);
  }

  private addWallMasonry(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    length: number
  ): void {
    const interiorSide = this.wallInteriorSide(run, horizontal);
    const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
    const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
    const faceDepth = 0.028;
    const faceOffset = run.thickness * 0.56;
    const facePlates: WallDetailInstance[] = [];
    const faceMarks: WallDetailInstance[] = [];
    const capMarks: WallDetailInstance[] = [];
    const courseCount = Math.max(4, Math.floor(run.height / 0.36));
    const segmentCount = Math.max(5, Math.floor(length / 0.84));

    for (let course = 0; course < courseCount; course += 1) {
      const y = 0.34 + course * 0.34;
      if (y > run.height - 0.22) continue;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const roll = detailNoise(course * 71 + segment * 37 + length * 11);
        if (roll < 0.16) continue;
        const t = (segment + 0.5 + (roll - 0.5) * 0.18) / segmentCount;
        const along = min + (max - min) * t;
        const markLength = 0.28 + detailNoise(course * 19 + segment * 53) * 0.62;
        const markHeight = 0.018 + detailNoise(course * 31 + segment * 17) * 0.028;
        const warm = detailNoise(course * 43 + segment * 29) > 0.64;
        const plateWidth = Math.min(0.95, markLength * (1.18 + detailNoise(course * 23 + segment * 41) * 0.62));
        const plateHeight = 0.12 + detailNoise(course * 17 + segment * 61) * 0.16;
        const plateColor = new THREE.Color(warm ? 0x62452e : 0x2a231c).lerp(
          new THREE.Color(warm ? 0xb57a43 : 0x5d7478),
          warm ? 0.22 + detailNoise(course * 67 + segment * 31) * 0.24 : 0.1
        );
        const color = new THREE.Color(warm ? 0x4f3824 : 0x120e0b);
        if (warm) color.lerp(new THREE.Color(0xa46c3b), detailNoise(course * 13 + segment * 97) * 0.3);
        const centerX = horizontal ? along : (run.from.x + run.to.x) / 2 + interiorSide.x * faceOffset;
        const centerZ = horizontal ? (run.from.y + run.to.y) / 2 + interiorSide.z * faceOffset : along;
        facePlates.push({
          x: centerX,
          y: y + plateHeight * 0.08,
          z: centerZ,
          width: horizontal ? plateWidth : faceDepth,
          height: plateHeight,
          depth: horizontal ? faceDepth : plateWidth,
          color: plateColor
        });
        faceMarks.push({
          x: centerX,
          y,
          z: centerZ,
          width: horizontal ? markLength : faceDepth,
          height: markHeight,
          depth: horizontal ? faceDepth : markLength,
          color
        });
      }
    }

    for (let segment = 0; segment < Math.max(4, Math.floor(length / 1.15)); segment += 1) {
      const roll = detailNoise(segment * 61 + length * 17);
      if (roll < 0.18) continue;
      const t = (segment + 0.5 + (roll - 0.5) * 0.24) / Math.max(4, Math.floor(length / 1.15));
      const along = min + (max - min) * t;
      const markLength = 0.42 + detailNoise(segment * 29 + 7) * 0.58;
      const color = new THREE.Color(0xb18454).lerp(
        new THREE.Color(0x3b2c20),
        detailNoise(segment * 47 + 5) * 0.42
      );
      capMarks.push({
        x: horizontal ? along : (run.from.x + run.to.x) / 2,
        y: run.height + 0.17,
        z: horizontal ? (run.from.y + run.to.y) / 2 : along,
        width: horizontal ? markLength : 0.035,
        height: 0.024,
        depth: horizontal ? 0.035 : markLength,
        color
      });
    }

    this.addWallDetailInstances(facePlates, run.id === "foreground" ? 0.2 : 0.36);
    this.addWallDetailInstances(faceMarks, run.id === "foreground" ? 0.34 : 0.62);
    this.addWallDetailInstances(capMarks, run.id === "foreground" ? 0.24 : 0.44);
  }

  private collectWallCapChips(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    length: number,
    blocks: StoneBlockInstance[]
  ): void {
    const interiorSide = this.wallInteriorSide(run, horizontal);
    const midX = (run.from.x + run.to.x) / 2;
    const midZ = (run.from.y + run.to.y) / 2;
    const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
    const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
    const count = Math.max(4, Math.floor(length / 0.85));

    for (let index = 0; index < count; index += 1) {
      const seed = length * 23 + index * 79 + run.height * 31 + (horizontal ? 11 : 37);
      if (detailNoise(seed) < (run.id === "foreground" ? 0.54 : 0.34)) continue;
      const t = (index + 0.5 + (detailNoise(seed + 3) - 0.5) * 0.42) / count;
      const along = min + (max - min) * t;
      const chipHeight = 0.035 + detailNoise(seed + 5) * 0.055;
      const longSize = 0.16 + detailNoise(seed + 7) * 0.42;
      const crossSize = 0.08 + detailNoise(seed + 13) * 0.2;
      const crossOffset = (detailNoise(seed + 17) - 0.5) * 0.18;
      const color = new THREE.Color(0x6a5036).lerp(
        new THREE.Color(0xc58a4a),
        detailNoise(seed + 19) * 0.42
      );
      color.lerp(new THREE.Color(0x271a11), detailNoise(seed + 23) * 0.12);
      blocks.push({
        x: horizontal ? along : midX + interiorSide.x * crossOffset,
        y: run.height + 0.16 + chipHeight * 0.5,
        z: horizontal ? midZ + interiorSide.z * crossOffset : along,
        width: horizontal ? longSize : crossSize,
        height: chipHeight,
        depth: horizontal ? crossSize : longSize,
        rotation: (horizontal ? 0 : Math.PI * 0.5) + (detailNoise(seed + 29) - 0.5) * 0.14,
        color
      });
    }
  }

  private addWallDetailInstances(entries: WallDetailInstance[], opacity: number): void {
    if (!entries.length) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      }),
      entries.length
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      matrix.compose(
        new THREE.Vector3(entry.x, entry.y, entry.z),
        quaternion,
        new THREE.Vector3(entry.width, entry.height, entry.depth)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.staticWorld.add(mesh);
  }

  private addWallFacadeInstances(entries: WallFacadeInstance[], opacity: number): void {
    if (!entries.length) return;
    const facadeTexture = this.proceduralTexture(PROCEDURAL_WALL_FACADE_TEXTURE, () =>
      this.createWallFacadeTexture()
    );
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: facadeTexture,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        alphaTest: 0.015,
        vertexColors: true
      }),
      entries.length
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      quaternion.setFromEuler(new THREE.Euler(0, entry.rotationY, 0));
      matrix.compose(
        new THREE.Vector3(entry.x, entry.y, entry.z),
        quaternion,
        new THREE.Vector3(entry.width, entry.height, 1)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.staticWorld.add(mesh);
  }

  private addWallKitFacadeInstances(entries: WallKitFacadeInstance[]): void {
    if (!entries.length) return;
    const byMaterial = new Map<string, WallKitFacadeInstance[]>();
    for (const entry of entries) {
      const opacity = Math.round((entry.opacity ?? 1) * 100) / 100;
      const key = `${entry.frame}:${opacity}`;
      const bucket = byMaterial.get(key) ?? [];
      bucket.push(entry);
      byMaterial.set(key, bucket);
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (const [key, bucket] of byMaterial) {
      const [frame, opacityText] = key.split(":");
      if (!frame) continue;
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: Math.min(1, Number(opacityText) * 0.68),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        alphaTest: 0.018,
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -0.35,
        polygonOffsetUnits: -1
      });
      const texture = this.texture(frame);
      if (texture) material.map = texture;
      material.toneMapped = false;
      const mesh = new THREE.InstancedMesh(geometry, material, bucket.length);
      mesh.renderOrder = 3;
      for (let index = 0; index < bucket.length; index += 1) {
        const entry = bucket[index]!;
        quaternion.setFromEuler(new THREE.Euler(0, entry.rotationY, 0));
        matrix.compose(
          new THREE.Vector3(entry.x, entry.y, entry.z),
          quaternion,
          new THREE.Vector3(entry.width, entry.height, 1)
        );
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, entry.color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.staticWorld.add(mesh);
    }
  }

  private addWallSpanInstances(entries: WallSpanInstance[]): void {
    if (!entries.length) return;
    const byMaterial = new Map<string, WallSpanInstance[]>();
    for (const entry of entries) {
      const opacity = Math.round((entry.opacity ?? 1) * 100) / 100;
      const additive = entry.additive ?? false;
      const billboard = entry.billboard ?? false;
      const depthTest = entry.depthTest ?? true;
      const depthWrite = entry.depthWrite ?? true;
      const renderOrder = entry.renderOrder ?? 0;
      const key = `${entry.frame}:${opacity}:${additive ? "additive" : "normal"}:${billboard ? "billboard" : "fixed"}:${depthTest ? "test" : "notest"}:${depthWrite ? "depth" : "nodepth"}:${renderOrder}`;
      const bucket = byMaterial.get(key) ?? [];
      bucket.push(entry);
      byMaterial.set(key, bucket);
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const cameraMatched = this.camera.quaternion.clone();
    for (const [key, bucket] of byMaterial) {
      const [frame, opacityText, blendText, billboardText, depthTestText, depthText, renderOrderText] = key.split(":");
      if (!frame) continue;
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: Number(opacityText),
        blending: blendText === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthTest: depthTestText === "test",
        depthWrite: depthText === "depth",
        side: THREE.DoubleSide,
        alphaTest: 0.035,
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -0.6,
        polygonOffsetUnits: -2
      });
      const texture = this.texture(frame);
      if (texture) material.map = texture;
      material.toneMapped = false;
      const mesh = new THREE.InstancedMesh(geometry, material, bucket.length);
      mesh.renderOrder = Number(renderOrderText ?? 0);
      for (let index = 0; index < bucket.length; index += 1) {
        const entry = bucket[index]!;
        if (billboardText === "billboard") quaternion.copy(cameraMatched);
        else quaternion.setFromEuler(new THREE.Euler(0, entry.rotationY, 0));
        matrix.compose(
          new THREE.Vector3(entry.x, entry.y, entry.z),
          quaternion,
          new THREE.Vector3(entry.width, entry.height, 1)
        );
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, entry.color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.staticWorld.add(mesh);
    }
  }

  private addBoxInstances(entries: StaticBoxInstance[], material: THREE.Material): void {
    if (!entries.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, entries.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      matrix.compose(
        new THREE.Vector3(entry.x, entry.y, entry.z),
        quaternion,
        new THREE.Vector3(entry.width, entry.height, entry.depth)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.staticWorld.add(mesh);
  }

  private addSolidBlockInstances(entries: StoneBlockInstance[], roughness: number): void {
    if (!entries.length) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x090604,
        emissiveIntensity: 0.14,
        roughness,
        metalness: 0.02,
        vertexColors: true
      }),
      entries.length
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      quaternion.setFromEuler(new THREE.Euler(0, entry.rotation, 0));
      matrix.compose(
        new THREE.Vector3(entry.x, entry.y, entry.z),
        quaternion,
        new THREE.Vector3(entry.width, entry.height, entry.depth)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.staticWorld.add(mesh);
  }

  private wallInteriorSide(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean
  ): { x: number; z: number } {
    if (horizontal) return { x: 0, z: run.id === "foreground" ? -1 : 1 };
    return { x: run.id === "east" ? -1 : 1, z: 0 };
  }

  private collectWallButtresses(
    run: (typeof floorOneScene.wallRuns)[number],
    horizontal: boolean,
    blocks: StaticBoxInstance[],
    foregroundBlocks: StaticBoxInstance[]
  ): void {
    const span = horizontal ? Math.abs(run.to.x - run.from.x) : Math.abs(run.to.y - run.from.y);
    const count = Math.max(2, Math.floor(span / 3.1));
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const x = run.from.x + (run.to.x - run.from.x) * t;
      const z = run.from.y + (run.to.y - run.from.y) * t;
      if (run.id === "foreground" && i > 0 && i < count) continue;
      const width = horizontal ? 0.32 : run.thickness + 0.24;
      const depth = horizontal ? run.thickness + 0.24 : 0.32;
      const target = run.id === "foreground" ? foregroundBlocks : blocks;
      target.push({
        x,
        y: run.height * 0.46,
        z,
        width,
        height: run.height * 0.92,
        depth,
        color: new THREE.Color(run.id === "foreground" ? 0x32261a : 0x4d3c2a)
      });
    }
  }

  private buildRuinCrownBlocks(): void {
    const blocks: StoneBlockInstance[] = [];
    for (const run of floorOneScene.wallRuns) {
      const horizontal = Math.abs(run.to.x - run.from.x) >= Math.abs(run.to.y - run.from.y);
      const length = horizontal ? Math.abs(run.to.x - run.from.x) : Math.abs(run.to.y - run.from.y);
      const count = Math.max(4, Math.floor(length / 0.72));
      const min = horizontal ? Math.min(run.from.x, run.to.x) : Math.min(run.from.y, run.to.y);
      const max = horizontal ? Math.max(run.from.x, run.to.x) : Math.max(run.from.y, run.to.y);
      const midX = (run.from.x + run.to.x) / 2;
      const midZ = (run.from.y + run.to.y) / 2;
      const interiorSide = this.wallInteriorSide(run, horizontal);
      for (let index = 0; index <= count; index += 1) {
        const seed = length * 41 + index * 89 + run.height * 113;
        if (detailNoise(seed) < (run.id === "foreground" ? 0.42 : 0.28)) continue;
        const t = (index + (detailNoise(seed + 3) - 0.5) * 0.4) / count;
        const along = min + (max - min) * t;
        const height = 0.08 + detailNoise(seed + 5) * (run.id === "foreground" ? 0.18 : 0.26);
        const longSize = 0.24 + detailNoise(seed + 7) * 0.58;
        const crossSize = 0.1 + detailNoise(seed + 11) * 0.22;
        const crossOffset = run.thickness * 0.2 + detailNoise(seed + 13) * 0.16;
        const color = new THREE.Color(run.id === "foreground" ? 0x433120 : 0x6d5034).lerp(
          new THREE.Color(0xd0914c),
          detailNoise(seed + 17) * 0.42
        );
        blocks.push({
          x: horizontal ? along : midX + interiorSide.x * crossOffset,
          y: run.height + 0.16 + height * 0.5,
          z: horizontal ? midZ + interiorSide.z * crossOffset : along,
          width: horizontal ? longSize : crossSize,
          height,
          depth: horizontal ? crossSize : longSize,
          rotation: (horizontal ? 0 : Math.PI * 0.5) + (detailNoise(seed + 19) - 0.5) * 0.22,
          color
        });
      }
    }
    this.addSolidBlockInstances(blocks, 0.92);
  }

  private buildBrokenForegroundSilhouette(): void {
    const masses: StaticBoxInstance[] = [
      { x: -7.2, y: 0.6, z: 5.98, width: 1.2, height: 1.2, depth: 0.96, color: new THREE.Color(0x1a1009) },
      { x: -5.55, y: 0.48, z: 6.28, width: 1.9, height: 0.96, depth: 1.08, color: new THREE.Color(0x1d120a) },
      { x: -1.35, y: 0.74, z: 6.52, width: 1.48, height: 1.48, depth: 1.0, color: new THREE.Color(0x191008) },
      { x: 1.0, y: 0.5, z: 6.7, width: 2.1, height: 1.0, depth: 0.94, color: new THREE.Color(0x171009) },
      { x: 4.25, y: 0.62, z: 6.25, width: 1.38, height: 1.24, depth: 1.02, color: new THREE.Color(0x20140c) },
      { x: 7.25, y: 0.68, z: 5.8, width: 1.44, height: 1.36, depth: 1.08, color: new THREE.Color(0x1b120b) }
    ];
    const crown: StoneBlockInstance[] = [];
    const shadowPlates: StaticBoxInstance[] = [
      { x: -3.4, y: 1.02, z: 6.08, width: 3.0, height: 0.36, depth: 0.06, color: new THREE.Color(0x040302) },
      { x: 2.2, y: 1.08, z: 6.0, width: 3.4, height: 0.38, depth: 0.06, color: new THREE.Color(0x040302) }
    ];

    for (let index = 0; index < 28; index += 1) {
      const seed = 809 + index * 131;
      const sideRoll = detailNoise(seed + 1);
      const foreground = sideRoll < 0.72;
      const x = foreground
        ? -7.2 + detailNoise(seed + 3) * 14.4
        : sideRoll < 0.86
          ? -8.25 + detailNoise(seed + 5) * 0.52
          : 7.75 + detailNoise(seed + 7) * 0.66;
      const z = foreground
        ? 5.82 + detailNoise(seed + 11) * 1.0
        : -1.1 + detailNoise(seed + 13) * 6.7;
      const height = 0.08 + detailNoise(seed + 17) * 0.22;
      const warm = new THREE.Color(0x4a321f).lerp(new THREE.Color(0xa26d3c), detailNoise(seed + 19) * 0.3);
      crown.push({
        x,
        y: 1.48 + detailNoise(seed + 23) * 0.36,
        z,
        width: 0.24 + detailNoise(seed + 29) * 0.86,
        height,
        depth: 0.12 + detailNoise(seed + 31) * 0.36,
        rotation: (detailNoise(seed + 37) - 0.5) * 0.42,
        color: warm.lerp(new THREE.Color(0x0f0905), 0.52 + detailNoise(seed + 41) * 0.16)
      });
    }

    this.addBoxInstances(
      masses,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x080403,
        emissiveIntensity: 0.18,
        roughness: 0.92,
        metalness: 0.02,
        vertexColors: true
      })
    );
    this.addSolidBlockInstances(crown, 0.96);
    this.addBoxInstances(
      shadowPlates,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        depthTest: true,
        vertexColors: true
      })
    );
  }

  private buildPillars(): void {
    const blocks: StaticBoxInstance[] = [];
    for (const pillar of floorOneScene.pillars) {
      blocks.push({
        x: pillar.x,
        y: pillar.height / 2,
        z: pillar.y,
        width: pillar.width,
        height: pillar.height,
        depth: pillar.depth,
        color: new THREE.Color(pillar.color).lerp(new THREE.Color(0x866241), 0.24)
      });
      blocks.push({
        x: pillar.x,
        y: pillar.height + 0.08,
        z: pillar.y,
        width: pillar.width + 0.22,
        height: 0.18,
        depth: pillar.depth + 0.22,
        color: new THREE.Color(pillar.topColor).lerp(new THREE.Color(0xc08a4d), 0.2)
      });
      blocks.push({
        x: pillar.x,
        y: 0.08,
        z: pillar.y,
        width: pillar.width + 0.28,
        height: 0.16,
        depth: pillar.depth + 0.28,
        color: new THREE.Color(0x241a12)
      });
    }
    this.addBoxInstances(
      blocks,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x1a1009,
        emissiveIntensity: 0.24,
        roughness: 0.9,
        metalness: 0.02,
        vertexColors: true
      })
    );
  }

  private buildProps(state: GameState): void {
    for (const prop of floorOneScene.propPlacements) {
      this.addBillboard(
        prop.frame,
        prop.x,
        prop.y,
        prop.scale,
        prop.height ?? prop.scale * 1.55,
        this.staticWorld
      );
      if (prop.light) {
        if (STATIC_POINT_LIGHT_PROP_IDS.has(prop.id))
          this.addPointLight(
            prop.x,
            prop.y,
            prop.light.color,
            prop.light.intensity,
            prop.light.distance,
            1.1
          );
        this.addGroundDecal(
          prop.x,
          prop.y + 0.08,
          prop.light.distance * 0.28,
          prop.light.distance * 0.16,
          prop.light.color,
          0.12,
          0
        );
      }
    }
    for (const door of floorOneSceneDoors(state)) {
      this.addDoorArchitecture(door);
      this.addDoorFacade(door);
      if (!door.open)
        this.addGroundGlowDecal(door.spec.x + 0.16, door.spec.y + 0.1, 1.55, 0.82, 0xf2a84b, 0.13, -0.28);
    }
  }

  private addDoorArchitecture(door: SceneDoorRuntime): void {
    const { spec, open } = door;
    const match = this.nearestWallRunForPoint(spec.x, spec.y);
    const horizontal = match?.horizontal ?? true;
    const run = match?.run;
    const interiorSide = run ? this.wallInteriorSide(run, horizontal) : { x: 0, z: 1 };
    const midX = run ? (run.from.x + run.to.x) / 2 : spec.x;
    const midZ = run ? (run.from.y + run.to.y) / 2 : spec.y;
    const along = match?.along ?? spec.x;
    const baseNormalOffset = (run?.thickness ?? 0.58) * 1.08;
    const place = (alongOffset: number, normalNudge: number): { x: number; z: number } => ({
      x: horizontal ? along + alongOffset : midX + interiorSide.x * (baseNormalOffset + normalNudge),
      z: horizontal ? midZ + interiorSide.z * (baseNormalOffset + normalNudge) : along + alongOffset
    });
    const addDoorBox = (
      alongOffset: number,
      normalNudge: number,
      alongSize: number,
      normalSize: number,
      y: number,
      height: number,
      material: THREE.Material
    ): THREE.Mesh => {
      const position = place(alongOffset, normalNudge);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? alongSize : normalSize, height, horizontal ? normalSize : alongSize),
        material
      );
      mesh.position.set(position.x, y, position.z);
      this.staticWorld.add(mesh);
      return mesh;
    };

    const stone = open ? 0x292119 : 0x1a130e;
    const trim = open ? 0x69533a : 0x7e5631;
    addDoorBox(
      0,
      -0.06,
      spec.width * 1.58,
      0.08,
      0.84,
      1.68,
      new THREE.MeshBasicMaterial({
        color: 0x020202,
        transparent: true,
        opacity: open ? 0.32 : 0.58,
        depthWrite: false,
        depthTest: true
      })
    );

    const jambMaterial = new THREE.MeshStandardMaterial({ color: stone, roughness: 0.9, metalness: 0.02 });
    const trimMaterial = new THREE.MeshBasicMaterial({
      color: trim,
      transparent: true,
      opacity: open ? 0.18 : 0.28,
      depthWrite: false,
      depthTest: true
    });
    addDoorBox(-spec.width * 0.62, 0, 0.2, 0.42, 0.88, 1.76, jambMaterial);
    addDoorBox(spec.width * 0.62, 0, 0.2, 0.42, 0.88, 1.76, jambMaterial);
    addDoorBox(0, 0.02, spec.width * 1.48, 0.44, 1.78, 0.24, new THREE.MeshStandardMaterial({ color: 0x3c3024, roughness: 0.86 }));
    addDoorBox(0, 0.08, spec.width * 1.26, 0.46, 0.04, 0.08, new THREE.MeshStandardMaterial({ color: 0x100b08, roughness: 0.92 }));
    addDoorBox(0, 0.18, spec.width * 0.04, 0.04, 0.96, 1.18, trimMaterial);

    if (!open) {
      const ember = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.42, 0.03),
        new THREE.MeshBasicMaterial({
          color: 0xff8a36,
          transparent: true,
          opacity: 0.52,
          depthWrite: false,
          depthTest: true,
          blending: THREE.AdditiveBlending
        })
      );
      const emberPosition = place(0.02, 0.22);
      ember.position.set(emberPosition.x, 0.9, emberPosition.z);
      this.staticWorld.add(ember);
    }
  }

  private addDoorFacade(door: SceneDoorRuntime): void {
    const { spec, open } = door;
    const match = this.nearestWallRunForPoint(spec.x, spec.y);
    if (!match) return;
    const frame = open ? spec.openFrame : spec.closedFrame;
    const height = open ? 2.04 : 2.18;
    const width = spec.width * (open ? 1.42 : 1.58);
    this.addWallKitFacadeInstances([
      this.wallKitFacadeOnRun(match.run, match.horizontal, match.along, frame, width, height, {
        y: 0.04 + height * 0.5,
        normalOffset: match.run.thickness * 1.18,
        color: this.wallKitFacadeTint(match.run, frame, spec.x * 167 + spec.y * 199).multiplyScalar(open ? 1.02 : 1.1),
        opacity: 1
      })
    ]);
  }

  private buildFogBands(): void {
    this.addFogBandInstances(floorOneScene.fogBands);
    this.addGroundGlowDecal(-6.75, -5.4, 5.2, 1.8, 0x315d66, 0.16, 0.08);
    this.addGroundGlowDecal(7.0, 5.35, 5.2, 2.25, 0x1e5e62, 0.18, -0.18);
    this.addGroundGlowDecal(-7.55, 2.9, 3.4, 1.35, 0x27434a, 0.12, 0.34);
    this.addGroundRect(0, 6.65, 15.4, 2.1, 0x020506, 0.16, 0);
    this.addGroundDecal(-7.4, -5.2, 3.6, 1.4, 0x020506, 0.14, 0.12);
    this.addGroundDecal(8.0, 5.0, 3.2, 1.7, 0x020506, 0.13, -0.16);
    this.buildAtmosphericWisps();
    this.buildVoidFogCurtains();
  }

  private buildAtmosphericWisps(): void {
    const coldWisps: AtmosphereWispInstance[] = [];
    const warmWisps: AtmosphereWispInstance[] = [];
    const darkWisps: AtmosphereWispInstance[] = [];
    const wispBands = [
      { x: -7.25, z: -4.55, width: 4.6, height: 1.32, lift: 0.18, rotation: 0.02, color: 0x315d66, bucket: "cold" },
      { x: -6.35, z: -1.35, width: 3.9, height: 1.05, lift: 0.16, rotation: -0.1, color: 0x25454d, bucket: "cold" },
      { x: -7.0, z: 3.05, width: 4.2, height: 1.12, lift: 0.14, rotation: 0.16, color: 0x263f46, bucket: "cold" },
      { x: 6.65, z: 5.0, width: 5.2, height: 1.36, lift: 0.16, rotation: -0.18, color: 0x1f555e, bucket: "cold" },
      { x: 7.2, z: 1.0, width: 3.8, height: 1.08, lift: 0.17, rotation: -0.1, color: 0x233d43, bucket: "cold" },
      { x: -0.4, z: -5.72, width: 6.4, height: 1.22, lift: 0.2, rotation: 0.04, color: 0x172d33, bucket: "dark" },
      { x: 0.2, z: 6.18, width: 7.0, height: 1.36, lift: 0.14, rotation: 0.02, color: 0x101d20, bucket: "dark" },
      { x: 5.2, z: -4.85, width: 3.6, height: 0.95, lift: 0.2, rotation: -0.16, color: 0x6c3520, bucket: "warm" },
      { x: -0.4, z: -0.6, width: 3.8, height: 0.66, lift: 0.1, rotation: -0.2, color: 0x57311f, bucket: "warm" },
      { x: 3.6, z: -1.1, width: 3.2, height: 0.72, lift: 0.1, rotation: 0.12, color: 0x4f6932, bucket: "warm" },
      { x: 4.8, z: 2.85, width: 3.4, height: 0.82, lift: 0.13, rotation: -0.24, color: 0x6a4526, bucket: "warm" }
    ] as const;

    for (const band of wispBands) {
      const target = band.bucket === "warm" ? warmWisps : band.bucket === "dark" ? darkWisps : coldWisps;
      target.push({
        x: band.x,
        z: band.z,
        width: band.width,
        height: band.height,
        lift: band.lift,
        rotation: band.rotation,
        color: new THREE.Color(band.color)
      });
    }

    for (let index = 0; index < 18; index += 1) {
      const seed = 991 + index * 157;
      const side = detailNoise(seed + 1);
      const x = side < 0.5 ? -7.15 + detailNoise(seed + 3) * 1.6 : 6.0 + detailNoise(seed + 5) * 1.9;
      const z = -4.9 + detailNoise(seed + 7) * 10.1;
      coldWisps.push({
        x,
        z,
        width: 1.65 + detailNoise(seed + 11) * 1.95,
        height: 0.46 + detailNoise(seed + 13) * 0.42,
        lift: 0.12 + detailNoise(seed + 17) * 0.16,
        rotation: (detailNoise(seed + 19) - 0.5) * 0.42,
        color: new THREE.Color(0x2c5058).lerp(new THREE.Color(0x121c20), detailNoise(seed + 23) * 0.42)
      });
    }

    this.addAtmosphereWispInstances(coldWisps, 0.3);
    this.addAtmosphereWispInstances(warmWisps, 0.18);
    this.addAtmosphereWispInstances(darkWisps, 0.24);
  }

  private buildVoidFogCurtains(): void {
    const coldCurtains: AtmosphereWispInstance[] = [
      { x: -8.35, z: -4.4, width: 4.2, height: 2.35, lift: 0.24, rotation: -0.08, color: new THREE.Color(0x315d66) },
      { x: -8.18, z: -1.08, width: 3.6, height: 2.0, lift: 0.2, rotation: 0.08, color: new THREE.Color(0x24464e) },
      { x: -8.28, z: 2.5, width: 4.4, height: 2.18, lift: 0.2, rotation: -0.16, color: new THREE.Color(0x263f46) },
      { x: 8.35, z: 1.4, width: 3.8, height: 2.05, lift: 0.22, rotation: 0.16, color: new THREE.Color(0x243e45) },
      { x: 8.12, z: 5.0, width: 5.2, height: 2.42, lift: 0.18, rotation: -0.16, color: new THREE.Color(0x2a6269) },
      { x: 4.95, z: 6.42, width: 4.8, height: 2.15, lift: 0.18, rotation: -0.28, color: new THREE.Color(0x234a51) },
      { x: -6.0, z: 6.16, width: 4.6, height: 1.82, lift: 0.18, rotation: 0.16, color: new THREE.Color(0x1f3a41) }
    ];
    const darkCurtains: AtmosphereWispInstance[] = [
      { x: -2.8, z: -6.42, width: 7.0, height: 2.1, lift: 0.18, rotation: 0.02, color: new THREE.Color(0x081012) },
      { x: 2.7, z: -6.38, width: 6.4, height: 1.95, lift: 0.18, rotation: -0.02, color: new THREE.Color(0x080d0e) },
      { x: -1.0, z: 6.74, width: 7.8, height: 2.08, lift: 0.14, rotation: 0.04, color: new THREE.Color(0x050809) },
      { x: 6.75, z: 6.52, width: 4.8, height: 2.0, lift: 0.14, rotation: -0.12, color: new THREE.Color(0x030606) }
    ];
    const emberCurtains: AtmosphereWispInstance[] = [
      { x: 0.25, z: -5.7, width: 4.2, height: 1.42, lift: 0.22, rotation: 0.06, color: new THREE.Color(0x8b3f20) },
      { x: 6.3, z: 2.6, width: 3.1, height: 1.25, lift: 0.18, rotation: -0.24, color: new THREE.Color(0x7f4a25) }
    ];

    for (let index = 0; index < 16; index += 1) {
      const seed = 1711 + index * 149;
      const left = detailNoise(seed + 1) < 0.5;
      coldCurtains.push({
        x: left ? -8.0 + detailNoise(seed + 3) * 0.85 : 7.4 + detailNoise(seed + 5) * 0.9,
        z: -5.25 + detailNoise(seed + 7) * 11.0,
        width: 1.55 + detailNoise(seed + 11) * 2.4,
        height: 0.95 + detailNoise(seed + 13) * 1.25,
        lift: 0.12 + detailNoise(seed + 17) * 0.22,
        rotation: (detailNoise(seed + 19) - 0.5) * 0.55,
        color: new THREE.Color(0x2f5c66).lerp(new THREE.Color(0x081214), detailNoise(seed + 23) * 0.5)
      });
    }

    this.addAtmosphereWispInstances(coldCurtains, 0.38);
    this.addAtmosphereWispInstances(darkCurtains, 0.2);
    this.addAtmosphereWispInstances(emberCurtains, 0.16);
  }

  private addFogBandInstances(bands: typeof floorOneScene.fogBands): void {
    if (!bands.length) return;
    const texture = this.proceduralTexture(PROCEDURAL_FOG_WISP_TEXTURE, () => this.createFogWispTexture());
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
      vertexColors: true
    });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, bands.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (let index = 0; index < bands.length; index += 1) {
      const band = bands[index]!;
      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, band.rotation ?? 0));
      matrix.compose(
        new THREE.Vector3(band.x, band.lift ?? 0.052, band.y),
        quaternion,
        new THREE.Vector3(band.width, band.depth, 1)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(band.color).multiplyScalar(clamp(band.opacity, 0, 1)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.staticWorld.add(mesh);
  }

  private syncDynamicWorld(state: GameState, now: number): void {
    const liveKeys = new Set<string>();
    const liveBeamKeys = new Set<string>();
    this.pendingDynamicGroundGlows.length = 0;
    const stats = calculatePlayerStats(state);

    this.syncActorSprite(
      "player",
      "sprite-player",
      state.player,
      PLAYER_VISUAL_SCALE,
      PLAYER_VISUAL_HEIGHT,
      0xffffff,
      1,
      state.player.animation,
      state.player.facing,
      now
    );
    this.syncShadow("player", state.player, 0.84, 0.42, 0.44);
    this.syncActorGrounding(
      "player",
      state.player,
      PLAYER_VISUAL_SCALE,
      state.player.animation,
      state.player.facing,
      0xffb65f,
      0.075,
      state.player,
      stats.torchRadius,
      now
    );
    this.syncPlayerLights(state, now);
    liveKeys.add("player");
    this.syncActorRimLight(
      "player:torch-rim",
      state.player,
      state.player,
      PLAYER_VISUAL_SCALE,
      PLAYER_VISUAL_HEIGHT,
      0xffb65f,
      0.038 + Math.sin(now / 170) * 0.008
    );
    liveKeys.add("player:torch-rim");

    this.syncGroundGlow(
      "player-torch-pool",
      state.player,
      stats.torchRadius * 0.56,
      stats.torchRadius * 0.34,
      0xb96d2f,
      0.2 + Math.sin(now / 180) * 0.035,
      -0.2
    );
    this.syncGroundGlow(
      "player-torch-core",
      state.player,
      2.8,
      1.35,
      0xffb65f,
      0.15 + Math.sin(now / 120) * 0.025,
      -0.2
    );

    const destination = this.playerDestination(state);
    if (destination) {
      const marker = this.syncGlow(
        "player-destination",
        destination,
        0.55 + Math.sin(now / 140) * 0.05,
        0x75c9e8,
        0.2
      );
      marker.position.y = 0.04;
      liveKeys.add("player-destination");
    }

    for (const monster of state.monsters) {
      const key = `monster:${monster.id}`;
      const wounded = monster.hitFlashMs && monster.hitFlashMs > 0;
      const tint = this.monsterTint(monster, Boolean(wounded));
      const scale = this.monsterVisualScale(monster);
      const height = this.monsterVisualHeight(monster, scale);
      const torchInfluence = this.actorTorchInfluence(monster, state.player, stats.torchRadius);
      const litTint = this.actorTorchTint(tint, monster, state.player, stats.torchRadius, wounded ? 0.18 : 0.13);
      this.syncActorSprite(
        key,
        monsterFrame(monster),
        monster,
        scale,
        height,
        litTint,
        1,
        monster.animation,
        monster.facing,
        now
      );
      this.syncShadow(
        key,
        monster,
        scale * (monster.elite ? 0.78 : 0.62),
        scale * 0.32,
        monster.elite ? 0.5 : 0.36,
        state.player
      );
      liveKeys.add(key);
      if (
        monster.elite ||
        wounded ||
        monster.animation !== "idle" ||
        Math.hypot(monster.x - state.player.x, monster.y - state.player.y) < stats.torchRadius * 0.55
      ) {
        this.syncActorGrounding(
          key,
          monster,
          scale,
          monster.animation,
          monster.facing,
          monster.elite ? colorFromHex(monster.elite.auraColor, COLOR_BLOOD).getHex() : this.monsterGroundColor(monster),
          monster.elite ? 0.08 : 0.045,
          state.player,
          stats.torchRadius,
          now
        );
      }
      if (torchInfluence > 0.08 || wounded || monster.animation === "attack" || monster.aiState === "chase") {
        const rimColor = new THREE.Color(this.monsterGroundColor(monster))
          .lerp(new THREE.Color(0xffb65f), monster.kind === "ash-chanter" ? 0.28 : 0.48)
          .getHex();
        this.syncActorRimLight(
          `${key}:torch-rim`,
          monster,
          state.player,
          scale,
          height,
          rimColor,
          0.018 + torchInfluence * 0.038 + (wounded ? 0.018 : 0)
        );
        liveKeys.add(`${key}:torch-rim`);
      }
      if (monster.elite) {
        const auraColor = colorFromHex(monster.elite.auraColor, COLOR_BLOOD).getHex();
        this.syncGroundGlow(
          `${key}:aura-pool`,
          monster,
          scale * 1.7,
          scale * 0.92,
          auraColor,
          0.14 + Math.sin(now / 160) * 0.035,
          monster.facing ?? 0
        );
        const rim = this.syncGlow(
          `${key}:rim`,
          monster,
          scale * 0.92,
          auraColor,
          0.032 + Math.sin(now / 210) * 0.01
        );
        rim.position.y = height * 0.58;
        rim.scale.set(scale * 0.82, height * 0.62, 1);
        liveKeys.add(`${key}:rim`);
      }
    }

    for (const item of state.items) {
      if (item.x === undefined || item.y === undefined) continue;
      const key = `item:${item.id}`;
      const point = item as Point;
      const rarityGlow = item.kind === "gear" && (item.rarity === "Rare" || item.rarity === "Relic");
      const relicGlow = item.kind === "gear" && item.rarity === "Relic";
      const itemColor = this.lootDramaColor(item);
      const pickupPulse = 1 + Math.sin(now / 220 + item.id.length) * 0.05;
      this.syncSprite(
        key,
        itemFrame(item),
        point,
        item.kind === "gold" ? 0.72 : item.kind === "potion" ? 0.76 : rarityGlow ? 0.82 : 0.74,
        item.kind === "gear" ? 0.92 : 0.86,
        item.kind === "gear" ? itemColor : 0xffffff,
        1
      );
      this.syncShadow(key, point, 0.36, 0.17, 0.28);
      liveKeys.add(key);

      this.syncGroundGlow(
        `${key}:pickup-pool`,
        point,
        (item.kind === "gold" ? 1.05 : item.kind === "potion" ? 0.88 : rarityGlow ? 1.75 : 1.18) * pickupPulse,
        item.kind === "gold" ? 0.48 : item.kind === "potion" ? 0.42 : rarityGlow ? 0.76 : 0.52,
        itemColor,
        item.kind === "gold" ? 0.18 : item.kind === "potion" ? 0.14 : rarityGlow ? 0.24 : 0.13,
        -0.18
      );

      if (rarityGlow) {
        const glow = this.syncGlow(
          `${key}:glow`,
          point,
          relicGlow ? 1.8 + Math.sin(now / 190) * 0.08 : 1.38 + Math.sin(now / 210) * 0.06,
          itemColor,
          relicGlow ? 0.42 : 0.34
        );
        glow.position.y = 0.04;
        liveKeys.add(`${key}:glow`);
        this.syncGroundGlow(
          `${key}:pool`,
          point,
          relicGlow ? 2.18 : 1.78,
          relicGlow ? 0.98 : 0.78,
          itemColor,
          relicGlow ? 0.3 : 0.21,
          -0.18
        );
        this.syncLootBeam(
          `${key}:beam`,
          point,
          relicGlow ? 5.2 : 4.15,
          relicGlow ? 0.082 : 0.058,
          itemColor,
          relicGlow ? 0.54 : 0.39
        );
        liveBeamKeys.add(`${key}:beam`);
      } else if (item.kind === "gold") {
        this.syncLootBeam(`${key}:coin-column`, point, 2.85, 0.032, itemColor, 0.18);
        liveBeamKeys.add(`${key}:coin-column`);
      }
    }

    for (const shrine of state.shrines) {
      const key = `shrine:${shrine.id}`;
      this.syncShrine(key, shrine, now);
      liveKeys.add(key);
      if (!shrine.used) {
        const shrineColor = colorFromHex(shrine.color, COLOR_AMBER).getHex();
        const glow = this.syncGlow(
          `${key}:glow`,
          shrine,
          1.72 + Math.sin(now / 220) * 0.05,
          shrineColor,
          0.23 + Math.sin(now / 220) * 0.045
        );
        glow.position.y = 0.05;
        liveKeys.add(`${key}:glow`);
        this.syncGroundGlow(
          `${key}:floor-pool`,
          shrine,
          2.15,
          0.96,
          shrineColor,
          0.24 + Math.sin(now / 260) * 0.035,
          -0.1
        );
        this.syncLootBeam(`${key}:column`, shrine, 3.6, 0.046, shrineColor, 0.28);
        liveBeamKeys.add(`${key}:column`);
      }
    }

    for (const key of [...this.spriteRecords.keys()]) {
      if (!liveKeys.has(key)) this.removeSpriteRecord(key);
    }
    for (const [key, beam] of [...this.beamRecords]) {
      if (liveBeamKeys.has(key)) continue;
      this.dynamicWorld.remove(beam);
      this.beamRecords.delete(key);
    }
    this.flushDynamicGroundGlows();
  }

  private lootDramaColor(item: Item): number {
    if (item.kind !== "gear") return colorFromHex(item.color, COLOR_GOLD).getHex();
    if (item.rarity === "Relic") return 0xc986e8;
    if (item.slot === "weapon") return 0xff9b45;
    if (item.slot === "charm") return 0xb88adf;
    return 0x75c9e8;
  }

  private monsterGroundColor(monster: MonsterState): number {
    if (monster.kind === "ash-chanter") return 0x75c9e8;
    if (monster.kind === "bone-warden") return 0xd8bd83;
    return 0xff7840;
  }

  private actorTorchInfluence(point: Point, torch: Point, radius: number): number {
    const distance = Math.hypot(point.x - torch.x, point.y - torch.y);
    return 1 - clamp(distance / Math.max(1, radius * 0.86), 0, 1);
  }

  private actorTorchTint(baseColor: number, point: Point, torch: Point, radius: number, maxWarmth: number): number {
    const influence = this.actorTorchInfluence(point, torch, radius);
    const warmth = maxWarmth * (0.2 + influence * 0.8);
    return new THREE.Color(baseColor).lerp(new THREE.Color(0xffc17a), warmth).getHex();
  }

  private syncActorGrounding(
    key: string,
    point: Point,
    scale: number,
    animation: ActorAnimation | undefined,
    facing: number | undefined,
    color: number,
    baseOpacity: number,
    torch: Point,
    torchRadius: number,
    now: number
  ): void {
    const actorAnimation = animation ?? "idle";
    const actorFacing = facing ?? -Math.PI / 4;
    const torchInfluence = this.actorTorchInfluence(point, torch, torchRadius * (0.88 / 0.86));
    const pulse = 0.5 + Math.sin(now * 0.014 + scale * 3.1) * 0.5;
    const contactKey = `${key}:ground-contact`;
    const contactColor = new THREE.Color(color)
      .lerp(new THREE.Color(0xffb65f), 0.26 + torchInfluence * 0.32)
      .getHex();
    const contactOpacity =
      baseOpacity * (0.42 + torchInfluence * 0.96) +
      (actorAnimation === "hit" ? 0.08 : 0) +
      (actorAnimation === "attack" ? 0.04 : 0);
    this.syncGroundGlow(
      contactKey,
      point,
      scale * (0.74 + pulse * 0.05),
      scale * (0.25 + torchInfluence * 0.08),
      contactColor,
      contactOpacity,
      actorFacing - 0.18
    );

    if (actorAnimation === "idle") return;

    const dirX = Math.cos(actorFacing);
    const dirY = Math.sin(actorFacing);
    const actionKey = `${key}:ground-action`;
    let actionPoint: Point = point;
    let width = scale;
    let depth = scale * 0.22;
    let actionColor = color;
    let opacity = baseOpacity;

    if (actorAnimation === "run") {
      actionPoint = { x: point.x - dirX * scale * 0.26, y: point.y - dirY * scale * 0.26 };
      width = scale * (0.72 + pulse * 0.14);
      depth = scale * 0.22;
      actionColor = new THREE.Color(color).lerp(new THREE.Color(0xc38a58), 0.42).getHex();
      opacity = baseOpacity * (0.46 + pulse * 0.18);
    } else if (actorAnimation === "attack") {
      actionPoint = { x: point.x + dirX * scale * 0.42, y: point.y + dirY * scale * 0.42 };
      width = scale * 1.55;
      depth = scale * 0.42;
      actionColor = new THREE.Color(color).lerp(new THREE.Color(0xffd08a), 0.48).getHex();
      opacity = baseOpacity * (1.35 + pulse * 0.32);
    } else if (actorAnimation === "hit") {
      actionPoint = { x: point.x - dirX * scale * 0.18, y: point.y - dirY * scale * 0.18 };
      width = scale * 1.05;
      depth = scale * 0.34;
      actionColor = new THREE.Color(color).lerp(new THREE.Color(0xff5e3a), 0.54).getHex();
      opacity = baseOpacity * (1.12 + pulse * 0.18);
    } else if (actorAnimation === "death") {
      actionPoint = { x: point.x - dirX * scale * 0.22, y: point.y - dirY * scale * 0.22 };
      width = scale * 1.45;
      depth = scale * 0.5;
      actionColor = new THREE.Color(color).lerp(new THREE.Color(0x6aa8ad), 0.44).getHex();
      opacity = baseOpacity * 0.82;
    }

    this.syncGroundGlow(actionKey, actionPoint, width, depth, actionColor, opacity, actorFacing);
  }

  private monsterBaseScale(monster: MonsterState): number {
    if (monster.kind === "bone-warden") return 1.3;
    if (monster.kind === "ash-chanter") return 1.22;
    return 0.98;
  }

  private monsterVisualScale(monster: MonsterState): number {
    const base = this.monsterBaseScale(monster);
    if (!monster.elite) return base;
    if (monster.kind === "bone-warden") return base * 1.46;
    if (monster.kind === "ash-chanter") return base * 1.22;
    return base * 1.18;
  }

  private monsterVisualHeight(monster: MonsterState, scale: number): number {
    return scale * (monster.elite && monster.kind === "bone-warden" ? 1.72 : 1.58);
  }

  private monsterTint(monster: MonsterState, wounded: boolean): number {
    if (wounded) return 0xfff0c8;
    if (!monster.elite) return 0xffffff;
    return new THREE.Color(0xffffff).lerp(colorFromHex(monster.elite.auraColor, COLOR_BLOOD), 0.28).getHex();
  }

  private syncShrine(key: string, shrine: ShrineState, now: number): void {
    const scale = shrine.used ? 0.86 : 1 + Math.sin(now / 260) * 0.03;
    this.syncSprite(
      key,
      "sprite-obelisk",
      shrine,
      scale,
      1.55 * scale,
      shrine.used ? 0x77736a : colorFromHex(shrine.color, COLOR_BLUE).getHex(),
      shrine.used ? 0.55 : 1
    );
    this.syncShadow(key, shrine, 0.55, 0.24, shrine.used ? 0.18 : 0.36);
  }

  private syncPlayerLights(state: GameState, now: number): void {
    const stats = calculatePlayerStats(state);
    const pos = this.toWorld(state.player);
    const flicker = 1 + Math.sin(now * 0.018) * 0.08 + Math.sin(now * 0.043) * 0.035;
    this.playerTorchLight.position.set(pos.x + 0.2, 1.32, pos.z + 0.12);
    this.playerTorchLight.intensity = (4.8 + stats.torchRadius * 0.16) * flicker;
    this.playerTorchLight.distance = 8.6 + stats.torchRadius * 0.32;
  }

  private syncDebugWorld(state: GameState): void {
    this.clearGroup(this.debugWorld);
    if (!state.debug.enabled || !state.debug.showCollision) return;
    const debug = floorOneCollisionDebug(state);
    if (!debug) return;

    this.addDebugRect(
      debug.bounds.minX,
      debug.bounds.minY,
      debug.bounds.maxX,
      debug.bounds.maxY,
      0x7ed083,
      0.12,
      true
    );
    for (const blocker of debug.blockers)
      this.addDebugCircle(blocker.x, blocker.y, blocker.radius, 0xff6b4a, 0.22);
    for (const rect of debug.doorRects)
      this.addDebugRect(rect.minX, rect.minY, rect.maxX, rect.maxY, 0xffb14a, 0.28, false);

    const path = [state.player.moveTarget, ...(state.player.movePath ?? [])].filter(Boolean) as Point[];
    for (const point of path)
      this.addDebugCircle(point.x - this.origin.x, point.y - this.origin.y, 0.12, 0x75c9e8, 0.46);
  }

  private addDebugRect(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    color: number,
    opacity: number,
    wireframe: boolean
  ): void {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      wireframe
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, 0.075, (minZ + maxZ) / 2);
    this.debugWorld.add(mesh);
  }

  private addDebugCircle(x: number, z: number, radius: number, color: number, opacity: number): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.085, z);
    this.debugWorld.add(mesh);
  }

  private playerDestination(state: GameState): Point | null {
    const path = state.player.movePath ?? [];
    return path[path.length - 1] ?? state.player.moveTarget ?? null;
  }

  private syncActorSprite(
    key: string,
    frame: string,
    point: Point,
    scale: number,
    height: number,
    tint: number,
    opacity: number,
    animation: ActorAnimation | undefined,
    facing: number | undefined,
    now: number
  ): THREE.Sprite {
    const actorAnimation = animation ?? "idle";
    const actorFacing = facing ?? -Math.PI / 4;
    const actorFrame = resolveActorSpriteFrame(frame, actorAnimation, actorFacing, now);
    const sprite = this.syncSprite(key, actorFrame.frameId, point, scale, height, tint, opacity);
    const visual = this.actorVisual(actorAnimation, actorFacing, now);
    const pos = this.toWorld(point);
    sprite.position.set(pos.x + visual.offsetX, height * 0.5 + visual.lift, pos.z + visual.offsetZ);
    sprite.scale.set(scale * visual.scaleX, height * visual.scaleY, 1);
    sprite.material.rotation = visual.rotation;
    return sprite;
  }

  private actorVisual(
    animation: ActorAnimation,
    facing: number,
    now: number
  ): {
    lift: number;
    offsetX: number;
    offsetZ: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  } {
    const turn = Math.cos(facing) < -0.12 ? -1 : 1;
    const dirX = Math.cos(facing);
    const dirZ = Math.sin(facing);
    if (animation === "run") {
      const step = Math.abs(Math.sin(now * 0.018));
      return {
        lift: 0.035 + step * 0.06,
        offsetX: dirX * Math.sin(now * 0.014) * 0.035,
        offsetZ: dirZ * Math.sin(now * 0.014) * 0.035,
        scaleX: 1.02 - step * 0.035,
        scaleY: 0.98 + step * 0.055,
        rotation: Math.sin(now * 0.011) * 0.035
      };
    }
    if (animation === "attack") {
      const pulse = 0.5 + Math.sin(now * 0.026) * 0.5;
      return {
        lift: 0.015,
        offsetX: dirX * (0.08 + pulse * 0.07),
        offsetZ: dirZ * (0.08 + pulse * 0.07),
        scaleX: 1.08,
        scaleY: 0.94,
        rotation: turn * -0.055
      };
    }
    if (animation === "hit") {
      return {
        lift: 0.03,
        offsetX: -dirX * 0.08,
        offsetZ: -dirZ * 0.08,
        scaleX: 1.05,
        scaleY: 0.95,
        rotation: turn * 0.085
      };
    }
    if (animation === "death") {
      return {
        lift: -0.08,
        offsetX: -dirX * 0.08,
        offsetZ: -dirZ * 0.08,
        scaleX: 1.12,
        scaleY: 0.72,
        rotation: turn * 0.24
      };
    }
    return {
      lift: Math.sin(now / 240) * 0.018,
      offsetX: 0,
      offsetZ: 0,
      scaleX: 1 + Math.sin(now / 300) * 0.015,
      scaleY: 1 + Math.sin(now / 260) * 0.018,
      rotation: 0
    };
  }

  private syncSprite(
    key: string,
    frame: string,
    point: Point,
    scale: number,
    height: number,
    tint: number,
    opacity: number
  ): THREE.Sprite {
    let record = this.spriteRecords.get(key);
    if (!record || record.frame !== frame) {
      if (record) this.removeSpriteRecord(key);
      const material = new THREE.SpriteMaterial({
        color: tint,
        transparent: true,
        opacity,
        depthTest: true,
        depthWrite: false,
        alphaTest: isActorSpriteFrame(frame) ? 0.02 : 0.01
      });
      const texture = this.texture(frame);
      if (texture) material.map = texture;
      const sprite = new THREE.Sprite(material);
      record = { sprite, frame };
      this.spriteRecords.set(key, record);
      this.dynamicWorld.add(sprite);
    }

    const pos = this.toWorld(point);
    record.sprite.position.set(pos.x, height * 0.5, pos.z);
    record.sprite.scale.set(scale, height, 1);
    const material = record.sprite.material as THREE.SpriteMaterial;
    material.opacity = opacity;
    material.color.setHex(tint);
    return record.sprite;
  }

  private syncShadow(
    key: string,
    point: Point,
    width: number,
    depth: number,
    opacity: number,
    castFrom?: Point
  ): void {
    const record = this.spriteRecords.get(key);
    if (!record) return;
    if (!record.shadow) {
      const shadowTexture = this.proceduralTexture(PROCEDURAL_CONTACT_SHADOW_TEXTURE, () =>
        this.createContactShadowTexture()
      );
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 32),
        new THREE.MeshBasicMaterial({
          color: 0x180d07,
          map: shadowTexture,
          transparent: true,
          opacity,
          depthWrite: false,
          depthTest: true
        })
      );
      shadow.rotation.x = -Math.PI / 2;
      record.shadow = shadow;
      this.dynamicWorld.add(shadow);
    }
    const pos = this.toWorld(point);
    let offsetX = 0;
    let offsetZ = 0.06;
    let rotation = -0.18;
    let castScale = 1;
    if (castFrom) {
      const cast = this.toWorld(castFrom);
      const dx = pos.x - cast.x;
      const dz = pos.z - cast.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.001) {
        offsetX = (dx / distance) * width * 0.12;
        offsetZ = (dz / distance) * depth * 0.22;
        rotation = Math.atan2(dz, dx);
        castScale = 1.18;
      }
    }
    record.shadow.position.set(pos.x + offsetX, 0.012, pos.z + offsetZ);
    record.shadow.scale.set(width * castScale, depth * (castFrom ? 1.42 : 1), 1);
    record.shadow.rotation.z = rotation;
    const material = record.shadow.material as THREE.MeshBasicMaterial;
    material.opacity = opacity;
    material.color.setHex(castFrom ? 0x170b05 : 0x120d09);
  }

  private syncGlow(key: string, point: Point, scale: number, color: number, opacity: number): THREE.Sprite {
    let record = this.spriteRecords.get(key);
    if (!record) {
      const material = new THREE.SpriteMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        alphaTest: 0.01
      });
      const texture = this.texture("fx-bloom");
      if (texture) material.map = texture;
      const sprite = new THREE.Sprite(material);
      record = { sprite, frame: "fx-bloom" };
      this.spriteRecords.set(key, record);
      this.dynamicWorld.add(sprite);
    }
    const pos = this.toWorld(point);
    record.sprite.position.set(pos.x, 0.02, pos.z);
    record.sprite.scale.set(scale, scale, 1);
    const material = record.sprite.material as THREE.SpriteMaterial;
    material.color.setHex(color);
    material.opacity = clamp(opacity, 0, 1);
    return record.sprite;
  }

  private syncActorRimLight(
    key: string,
    point: Point,
    lightPoint: Point,
    scale: number,
    height: number,
    color: number,
    opacity: number
  ): THREE.Sprite {
    const rim = this.syncGlow(key, point, 1, color, opacity);
    const pos = this.toWorld(point);
    const lightPos = this.toWorld(lightPoint);
    const dx = lightPos.x - pos.x;
    const dz = lightPos.z - pos.z;
    const length = Math.hypot(dx, dz);
    const offsetX = length > 0.001 ? (dx / length) * scale * 0.12 : scale * 0.08;
    const offsetZ = length > 0.001 ? (dz / length) * scale * 0.12 : scale * 0.04;
    rim.position.set(pos.x + offsetX, height * 0.48, pos.z + offsetZ);
    rim.scale.set(scale * 0.46, height * 0.58, 1);
    const material = rim.material as THREE.SpriteMaterial;
    material.opacity = clamp(opacity, 0, 0.11);
    return rim;
  }

  private syncGroundGlow(
    key: string,
    point: Point,
    width: number,
    depth: number,
    color: number,
    opacity: number,
    rotation: number
  ): void {
    const pos = this.toWorld(point);
    this.pendingDynamicGroundGlows.push({
      key,
      x: pos.x + 0.1,
      z: pos.z + 0.1,
      width,
      depth,
      rotation,
      color: new THREE.Color(color).multiplyScalar(clamp(opacity, 0, 1)),
      opacity: 1
    });
  }

  private flushDynamicGroundGlows(): void {
    const count = this.pendingDynamicGroundGlows.length;
    if (count === 0) {
      if (this.dynamicGroundGlowMesh) this.dynamicGroundGlowMesh.count = 0;
      return;
    }

    if (!this.dynamicGroundGlowMesh || count > this.dynamicGroundGlowCapacity) {
      this.disposeDynamicGroundGlowMesh();
      this.dynamicGroundGlowCapacity = Math.max(16, nextPowerOfTwo(count));
      const glowTexture = this.proceduralTexture(PROCEDURAL_GROUND_GLOW_TEXTURE, () =>
        this.createGroundGlowTexture()
      );
      this.dynamicGroundGlowMesh = new THREE.InstancedMesh(
        new THREE.CircleGeometry(0.5, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: glowTexture,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          depthTest: true,
          blending: THREE.AdditiveBlending,
          vertexColors: true
        }),
        this.dynamicGroundGlowCapacity
      );
      this.dynamicGroundGlowMesh.frustumCulled = false;
      this.dynamicWorld.add(this.dynamicGroundGlowMesh);
    }

    const mesh = this.dynamicGroundGlowMesh;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    mesh.count = count;
    for (let index = 0; index < count; index += 1) {
      const glow = this.pendingDynamicGroundGlows[index]!;
      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, glow.rotation));
      matrix.compose(
        new THREE.Vector3(glow.x, 0.042, glow.z),
        quaternion,
        new THREE.Vector3(glow.width, glow.depth, 1)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, glow.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private disposeDynamicGroundGlowMesh(): void {
    if (!this.dynamicGroundGlowMesh) return;
    this.dynamicWorld.remove(this.dynamicGroundGlowMesh);
    this.dynamicGroundGlowMesh.geometry.dispose();
    const material = this.dynamicGroundGlowMesh.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else {
      material.dispose();
    }
    this.dynamicGroundGlowMesh = null;
    this.dynamicGroundGlowCapacity = 0;
  }

  private syncLootBeam(
    key: string,
    point: Point,
    height: number,
    radius: number,
    color: number,
    opacity: number
  ): THREE.Sprite {
    let beam = this.beamRecords.get(key);
    if (!beam) {
      const beamTexture = this.proceduralTexture(PROCEDURAL_LOOT_BEAM_TEXTURE, () =>
        this.createLootBeamTexture()
      );
      beam = new THREE.Sprite(
        new THREE.SpriteMaterial({
          color,
          map: beamTexture,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: true,
          alphaTest: 0.01,
          toneMapped: false
        })
      );
      this.beamRecords.set(key, beam);
      this.dynamicWorld.add(beam);
    }
    const pos = this.toWorld(point);
    beam.position.set(pos.x, height * 0.5, pos.z);
    beam.scale.set(Math.max(0.42, radius * 18), height, 1);
    const material = beam.material as THREE.SpriteMaterial;
    material.color.setHex(color);
    material.opacity = clamp(opacity, 0, 1);
    return beam;
  }

  private addEffects(events: EffectEvent[], now: number): void {
    for (const event of events) {
      if (event.x === undefined || event.y === undefined) continue;
      if (event.type === "damage") {
        if (event.amount !== undefined) this.addTextFx(event, now);
        if (event.heavy) this.addRingFx(event, now, 0.85, 640);
      } else if (event.type === "loot-beam" || event.type === "pickup") {
        this.addBeamFx(event, now);
      } else if (event.type === "hit") {
        this.addSparkFx(event, now);
        if (event.heavy) this.addRingFx(event, now, 0.92, 620);
      } else if (event.type === "death") {
        this.addDeathGhostFx(event, now);
        this.addSparkFx(event, now);
        this.addRingFx(event, now, event.heavy ? 1.4 : 1.05, event.heavy ? 960 : 720);
      } else if (event.type === "shrine") {
        this.addBeamFx(event, now);
        this.addSparkFx(event, now);
        this.addRingFx(event, now, 1.55, 1100);
      } else if (event.type === "door") {
        this.addSparkFx(event, now);
        this.addRingFx(event, now, 0.95, 680);
      }
      this.addCameraImpulse(event, now);
    }
  }

  private addTextFx(event: EffectEvent, now: number): void {
    const text = String(event.amount ?? event.text ?? "");
    if (!text) return;
    const texture = this.textTexture(text, event.color ?? "#fff1c8", event.heavy ? 34 : 26);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      alphaTest: 0.01
    });
    const sprite = new THREE.Sprite(material);
    const pos = this.toWorld({ x: event.x!, y: event.y! });
    sprite.position.set(pos.x, 1.9, pos.z);
    sprite.scale.set(event.heavy ? 1.25 : 0.95, event.heavy ? 0.5 : 0.38, 1);
    this.fxWorld.add(sprite);
    const id = this.fxId(event, "text");
    this.runtimeFx.set(id, { id, object: sprite, born: now, duration: 900, baseY: 1.9, kind: "text" });
  }

  private addBeamFx(event: EffectEvent, now: number): void {
    const color = colorFromHex(event.color ?? "#f1c86a", COLOR_GOLD).getHex();
    const heavy = event.type === "loot-beam" || event.heavy === true;
    const group = new THREE.Group();
    const pos = this.toWorld({ x: event.x!, y: event.y! });
    group.position.set(pos.x, 0.04, pos.z);

    const height = heavy ? 4.6 : 2.35;
    const beam = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color,
        map: this.proceduralTexture(PROCEDURAL_LOOT_BEAM_TEXTURE, () => this.createLootBeamTexture()),
        transparent: true,
        opacity: heavy ? 0.62 : 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        alphaTest: 0.01,
        toneMapped: false
      })
    );
    beam.position.y = height * 0.5;
    beam.scale.set(heavy ? 1.1 : 0.62, height, 1);
    group.add(beam);

    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: heavy ? 0.78 : 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, heavy ? 0.66 : 0.48, 40), ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    group.add(ring);

    const crown = new THREE.Sprite(
      new THREE.SpriteMaterial({
        color,
        transparent: true,
        opacity: heavy ? 0.78 : 0.46,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        alphaTest: 0.01
      })
    );
    const crownTexture = this.texture("fx-bloom");
    if (crownTexture) crown.material.map = crownTexture;
    crown.position.y = heavy ? 1.45 : 0.74;
    crown.scale.set(heavy ? 1.35 : 0.72, heavy ? 1.35 : 0.72, 1);
    group.add(crown);

    this.fxWorld.add(group);
    const id = this.fxId(event, "beam");
    this.runtimeFx.set(id, {
      id,
      object: group,
      born: now,
      duration: heavy ? 1900 : 880,
      baseY: 0.04,
      kind: "beam"
    });
  }

  private addSparkFx(event: EffectEvent, now: number): void {
    const material = new THREE.SpriteMaterial({
      color: colorFromHex(event.color ?? "#f2a84b", COLOR_AMBER).getHex(),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.01
    });
    const texture = this.texture("fx-hit");
    if (texture) material.map = texture;
    const sprite = new THREE.Sprite(material);
    const pos = this.toWorld({ x: event.x!, y: event.y! });
    sprite.position.set(pos.x, 1.0, pos.z);
    const scale = event.type === "death" ? (event.heavy ? 1.65 : 1.25) : event.heavy ? 1.35 : 1.1;
    sprite.scale.set(scale, scale, 1);
    this.fxWorld.add(sprite);
    const id = this.fxId(event, "spark");
    this.runtimeFx.set(id, {
      id,
      object: sprite,
      born: now,
      duration: event.type === "death" ? 740 : 520,
      baseY: scale,
      kind: "spark"
    });
  }

  private addRingFx(event: EffectEvent, now: number, scale: number, duration: number): void {
    const color = colorFromHex(event.color ?? "#f2a84b", COLOR_AMBER).getHex();
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: event.heavy ? 0.72 : 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 44), material);
    const pos = this.toWorld({ x: event.x!, y: event.y! });
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.055, pos.z);
    mesh.scale.setScalar(scale);
    this.fxWorld.add(mesh);
    const id = this.fxId(event, "ring");
    this.runtimeFx.set(id, { id, object: mesh, born: now, duration, baseY: scale, kind: "ring" });
  }

  private addDeathGhostFx(event: EffectEvent, now: number): void {
    if (!event.monsterKind) return;
    const frame = monsterFrameForKind(event.monsterKind);
    const material = new THREE.SpriteMaterial({
      color: colorFromHex(event.color ?? "#ffffff", 0xffffff).getHex(),
      transparent: true,
      opacity: 0.78,
      depthTest: true,
      depthWrite: false,
      alphaTest: 0.035
    });
    const texture = this.texture(frame);
    if (texture) material.map = texture;
    const sprite = new THREE.Sprite(material);
    const pos = this.toWorld({ x: event.x!, y: event.y! });
    const baseScale =
      event.monsterKind === "bone-warden" ? 1.22 : event.monsterKind === "ash-chanter" ? 1.16 : 0.92;
    const scale = baseScale * (event.heavy ? (event.monsterKind === "bone-warden" ? 1.46 : 1.18) : 1);
    sprite.position.set(pos.x, scale * 0.74, pos.z);
    sprite.scale.set(scale, scale * 1.58, 1);
    sprite.userData.baseScaleX = scale;
    sprite.userData.baseScaleY = scale * 1.58;
    sprite.userData.fallRotation = event.heavy ? 0.42 : 0.28;
    this.fxWorld.add(sprite);
    const id = this.fxId(event, "corpse");
    this.runtimeFx.set(id, {
      id,
      object: sprite,
      born: now,
      duration: event.heavy ? 1050 : 820,
      baseY: scale * 0.74,
      kind: "corpse"
    });
  }

  private updateEffects(now: number): void {
    for (const fx of [...this.runtimeFx.values()]) {
      const age = now - fx.born;
      const t = clamp(age / fx.duration, 0, 1);
      const opacity = 1 - t;
      if (fx.kind === "text") fx.object.position.y = fx.baseY + t * 1.05;
      if (fx.kind === "spark") fx.object.scale.setScalar(fx.baseY * (1 + t * 1.35));
      if (fx.kind === "ring") fx.object.scale.setScalar(fx.baseY * (0.45 + t * 1.75));
      if (fx.kind === "beam") {
        const pulse = 1 + Math.sin(age * 0.025) * 0.07;
        fx.object.scale.set(pulse, 1, pulse);
      }
      if (fx.kind === "corpse") {
        const sprite = fx.object as THREE.Sprite;
        const baseScaleX =
          typeof sprite.userData.baseScaleX === "number" ? (sprite.userData.baseScaleX as number) : 1;
        const baseScaleY =
          typeof sprite.userData.baseScaleY === "number" ? (sprite.userData.baseScaleY as number) : 1;
        const fallRotation =
          typeof sprite.userData.fallRotation === "number" ? (sprite.userData.fallRotation as number) : 0.3;
        sprite.position.y = fx.baseY - t * 0.28;
        sprite.scale.set(baseScaleX * (1 + t * 0.12), baseScaleY * (1 - t * 0.48), 1);
        sprite.material.rotation = fallRotation * t;
      }
      this.setObjectOpacity(fx.object, opacity);
      if (t >= 1) {
        this.fxWorld.remove(fx.object);
        this.runtimeFx.delete(fx.id);
      }
    }
  }

  private fxId(event: EffectEvent, part: string): string {
    return `${event.id}:${part}`;
  }

  private addCameraImpulse(event: EffectEvent, now: number): void {
    let strength = 0;
    let duration = 220;
    if (event.type === "loot-beam") {
      strength = 0.095;
      duration = 520;
    } else if (event.type === "death") {
      strength = event.heavy ? 0.075 : 0.045;
      duration = event.heavy ? 420 : 260;
    } else if (event.type === "door") {
      strength = 0.035;
      duration = 260;
    } else if (event.heavy && (event.type === "damage" || event.type === "hit" || event.type === "shrine")) {
      strength = event.type === "shrine" ? 0.055 : 0.045;
      duration = event.type === "shrine" ? 360 : 240;
    }
    if (strength <= 0) return;
    this.cameraShakeStrength = Math.max(this.cameraShakeStrength, strength);
    this.cameraShakeDuration = Math.max(this.cameraShakeDuration, duration);
    this.cameraShakeUntil = Math.max(this.cameraShakeUntil, now + duration);
  }

  private syncCameraShake(now: number): void {
    if (now >= this.cameraShakeUntil) {
      this.camera.position.copy(this.cameraBase);
      this.camera.lookAt(this.cameraTarget);
      this.cameraShakeStrength = 0;
      this.cameraShakeDuration = 1;
      return;
    }

    const remaining = this.cameraShakeUntil - now;
    const falloff = clamp(remaining / this.cameraShakeDuration, 0, 1);
    const strength = this.cameraShakeStrength * falloff;
    const offset = new THREE.Vector3(
      Math.sin(now * 0.071) * strength,
      Math.cos(now * 0.083) * strength * 0.45,
      Math.sin(now * 0.063 + 1.7) * strength
    );
    this.camera.position.copy(this.cameraBase).add(offset);
    this.camera.lookAt(this.cameraTarget);
  }

  private setObjectOpacity(object: THREE.Object3D, opacity: number): void {
    object.traverse((child) => {
      const material = (child as THREE.Mesh | THREE.Sprite).material as
        | THREE.Material
        | THREE.Material[]
        | undefined;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const entry of materials) {
        const baseOpacity =
          typeof entry.userData.baseOpacity === "number"
            ? (entry.userData.baseOpacity as number)
            : entry.opacity;
        entry.userData.baseOpacity = baseOpacity;
        entry.opacity = baseOpacity * opacity;
      }
    });
  }

  private addGroundDecal(
    x: number,
    z: number,
    width: number,
    depth: number,
    color: number,
    opacity: number,
    rotation = 0
  ): void {
    this.pendingGroundDecals.push({
      x,
      z,
      width,
      depth,
      rotation,
      color: new THREE.Color(color),
      opacity
    });
  }

  private addGroundGlowDecal(
    x: number,
    z: number,
    width: number,
    depth: number,
    color: number,
    opacity: number,
    rotation = 0
  ): void {
    this.pendingGroundGlowDecals.push({
      x,
      z,
      width,
      depth,
      rotation,
      color: new THREE.Color(color),
      opacity
    });
  }

  private addGroundRect(
    x: number,
    z: number,
    width: number,
    depth: number,
    color: number,
    opacity: number,
    rotation = 0
  ): void {
    this.pendingGroundRects.push({
      x,
      z,
      width,
      depth,
      rotation,
      color: new THREE.Color(color),
      opacity
    });
  }

  private flushGroundPrimitives(): void {
    this.addBatchedGroundPrimitives(
      this.pendingGroundDecals,
      () => new THREE.CircleGeometry(0.5, 32),
      0.018,
      (opacity) =>
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity,
          depthWrite: false,
          depthTest: true,
          vertexColors: true
        })
    );
    this.addBatchedGroundPrimitives(
      this.pendingGroundRects,
      () => new THREE.PlaneGeometry(1, 1),
      0.019,
      (opacity) =>
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity,
          depthWrite: false,
          depthTest: true,
          vertexColors: true
        })
    );
    this.addBatchedGroundPrimitives(
      this.pendingGroundGlowDecals,
      () => new THREE.CircleGeometry(0.5, 48),
      0.036,
      (opacity) =>
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: this.proceduralTexture(PROCEDURAL_GROUND_GLOW_TEXTURE, () => this.createGroundGlowTexture()),
          transparent: true,
          opacity,
          depthWrite: false,
          depthTest: true,
          blending: THREE.AdditiveBlending,
          vertexColors: true
        })
    );
    this.pendingGroundDecals.length = 0;
    this.pendingGroundGlowDecals.length = 0;
    this.pendingGroundRects.length = 0;
  }

  private addBatchedGroundPrimitives(
    entries: GroundPrimitiveInstance[],
    createGeometry: () => THREE.BufferGeometry,
    lift: number,
    createMaterial: (opacity: number) => THREE.MeshBasicMaterial
  ): void {
    if (!entries.length) return;
    const byOpacity = new Map<number, GroundPrimitiveInstance[]>();
    for (const entry of entries) {
      const opacity = this.groundOpacityBucket(entry.opacity);
      const bucket = byOpacity.get(opacity);
      if (bucket) bucket.push(entry);
      else byOpacity.set(opacity, [entry]);
    }

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    for (const [opacity, bucket] of byOpacity) {
      const mesh = new THREE.InstancedMesh(createGeometry(), createMaterial(opacity), bucket.length);
      for (let index = 0; index < bucket.length; index += 1) {
        const entry = bucket[index]!;
        quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, entry.rotation));
        matrix.compose(
          new THREE.Vector3(entry.x, lift, entry.z),
          quaternion,
          new THREE.Vector3(entry.width, entry.depth, 1)
        );
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, entry.color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.staticWorld.add(mesh);
    }
  }

  private groundOpacityBucket(opacity: number): number {
    return Math.round(clamp(opacity, 0, 1) / 0.01) * 0.01;
  }

  private addBillboard(
    frame: string,
    x: number,
    z: number,
    scale: number,
    height: number,
    group: THREE.Group
  ): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      color: this.staticSpriteTint(frame),
      transparent: true,
      depthTest: true,
      depthWrite: false,
      alphaTest: isActorSpriteFrame(frame) ? 0.035 : 0.01
    });
    const texture = this.texture(frame);
    if (texture) material.map = texture;
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, height * 0.5, z);
    sprite.scale.set(scale, height, 1);
    group.add(sprite);
    return sprite;
  }

  private staticSpriteTint(frame: string): THREE.Color {
    const tint = new THREE.Color(0xffffff);
    if (frame.startsWith("sprite-door")) tint.setRGB(1.34, 1.04, 0.8);
    else if (frame.startsWith("sprite-wall-torch")) tint.setRGB(1.3, 1.08, 0.78);
    else if (frame.startsWith("sprite-wall-banner")) tint.setRGB(1.66, 0.72, 0.5);
    else if (frame.startsWith("sprite-wall-")) tint.setRGB(1.52, 1.25, 0.96);
    return tint;
  }

  private addStaticBillboardInstances(entries: StaticBillboardInstance[]): void {
    if (!entries.length) return;
    const byFrame = new Map<string, StaticBillboardInstance[]>();
    for (const entry of entries) {
      const frameEntries = byFrame.get(entry.frame) ?? [];
      frameEntries.push(entry);
      byFrame.set(entry.frame, frameEntries);
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    const quaternion = this.camera.quaternion.clone();
    const matrix = new THREE.Matrix4();
    for (const [frame, frameEntries] of byFrame) {
      const material = new THREE.MeshBasicMaterial({
        color: this.staticSpriteTint(frame),
        transparent: true,
        depthTest: true,
        depthWrite: false,
        alphaTest: 0.01,
        side: THREE.DoubleSide
      });
      const texture = this.texture(frame);
      if (texture) material.map = texture;
      const mesh = new THREE.InstancedMesh(geometry, material, frameEntries.length);
      frameEntries.forEach((entry, index) => {
        matrix.compose(
          new THREE.Vector3(entry.x, entry.height * 0.5, entry.z),
          quaternion,
          new THREE.Vector3(entry.scale, entry.height, 1)
        );
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.staticWorld.add(mesh);
    }
  }

  private addAtmosphereWispInstances(entries: AtmosphereWispInstance[], opacity: number): void {
    if (!entries.length) return;
    const texture = this.proceduralTexture(PROCEDURAL_FOG_WISP_TEXTURE, () => this.createFogWispTexture());
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: texture,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
      vertexColors: true
    });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, entries.length);
    const cameraFacing = this.camera.quaternion.clone();
    const rollAxis = new THREE.Vector3(0, 0, 1);
    const roll = new THREE.Quaternion();
    const quaternion = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      roll.setFromAxisAngle(rollAxis, entry.rotation);
      quaternion.copy(cameraFacing).multiply(roll);
      matrix.compose(
        new THREE.Vector3(entry.x, entry.lift + entry.height * 0.5, entry.z),
        quaternion,
        new THREE.Vector3(entry.width, entry.height, 1)
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, entry.color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.staticWorld.add(mesh);
  }

  private addPointLight(
    x: number,
    z: number,
    color: number,
    intensity: number,
    distanceValue: number,
    height: number
  ): void {
    const light = new THREE.PointLight(color, intensity, distanceValue, 1.9);
    light.position.set(x, height, z);
    this.staticWorld.add(light);
  }

  private proceduralTexture(name: string, createCanvas: () => HTMLCanvasElement): THREE.Texture {
    const cached = this.textureCache.get(name);
    if (cached) return cached;
    const texture = new THREE.CanvasTexture(createCanvas());
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.textureCache.set(name, texture);
    return texture;
  }

  private createContactShadowTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const broad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    broad.addColorStop(0, "rgba(255, 255, 255, 0.82)");
    broad.addColorStop(0.44, "rgba(255, 255, 255, 0.38)");
    broad.addColorStop(0.74, "rgba(255, 255, 255, 0.12)");
    broad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = broad;
    ctx.beginPath();
    ctx.ellipse(64, 68, 58, 43, -0.06, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(58, 62, 2, 58, 62, 34);
    core.addColorStop(0, "rgba(255, 255, 255, 0.78)");
    core.addColorStop(0.58, "rgba(255, 255, 255, 0.26)");
    core.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(59, 66, 34, 21, -0.16, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  private createGroundGlowTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 192;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const core = ctx.createRadialGradient(92, 94, 3, 96, 96, 90);
    core.addColorStop(0, "rgba(255, 255, 255, 0.92)");
    core.addColorStop(0.22, "rgba(255, 255, 255, 0.62)");
    core.addColorStop(0.5, "rgba(255, 255, 255, 0.24)");
    core.addColorStop(0.78, "rgba(255, 255, 255, 0.07)");
    core.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(96, 96, 88, 66, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 0.2;
    for (let index = 0; index < 18; index += 1) {
      const seed = index * 71;
      const angle = detailNoise(seed + 1) * Math.PI * 2;
      const radius = 46 + detailNoise(seed + 3) * 42;
      const x = 96 + Math.cos(angle) * radius;
      const y = 96 + Math.sin(angle) * radius * 0.72;
      const w = 12 + detailNoise(seed + 5) * 28;
      const h = 8 + detailNoise(seed + 7) * 18;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    return canvas;
  }

  private createFogWispTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const broad = ctx.createRadialGradient(128, 70, 12, 128, 70, 116);
    broad.addColorStop(0, "rgba(255, 255, 255, 0.82)");
    broad.addColorStop(0.34, "rgba(255, 255, 255, 0.48)");
    broad.addColorStop(0.68, "rgba(255, 255, 255, 0.18)");
    broad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = broad;
    ctx.beginPath();
    ctx.ellipse(128, 70, 118, 48, -0.04, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.68;
    for (let index = 0; index < 9; index += 1) {
      const seed = index * 89;
      const x = 34 + detailNoise(seed + 1) * 188;
      const y = 32 + detailNoise(seed + 3) * 58;
      const w = 28 + detailNoise(seed + 5) * 58;
      const h = 10 + detailNoise(seed + 7) * 24;
      const puff = ctx.createRadialGradient(x, y, 2, x, y, Math.max(w, h));
      puff.addColorStop(0, "rgba(255, 255, 255, 0.64)");
      puff.addColorStop(0.58, "rgba(255, 255, 255, 0.26)");
      puff.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = puff;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, (detailNoise(seed + 9) - 0.5) * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 0.24;
    for (let index = 0; index < 16; index += 1) {
      const seed = 1301 + index * 101;
      const x = 20 + detailNoise(seed + 1) * 216;
      const y = 22 + detailNoise(seed + 3) * 82;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        10 + detailNoise(seed + 5) * 34,
        6 + detailNoise(seed + 7) * 18,
        (detailNoise(seed + 9) - 0.5) * 0.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    return canvas;
  }

  private createWallLightTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const broad = ctx.createRadialGradient(132, 278, 14, 132, 278, 232);
    broad.addColorStop(0, "rgba(255, 255, 255, 0.88)");
    broad.addColorStop(0.24, "rgba(255, 255, 255, 0.54)");
    broad.addColorStop(0.58, "rgba(255, 255, 255, 0.18)");
    broad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = broad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const vertical = ctx.createLinearGradient(0, 0, 0, canvas.height);
    vertical.addColorStop(0, "rgba(255, 255, 255, 0.05)");
    vertical.addColorStop(0.22, "rgba(255, 255, 255, 0.42)");
    vertical.addColorStop(0.62, "rgba(255, 255, 255, 0.62)");
    vertical.addColorStop(0.92, "rgba(255, 255, 255, 0.08)");
    vertical.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";

    ctx.globalAlpha = 0.34;
    for (let index = 0; index < 9; index += 1) {
      const seed = 211 + index * 83;
      const x = 36 + detailNoise(seed + 1) * 184;
      const y = 112 + detailNoise(seed + 3) * 304;
      const h = 38 + detailNoise(seed + 5) * 128;
      const w = 3 + detailNoise(seed + 7) * 9;
      const streak = ctx.createLinearGradient(0, y - h, 0, y + h);
      streak.addColorStop(0, "rgba(255, 255, 255, 0)");
      streak.addColorStop(0.48, "rgba(255, 255, 255, 0.36)");
      streak.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = streak;
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, (detailNoise(seed + 9) - 0.5) * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 0.22;
    for (let index = 0; index < 14; index += 1) {
      const seed = 911 + index * 127;
      ctx.beginPath();
      ctx.ellipse(
        24 + detailNoise(seed + 1) * 208,
        58 + detailNoise(seed + 3) * 390,
        7 + detailNoise(seed + 5) * 24,
        18 + detailNoise(seed + 7) * 62,
        (detailNoise(seed + 9) - 0.5) * 0.38,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    return canvas;
  }

  private createWallFacadeTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const arch = new Path2D();
    arch.moveTo(48, 466);
    arch.lineTo(48, 218);
    arch.quadraticCurveTo(50, 116, 128, 48);
    arch.quadraticCurveTo(206, 116, 208, 218);
    arch.lineTo(208, 466);
    arch.closePath();

    const recess = ctx.createLinearGradient(0, 52, 0, 468);
    recess.addColorStop(0, "rgba(22, 16, 12, 0.84)");
    recess.addColorStop(0.46, "rgba(7, 6, 5, 0.92)");
    recess.addColorStop(1, "rgba(2, 2, 2, 0.96)");
    ctx.fillStyle = recess;
    ctx.fill(arch);

    ctx.save();
    ctx.clip(arch);
    const sideGlow = ctx.createRadialGradient(134, 244, 14, 134, 244, 176);
    sideGlow.addColorStop(0, "rgba(255, 154, 74, 0.24)");
    sideGlow.addColorStop(0.5, "rgba(86, 50, 30, 0.18)");
    sideGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = sideGlow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.24;
    for (let course = 0; course < 8; course += 1) {
      const y = 172 + course * 34 + (detailNoise(course * 73) - 0.5) * 6;
      ctx.strokeStyle = course % 2 === 0 ? "#5f4027" : "#1a1009";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(42, y);
      ctx.lineTo(214, y + (detailNoise(course * 91) - 0.5) * 5);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255, 160, 74, 0.24)";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(214, 137, 74, 0.62)";
    ctx.lineWidth = 4;
    ctx.stroke(arch);
    ctx.shadowBlur = 0;

    const inner = new Path2D();
    inner.moveTo(74, 456);
    inner.lineTo(74, 232);
    inner.quadraticCurveTo(75, 140, 128, 84);
    inner.quadraticCurveTo(181, 140, 182, 232);
    inner.lineTo(182, 456);
    ctx.strokeStyle = "rgba(190, 121, 68, 0.38)";
    ctx.lineWidth = 3;
    ctx.stroke(inner);

    ctx.globalAlpha = 0.42;
    ctx.fillStyle = "#20140c";
    ctx.fillRect(38, 448, 180, 18);
    ctx.fillStyle = "#b77b42";
    ctx.fillRect(44, 444, 168, 4);
    ctx.fillRect(70, 206, 4, 238);
    ctx.fillRect(182, 206, 4, 238);
    ctx.globalAlpha = 1;

    for (let index = 0; index < 18; index += 1) {
      const seed = index * 127;
      const x = 66 + detailNoise(seed + 1) * 124;
      const y = 106 + detailNoise(seed + 3) * 330;
      const len = 18 + detailNoise(seed + 5) * 64;
      ctx.strokeStyle = detailNoise(seed + 7) > 0.62 ? "rgba(229, 150, 75, 0.36)" : "rgba(0, 0, 0, 0.42)";
      ctx.lineWidth = 1 + detailNoise(seed + 9) * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (detailNoise(seed + 11) - 0.5) * 42, y + len);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 0.18;
    for (let index = 0; index < 12; index += 1) {
      const seed = index * 163;
      ctx.beginPath();
      ctx.ellipse(
        48 + detailNoise(seed + 1) * 160,
        74 + detailNoise(seed + 3) * 388,
        8 + detailNoise(seed + 5) * 20,
        12 + detailNoise(seed + 7) * 32,
        (detailNoise(seed + 9) - 0.5) * 0.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    return canvas;
  }

  private createLootBeamTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const shaft = ctx.createLinearGradient(0, 0, 0, canvas.height);
    shaft.addColorStop(0, "rgba(255, 255, 255, 0)");
    shaft.addColorStop(0.18, "rgba(255, 255, 255, 0.24)");
    shaft.addColorStop(0.54, "rgba(255, 255, 255, 0.52)");
    shaft.addColorStop(0.82, "rgba(255, 255, 255, 0.2)");
    shaft.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.ellipse(64, 260, 18, 246, 0.04, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createLinearGradient(0, 38, 0, 474);
    core.addColorStop(0, "rgba(255, 255, 255, 0)");
    core.addColorStop(0.4, "rgba(255, 255, 255, 0.5)");
    core.addColorStop(0.7, "rgba(255, 255, 255, 0.3)");
    core.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(63, 286, 5, 210, -0.02, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.46;
    for (let index = 0; index < 11; index += 1) {
      const seed = index * 97;
      const x = 46 + detailNoise(seed + 1) * 36;
      const y = 88 + detailNoise(seed + 3) * 330;
      const h = 42 + detailNoise(seed + 5) * 114;
      const w = 2 + detailNoise(seed + 7) * 5;
      const drift = (detailNoise(seed + 9) - 0.5) * 18;
      const ribbon = ctx.createLinearGradient(0, y - h, 0, y + h);
      ribbon.addColorStop(0, "rgba(255, 255, 255, 0)");
      ribbon.addColorStop(0.5, "rgba(255, 255, 255, 0.42)");
      ribbon.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = ribbon;
      ctx.beginPath();
      ctx.ellipse(x + drift, y, w, h, (detailNoise(seed + 11) - 0.5) * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 0.18;
    for (let index = 0; index < 14; index += 1) {
      const seed = index * 131;
      const x = 34 + detailNoise(seed + 1) * 60;
      const y = 44 + detailNoise(seed + 3) * 420;
      ctx.beginPath();
      ctx.ellipse(x, y, 6 + detailNoise(seed + 5) * 18, 22 + detailNoise(seed + 7) * 58, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    return canvas;
  }

  private createPaintedFloorTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d")!;
    const base = ctx.createRadialGradient(540, 520, 70, 530, 520, 660);
    base.addColorStop(0, "#85613d");
    base.addColorStop(0.34, "#56412e");
    base.addColorStop(0.68, "#25231d");
    base.addColorStop(1, "#0b0c0d");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.16;
    const cold = ctx.createRadialGradient(170, 170, 30, 170, 170, 360);
    cold.addColorStop(0, "#315d66");
    cold.addColorStop(0.58, "#18343b");
    cold.addColorStop(1, "#050708");
    ctx.fillStyle = cold;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalAlpha = 0.48;
    for (let row = 0; row < 16; row += 1) {
      for (let col = 0; col < 16; col += 1) {
        const seed = row * 59 + col * 97;
        const x = col * 64 + (detailNoise(seed + 1) - 0.5) * 8;
        const y = row * 64 + (detailNoise(seed + 2) - 0.5) * 8;
        const w = 64 + (detailNoise(seed + 3) - 0.5) * 10;
        const h = 64 + (detailNoise(seed + 4) - 0.5) * 10;
        const warmth = detailNoise(seed + 5);
        const shade = Math.round(40 + detailNoise(seed + 6) * 40);
        const red = Math.round(shade + warmth * 24);
        const green = Math.round(shade + warmth * 13);
        const blue = Math.round(shade * 0.82);
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(x, y, w, h);
      }
    }

    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = "#15100b";
    ctx.lineWidth = 2;
    for (let i = 0; i <= 16; i += 1) {
      const offset = (detailNoise(i * 31) - 0.5) * 9;
      ctx.beginPath();
      ctx.moveTo(i * 64 + offset, 0);
      ctx.lineTo(i * 64 - offset * 0.4, 1024);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 64 - offset);
      ctx.lineTo(1024, i * 64 + offset * 0.45);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.36;
    for (let i = 0; i < 90; i += 1) {
      const seed = i * 137;
      const x = detailNoise(seed + 1) * 1024;
      const y = detailNoise(seed + 2) * 1024;
      const len = 18 + detailNoise(seed + 3) * 86;
      const angle = detailNoise(seed + 4) * Math.PI * 2;
      ctx.strokeStyle = detailNoise(seed + 5) > 0.75 ? "#9a6a3a" : "#0b0806";
      ctx.lineWidth = 1 + detailNoise(seed + 6) * 2.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len * 0.44);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 34; i += 1) {
      const seed = i * 181;
      const x = detailNoise(seed + 1) * 1024;
      const y = detailNoise(seed + 2) * 1024;
      const r = 8 + detailNoise(seed + 3) * 32;
      ctx.fillStyle = detailNoise(seed + 4) > 0.7 ? "#9b352a" : "#030303";
      ctx.beginPath();
      ctx.ellipse(x, y, r * (1.2 + detailNoise(seed + 5)), r * 0.45, detailNoise(seed + 6), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    return canvas;
  }

  private createPaintedWallTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const base = ctx.createLinearGradient(0, 0, 0, 512);
    base.addColorStop(0, "#876948");
    base.addColorStop(0.2, "#5c4936");
    base.addColorStop(0.58, "#332b25");
    base.addColorStop(1, "#141211");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalAlpha = 0.34;
    const topGlow = ctx.createRadialGradient(276, 92, 28, 276, 92, 330);
    topGlow.addColorStop(0, "#d19a61");
    topGlow.addColorStop(0.48, "#6f4526");
    topGlow.addColorStop(1, "#19120d");
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalAlpha = 0.82;
    for (let row = 0; row < 13; row += 1) {
      const y = row * 40 + (detailNoise(row * 31) - 0.5) * 6;
      const rowOffset = row % 2 === 0 ? -12 : 34;
      for (let col = -1; col < 9; col += 1) {
        const seed = row * 83 + col * 47;
        const x = col * 70 + rowOffset + (detailNoise(seed + 1) - 0.5) * 7;
        const w = 58 + detailNoise(seed + 2) * 34;
        const h = 30 + detailNoise(seed + 3) * 13;
        const warm = detailNoise(seed + 4);
        const cold = detailNoise(seed + 9) > 0.78;
        const shade = Math.round(34 + detailNoise(seed + 5) * 46);
        const red = shade + Math.round(warm * 26) - (cold ? 8 : 0);
        const green = shade + Math.round(warm * 15) + (cold ? 12 : 0);
        const blue = Math.round(shade * (0.78 + warm * 0.05)) + (cold ? 18 : 0);
        ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        ctx.fillRect(x, y, w, h);

        if (detailNoise(seed + 11) > 0.48) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = cold ? "#82cbd1" : "#d79652";
          ctx.fillRect(x + 4, y + 4, Math.max(12, w * (0.2 + detailNoise(seed + 13) * 0.24)), 2);
          ctx.globalAlpha = 0.82;
        }
        if (detailNoise(seed + 17) > 0.68) {
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = "#050403";
          ctx.fillRect(x + w * (0.28 + detailNoise(seed + 19) * 0.38), y + 6, 2, Math.max(10, h - 10));
          ctx.globalAlpha = 0.82;
        }
      }
    }

    ctx.globalAlpha = 0.88;
    ctx.strokeStyle = "#100b08";
    ctx.lineWidth = 2.8;
    for (let y = 38; y < 512; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y + (detailNoise(y) - 0.5) * 5);
      ctx.lineTo(512, y + (detailNoise(y + 11) - 0.5) * 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#c6874d";
    ctx.lineWidth = 1.2;
    for (let y = 40; y < 506; y += 80) {
      ctx.beginPath();
      ctx.moveTo(18, y + 3);
      ctx.lineTo(490, y - 1);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.64;
    for (let i = 0; i < 104; i += 1) {
      const seed = i * 101;
      const x = detailNoise(seed + 1) * 512;
      const y = detailNoise(seed + 2) * 512;
      const len = 18 + detailNoise(seed + 3) * 70;
      ctx.strokeStyle =
        detailNoise(seed + 4) > 0.74
          ? "rgba(218, 139, 70, 0.52)"
          : detailNoise(seed + 6) > 0.82
            ? "rgba(91, 171, 184, 0.34)"
            : "rgba(9, 7, 5, 0.86)";
      ctx.lineWidth = 0.7 + detailNoise(seed + 5) * 2.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (detailNoise(seed + 6) - 0.5) * len, y + len);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.2;
    const ember = ctx.createRadialGradient(344, 250, 20, 344, 250, 238);
    ember.addColorStop(0, "#dda260");
    ember.addColorStop(0.42, "#6f3c22");
    ember.addColorStop(1, "rgba(20, 14, 12, 0)");
    ctx.fillStyle = ember;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalAlpha = 0.34;
    const coldPocket = ctx.createRadialGradient(88, 390, 18, 88, 390, 190);
    coldPocket.addColorStop(0, "#5aaeb8");
    coldPocket.addColorStop(0.42, "#18373d");
    coldPocket.addColorStop(1, "rgba(3, 6, 7, 0)");
    ctx.fillStyle = coldPocket;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalAlpha = 0.38;
    const baseShadow = ctx.createLinearGradient(0, 330, 0, 512);
    baseShadow.addColorStop(0, "rgba(0, 0, 0, 0)");
    baseShadow.addColorStop(1, "rgba(0, 0, 0, 0.72)");
    ctx.fillStyle = baseShadow;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalAlpha = 1;
    return canvas;
  }

  private createPaintedCapTexture(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const base = ctx.createLinearGradient(0, 0, 512, 512);
    base.addColorStop(0, "#6f563d");
    base.addColorStop(0.46, "#3c3024");
    base.addColorStop(1, "#15120f");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 512);
    ctx.globalAlpha = 0.62;
    for (let i = 0; i < 92; i += 1) {
      const seed = i * 67;
      const x = detailNoise(seed + 1) * 512;
      const y = detailNoise(seed + 2) * 512;
      const w = 34 + detailNoise(seed + 3) * 86;
      const h = 12 + detailNoise(seed + 4) * 32;
      ctx.fillStyle =
        detailNoise(seed + 5) > 0.7
          ? "#9f7144"
          : detailNoise(seed + 7) > 0.82
            ? "#31535a"
            : "#211a14";
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = "#0b0806";
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 48; i += 1) {
      const seed = i * 131;
      ctx.beginPath();
      ctx.moveTo(detailNoise(seed + 1) * 512, detailNoise(seed + 2) * 512);
      ctx.lineTo(detailNoise(seed + 3) * 512, detailNoise(seed + 4) * 512);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#d09558";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 24; i += 1) {
      const seed = 1307 + i * 73;
      const y = 18 + detailNoise(seed + 1) * 476;
      ctx.beginPath();
      ctx.moveTo(24 + detailNoise(seed + 3) * 120, y);
      ctx.lineTo(300 + detailNoise(seed + 5) * 180, y + (detailNoise(seed + 7) - 0.5) * 18);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.32;
    const edgeShadow = ctx.createLinearGradient(0, 0, 0, 512);
    edgeShadow.addColorStop(0, "rgba(245, 165, 90, 0.2)");
    edgeShadow.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    edgeShadow.addColorStop(1, "rgba(0, 0, 0, 0.55)");
    ctx.fillStyle = edgeShadow;
    ctx.fillRect(0, 0, 512, 512);
    ctx.globalAlpha = 1;
    return canvas;
  }

  private pickMonster(clientX: number, clientY: number, state: GameState): InputHit {
    const rect = this.canvas.getBoundingClientRect();
    let best: { id: string; distance: number } | null = null;
    for (const monster of state.monsters) {
      if (monster.hp <= 0) continue;
      const pos = this.toWorld(monster);
      const screen = new THREE.Vector3(pos.x, 1.05, pos.z).project(this.camera);
      const px = rect.left + ((screen.x + 1) / 2) * rect.width;
      const py = rect.top + ((-screen.y + 1) / 2) * rect.height;
      const hitDistance = Math.hypot(px - clientX, py - clientY);
      if (hitDistance < 54 && (!best || hitDistance < best.distance))
        best = { id: monster.id, distance: hitDistance };
    }
    return best ? { type: "monster", id: best.id } : null;
  }

  private pickDoor(clientX: number, clientY: number, state: GameState): InputHit {
    const rect = this.canvas.getBoundingClientRect();
    let best: { point: Point; distance: number } | null = null;
    for (const door of floorOneSceneDoors(state)) {
      if (door.open) continue;
      const screen = new THREE.Vector3(door.spec.x, 1.05, door.spec.y).project(this.camera);
      const px = rect.left + ((screen.x + 1) / 2) * rect.width;
      const py = rect.top + ((-screen.y + 1) / 2) * rect.height;
      const hitDistance = Math.hypot(px - clientX, py - clientY);
      if (hitDistance < 72 && (!best || hitDistance < best.distance))
        best = { point: door.tile, distance: hitDistance };
    }
    return best ? { type: "world", x: best.point.x, y: best.point.y } : null;
  }

  private texture(frameName: string): THREE.Texture | null {
    const cached = this.textureCache.get(frameName);
    if (cached) return cached;
    const frame = this.atlas?.manifest.frames[frameName];
    if (frame && this.atlas) {
      const source = this.atlas.images.get(String(frame.atlas));
      if (!source) return null;
      const canvas = this.frameCanvas(frameName);
      if (!canvas) return null;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      if (isActorSpriteFrame(frameName)) {
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 1;
      } else {
        texture.anisotropy = 4;
      }
      texture.needsUpdate = true;
      this.textureCache.set(frameName, texture);
      return texture;
    }
    const actorFrame = parseActorSpriteFrameId(frameName);
    if (actorFrame) return this.actorTexture(actorFrame);
    return null;
  }

  private frameCanvas(frameName: string): HTMLCanvasElement | null {
    const frame = this.atlas?.manifest.frames[frameName];
    if (!frame || !this.atlas) return null;
    const source = this.atlas.images.get(String(frame.atlas));
    if (!source) return null;
    const canvas = document.createElement("canvas");
    canvas.width = frame.w;
    canvas.height = frame.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
    if (isActorBaseFrame(frameName)) this.cleanActorSpriteTexture(frameName, canvas, ctx);
    return canvas;
  }

  private actorTexture(actorFrame: ActorSpriteFrame): THREE.Texture | null {
    const sourceCanvas = this.frameCanvas(actorFrame.baseFrame);
    if (!sourceCanvas) return null;
    const canvas = document.createElement("canvas");
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const profile = DIRECTION_PROFILES[actorFrame.direction];
    const action = this.actorFrameTransform(actorFrame);
    const directionSign = profile.mirror ? -1 : 1;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 + profile.yOffset + action.yOffset);
    ctx.transform(
      (profile.mirror ? -1 : 1) * profile.scaleX * action.scaleX,
      0,
      profile.shear + action.shear * directionSign,
      action.scaleY,
      action.xOffset * directionSign,
      0
    );
    ctx.drawImage(
      sourceCanvas,
      -sourceCanvas.width / 2,
      -sourceCanvas.height / 2,
      sourceCanvas.width,
      sourceCanvas.height
    );
    ctx.restore();
    this.tintActorFrame(
      ctx,
      canvas,
      profile.shade * action.shade,
      profile.warm + action.warm,
      action.hitGlow
    );
    this.paintActorActionOverlays(ctx, canvas, actorFrame, directionSign);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 1;
    texture.needsUpdate = true;
    this.textureCache.set(actorFrame.frameId, texture);
    return texture;
  }

  private actorFrameTransform(actorFrame: ActorSpriteFrame): ActorFrameTransform {
    const frame = actorFrame.frameIndex;
    if (actorFrame.animation === "run") {
      const step = frame % 2 === 0 ? -1 : 1;
      return {
        xOffset: step * 1.8,
        yOffset: frame === 1 || frame === 2 ? -2.2 : 1.2,
        scaleX: frame % 2 === 0 ? 0.96 : 1.04,
        scaleY: frame % 2 === 0 ? 1.04 : 0.96,
        shear: step * 0.028,
        shade: 1.02,
        warm: 0,
        hitGlow: 0
      };
    }
    if (actorFrame.animation === "attack") {
      const thrust = frame === 1 ? 5.4 : frame === 2 ? 2.2 : 0;
      return {
        xOffset: thrust,
        yOffset: frame === 1 ? -1.2 : 0,
        scaleX: frame === 1 ? 1.08 : 1.02,
        scaleY: frame === 1 ? 0.94 : 1,
        shear: frame === 1 ? 0.06 : 0.02,
        shade: 1.08,
        warm: 0.08,
        hitGlow: 0
      };
    }
    if (actorFrame.animation === "hit") {
      return {
        xOffset: frame === 0 ? -3.4 : -1.4,
        yOffset: frame === 0 ? 1.4 : 0.4,
        scaleX: frame === 0 ? 1.05 : 1,
        scaleY: frame === 0 ? 0.95 : 1,
        shear: frame === 0 ? -0.055 : -0.02,
        shade: 1.1,
        warm: 0.12,
        hitGlow: frame === 0 ? 0.22 : 0.12
      };
    }
    if (actorFrame.animation === "death") {
      return {
        xOffset: frame * -3,
        yOffset: 8 + frame * 4,
        scaleX: 1.08 + frame * 0.05,
        scaleY: 0.78 - frame * 0.09,
        shear: -0.08 - frame * 0.04,
        shade: 0.72 - frame * 0.08,
        warm: -0.04,
        hitGlow: 0
      };
    }
    return {
      xOffset: frame === 0 ? 0 : 0.8,
      yOffset: frame === 0 ? 0 : -1,
      scaleX: frame === 0 ? 1 : 1.015,
      scaleY: frame === 0 ? 1 : 0.988,
      shear: 0,
      shade: 1,
      warm: 0,
      hitGlow: 0
    };
  }

  private tintActorFrame(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    shade: number,
    warm: number,
    hitGlow: number
  ): void {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = Math.max(1, canvas.width - 1);
    const height = Math.max(1, canvas.height - 1);
    for (let offset = 0; offset < data.length; offset += 4) {
      const alpha = data[offset + 3]!;
      if (alpha <= 0) continue;
      const pixel = offset / 4;
      const x = (pixel % canvas.width) / width;
      const y = Math.floor(pixel / canvas.width) / height;
      const side = x - 0.5;
      const vertical = 1 - y;
      const warmRim = clamp((side - 0.05) * 3.1, 0, 1) * clamp((y - 0.12) * 1.55, 0, 1);
      const coolRim = clamp((-side - 0.1) * 2.8, 0, 1) * clamp((1 - y) * 1.25, 0, 1);
      const footShade = clamp((y - 0.68) * 2.7, 0, 1);
      const crownLight = clamp((vertical - 0.32) * 1.4, 0, 1) * 0.08;
      const red = data[offset]!;
      const green = data[offset + 1]!;
      const blue = data[offset + 2]!;
      const groundedShade = 1 - footShade * 0.24;
      data[offset] = clamp(
        red * shade * groundedShade + warm * 26 + warmRim * 46 + crownLight * 36 + hitGlow * 255,
        0,
        255
      );
      data[offset + 1] = clamp(
        green * shade * groundedShade + warm * 12 + warmRim * 24 + coolRim * 20 + crownLight * 26 + hitGlow * 208,
        0,
        255
      );
      data[offset + 2] = clamp(
        blue * shade * groundedShade - warm * 10 + coolRim * 34 + crownLight * 16 + hitGlow * 150,
        0,
        255
      );
      if (alpha > 40) data[offset + 3] = Math.max(alpha, Math.round(170 + Math.min(alpha, 255) * 0.28));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  private paintActorActionOverlays(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    actorFrame: ActorSpriteFrame,
    directionSign: number
  ): void {
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width * 0.5;
    const baseY = height * 0.83;
    const topY = height * 0.18;
    const sideX = centerX + directionSign * width * 0.18;

    ctx.save();
    if (actorFrame.baseFrame === "sprite-player") {
      ctx.globalCompositeOperation = "destination-over";
      ctx.globalAlpha = actorFrame.animation === "attack" ? 0.68 : 0.42;
      const torchGlow = ctx.createRadialGradient(sideX + directionSign * 8, topY + 16, 4, sideX, topY + 18, 54);
      torchGlow.addColorStop(0, "rgba(255, 180, 70, 0.9)");
      torchGlow.addColorStop(0.32, "rgba(220, 88, 25, 0.42)");
      torchGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = torchGlow;
      ctx.fillRect(0, 0, width, height);
    }

    if (actorFrame.baseFrame === "sprite-ash-chanter" && actorFrame.animation === "attack") {
      ctx.globalCompositeOperation = "destination-over";
      ctx.globalAlpha = actorFrame.frameIndex === 1 ? 0.7 : 0.42;
      const chanterGlow = ctx.createRadialGradient(centerX, topY + 18, 2, centerX, topY + 24, 52);
      chanterGlow.addColorStop(0, "rgba(123, 225, 242, 0.72)");
      chanterGlow.addColorStop(0.45, "rgba(32, 114, 132, 0.36)");
      chanterGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = chanterGlow;
      ctx.fillRect(0, 0, width, height);
    }

    if (actorFrame.animation === "run") {
      ctx.globalCompositeOperation = "destination-over";
      ctx.globalAlpha = 0.2 + (actorFrame.frameIndex % 2) * 0.08;
      ctx.fillStyle = actorFrame.baseFrame === "sprite-fiend" ? "rgba(210, 74, 38, 0.42)" : "rgba(197, 139, 82, 0.36)";
      ctx.beginPath();
      ctx.ellipse(
        centerX - directionSign * (14 + actorFrame.frameIndex * 1.7),
        baseY + 6,
        width * 0.18,
        height * 0.032,
        directionSign * -0.18,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    if (actorFrame.animation === "attack") {
      const progress = actorFrame.frameIndex / Math.max(1, ACTOR_ANIMATION_FRAME_COUNTS.attack - 1);
      ctx.globalAlpha = actorFrame.frameIndex === 1 ? 0.78 : 0.42;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const startX = centerX + directionSign * width * (0.05 + progress * 0.05);
      const slashX = centerX + directionSign * width * (0.28 + progress * 0.04);
      const slashTop = height * (0.32 - progress * 0.02);
      const slashBottom = height * (0.62 + progress * 0.03);
      ctx.strokeStyle =
        actorFrame.baseFrame === "sprite-ash-chanter"
          ? "rgba(135, 230, 245, 0.76)"
          : actorFrame.baseFrame === "sprite-bone-warden"
            ? "rgba(232, 216, 174, 0.66)"
            : "rgba(255, 177, 73, 0.8)";
      ctx.lineWidth = actorFrame.frameIndex === 1 ? 4.6 : 2.6;
      ctx.beginPath();
      ctx.moveTo(startX, slashBottom);
      ctx.quadraticCurveTo(slashX + directionSign * 12, height * 0.46, slashX, slashTop);
      ctx.stroke();

      ctx.globalAlpha *= 0.46;
      ctx.lineWidth = 9;
      ctx.strokeStyle =
        actorFrame.baseFrame === "sprite-ash-chanter" ? "rgba(53, 171, 196, 0.32)" : "rgba(199, 77, 28, 0.28)";
      ctx.beginPath();
      ctx.moveTo(startX - directionSign * 3, slashBottom + 2);
      ctx.quadraticCurveTo(slashX + directionSign * 12, height * 0.48, slashX + directionSign * 3, slashTop - 2);
      ctx.stroke();
    }

    if (actorFrame.animation === "hit") {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = actorFrame.frameIndex === 0 ? 0.28 : 0.16;
      ctx.fillStyle = "rgba(255, 222, 178, 1)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = actorFrame.frameIndex === 0 ? 0.44 : 0.24;
      ctx.strokeStyle = "rgba(255, 94, 58, 0.72)";
      ctx.lineWidth = 2;
      for (let index = 0; index < 4; index += 1) {
        const seed = actorFrame.baseFrame.length * 97 + actorFrame.frameIndex * 31 + index * 53;
        const y = height * (0.28 + detailNoise(seed + 1) * 0.38);
        const x = centerX + directionSign * width * (0.1 + detailNoise(seed + 3) * 0.24);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + directionSign * (10 + detailNoise(seed + 5) * 18), y - 5 + detailNoise(seed + 7) * 10);
        ctx.stroke();
      }
    }

    if (actorFrame.animation === "death") {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = 0.14 + actorFrame.frameIndex * 0.12;
      ctx.fillStyle = "rgba(8, 6, 5, 1)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.26 + actorFrame.frameIndex * 0.09;
      ctx.fillStyle = "rgba(34, 19, 12, 0.8)";
      ctx.beginPath();
      ctx.ellipse(centerX, baseY + 8, width * 0.28, height * 0.055, -0.08, 0, Math.PI * 2);
      ctx.fill();
      for (let index = 0; index < 8; index += 1) {
        const seed = actorFrame.baseFrame.length * 131 + actorFrame.frameIndex * 79 + index * 37;
        ctx.fillStyle =
          detailNoise(seed + 1) > 0.55 ? "rgba(200, 88, 32, 0.48)" : "rgba(74, 102, 105, 0.32)";
        ctx.beginPath();
        ctx.arc(
          centerX + (detailNoise(seed + 3) - 0.5) * width * 0.5,
          height * (0.25 + detailNoise(seed + 5) * 0.48),
          1 + detailNoise(seed + 7) * 2.2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private cleanActorSpriteTexture(
    frameName: string,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
  ): void {
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const visited = new Uint8Array(width * height);
    const queue = new Uint32Array(width * height);
    let head = 0;
    let tail = 0;
    const push = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const pixel = y * width + x;
      if (visited[pixel]) return;
      if (!this.isLightMattePixel(data, pixel * 4)) return;
      visited[pixel] = 1;
      queue[tail] = pixel;
      tail += 1;
    };

    for (let x = 0; x < width; x += 1) {
      push(x, 0);
      push(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      push(0, y);
      push(width - 1, y);
    }
    while (head < tail) {
      const pixel = queue[head]!;
      head += 1;
      data[pixel * 4 + 3] = 0;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    const fadeStart = ACTOR_BASE_FADE_START[frameName] ?? 0.76;
    const paleBaseStart = Math.max(0.54, fadeStart - 0.18);
    for (let y = Math.floor(height * paleBaseStart); y < height; y += 1) {
      const yNorm = y / Math.max(1, height - 1);
      const baseY = (yNorm - paleBaseStart) / Math.max(0.001, 1 - paleBaseStart);
      const fade = clamp((yNorm - fadeStart) / Math.max(0.001, 1 - fadeStart), 0, 1);
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3]!;
        if (alpha <= 0) continue;
        const baseX = x / Math.max(1, width - 1) - 0.5;
        const inPaintedBase = (baseX / 0.48) ** 2 + ((baseY - 0.46) / 0.5) ** 2 < 1.05;
        if (inPaintedBase && this.isPaleBasePixel(data, offset)) {
          data[offset + 3] = 0;
          continue;
        }
        if (alpha < 246 && this.isDarkBasePixel(data, offset))
          data[offset + 3] = Math.round(alpha * (1 - fade * 0.92));
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private isLightMattePixel(data: Uint8ClampedArray, offset: number): boolean {
    const alpha = data[offset + 3]!;
    if (alpha <= 0) return false;
    const red = data[offset]!;
    const green = data[offset + 1]!;
    const blue = data[offset + 2]!;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    return red > 168 && green > 168 && blue > 154 && (max - min < 58 || red + green + blue > 705);
  }

  private isPaleBasePixel(data: Uint8ClampedArray, offset: number): boolean {
    const red = data[offset]!;
    const green = data[offset + 1]!;
    const blue = data[offset + 2]!;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    return red + green + blue > 360 && max - min < 60;
  }

  private isDarkBasePixel(data: Uint8ClampedArray, offset: number): boolean {
    const red = data[offset]!;
    const green = data[offset + 1]!;
    const blue = data[offset + 2]!;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    return red + green + blue < 130 && max - min < 36;
  }

  private textTexture(text: string, color: string, size: number): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `800 ${size}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#160b04";
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private removeSpriteRecord(key: string): void {
    const record = this.spriteRecords.get(key);
    if (!record) return;
    this.dynamicWorld.remove(record.sprite);
    if (record.shadow) this.dynamicWorld.remove(record.shadow);
    this.spriteRecords.delete(key);
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
    }
  }

  private toWorld(point: Point): THREE.Vector3 {
    return new THREE.Vector3(point.x - this.origin.x, 0, point.y - this.origin.y);
  }

  private fromWorld(world: THREE.Vector3): Point {
    return { x: world.x + this.origin.x, y: world.z + this.origin.y };
  }
}
