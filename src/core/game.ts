import { createSkillBuff, createTimedBuff } from "./buffs";
import { createPlayer } from "./classes";
import { blocksMove, generateDungeon, getTile, idx, randomFloorAway, setTile } from "./dungeon";
import { applyElite } from "./elites";
import { computeFov, decayFogMemory, hasLineOfSight } from "./fov";
import { gearScore, itemStatModifiers, makeItem, resetItemIds } from "./items";
import { deserializeSave, SAVE_VERSION, stateFromSave, type SaveGame } from "./persistence";
import { cloneReplayActions, createReplay, recordAction, shouldRecordAction } from "./replay";
import { RNG } from "./rng";
import { makeShrine } from "./shrines";
import { floorOneScene } from "../scene/floor-one";
import {
  findFloorOnePath,
  floorOneSceneDoors,
  isFloorOneScene,
  isFloorOneWalkable,
  nearestFloorOneDoor,
  nearestFloorOneWalkablePoint,
  sceneToGamePoint
} from "../scene/navigation";
import {
  DIRECTIONS,
  Tile,
  type ActorAnimation,
  type DebugState,
  type EffectEvent,
  type GameAction,
  type GameState,
  type GearItem,
  type Item,
  type MonsterDefinition,
  type MonsterKind,
  type MonsterState,
  type Point,
  type ShrineState,
  type Slot,
  type SkillChoice,
  type StatBlock,
  type TimedBuff
} from "./types";

const DEFAULT_SEED = 522551;
const SCENE_ID = floorOneScene.id;
const PLAYER_SPEED = 4.15;
const PLAYER_ATTACK_RANGE = 1.28;
const PLAYER_ATTACK_COOLDOWN_MS = 620;
const PLAYER_ABILITY_COOLDOWN_MS = 4200;
const MONSTER_MELEE_RANGE = 1.05;
const FOV_REFRESH_MS = 140;
const MONSTER_PATH_RECALC_MS = 360;
const REPLAY_STEP_MS = 50;
const OPENING_WAKE_MELEE_COOLDOWN_MS = 1800;
const OPENING_WAKE_CASTER_COOLDOWN_MS = 2400;

type PathingEntity = Point & {
  moveTarget?: Point | null;
  movePath?: Point[];
  facing?: number;
  animation?: ActorAnimation;
  animationLockMs?: number;
};

const MONSTER_DEFS: Record<MonsterKind, MonsterDefinition> = {
  "gutter-fiend": {
    id: "gutter-fiend",
    name: "Gutter Fiend",
    hp: 9,
    attack: 3,
    defense: 0,
    xp: 9,
    color: "#9aa16c",
    speed: 1,
    torchFear: 0.06,
    role: "melee"
  },
  "bone-warden": {
    id: "bone-warden",
    name: "Bone Warden",
    hp: 16,
    attack: 5,
    defense: 1,
    xp: 17,
    color: "#d8cfb6",
    speed: 0.9,
    torchFear: 0,
    role: "melee"
  },
  "ash-chanter": {
    id: "ash-chanter",
    name: "Ash Chanter",
    hp: 18,
    attack: 6,
    defense: 1,
    xp: 24,
    color: "#b34e49",
    speed: 1,
    torchFear: -0.05,
    role: "caster"
  }
};

const SKILL_OPTIONS: SkillChoice[] = [
  {
    tree: "Flame",
    name: "Flame: Wider Torch",
    desc: "Torch radius grows, weak fiends hesitate, and the next floor starts kindled."
  },
  {
    tree: "Steel",
    name: "Steel: Harder Strikes",
    desc: "Gain attack and better consistency against armored foes."
  },
  {
    tree: "Shadow",
    name: "Shadow: Lucky Hands",
    desc: "Gain critical chance and a better chance for monster drops."
  },
  {
    tree: "Survival",
    name: "Survival: Stay Standing",
    desc: "Gain defense, maximum HP, and extra pack space."
  }
];

function createDebugState(): DebugState {
  return {
    enabled: false,
    showCollision: false,
    showLos: false,
    showFogMemory: false,
    showRoomGraph: false,
    showMonsterTargets: false,
    showReplayLog: false,
    missingAssets: [],
    missingAudio: [],
    fps: 0,
    avgFps: 0,
    frameMs: 0,
    p95FrameMs: 0,
    slowFrames: 0,
    sampleFrames: 0,
    updateMs: 0,
    renderMs: 0,
    drawCalls: 0,
    triangles: 0,
    objects: 0,
    animatedSprites: 0,
    particles: 0,
    lastCommand: "spawn"
  };
}

function addToStatBlock(target: StatBlock, partial: Partial<StatBlock>): void {
  for (const key of Object.keys(partial) as (keyof StatBlock)[]) {
    target[key] += partial[key] ?? 0;
  }
}

function manhattan(a: Point, b: Point): number {
  return Math.abs(Math.round(a.x) - Math.round(b.x)) + Math.abs(Math.round(a.y) - Math.round(b.y));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tilePoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function angleTo(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function itemWithoutPosition(item: Item): Item {
  const copy = structuredClone(item) as Item;
  delete copy.x;
  delete copy.y;
  return copy;
}

export function calculatePlayerStats(state: GameState): StatBlock {
  const player = state.player;
  const stats: StatBlock = { ...player.base };

  addToStatBlock(stats, {
    attack: player.skills.Steel * 2,
    defense: player.skills.Survival,
    crit: player.skills.Shadow * 0.035,
    maxHp: player.skills.Survival * 6,
    torchRadius: player.skills.Flame * 1.25,
    xpGain: player.skills.Shadow * 0.03,
    memoryRetention: player.skills.Flame * 0.03
  });

  for (const item of Object.values(player.equipment)) addToStatBlock(stats, itemStatModifiers(item));
  for (const buff of state.activeBuffs) addToStatBlock(stats, buff.modifiers);

  stats.crit = Math.min(0.6, stats.crit);
  stats.maxHp = Math.max(1, Math.round(stats.maxHp));
  return stats;
}

export class TorchlineGame {
  state: GameState;

  constructor(seed = DEFAULT_SEED) {
    resetItemIds();
    this.state = this.createState(seed >>> 0);
    this.newFloor(true);
  }

  loadSavePayload(payload: unknown): void {
    const save = deserializeSave(payload);
    this.loadSave(save);
  }

  tryLoadSavePayload(payload: unknown): boolean {
    try {
      this.loadSavePayload(payload);
      this.state.error = undefined;
      return true;
    } catch (error) {
      const message = `Load failed: ${error instanceof Error ? error.message : String(error)}`;
      this.state.error = message;
      this.state.debug.lastCommand = "load-error";
      this.pushMessage(message);
      return false;
    }
  }

  loadSave(save: SaveGame): void {
    this.state = stateFromSave(save, this.createState(save.seed));
    this.state.player = this.preparePlayer(this.state.player);
    this.pushMessage("Loaded the saved torchline.", "load-confirm", "load");
    const playerTile = tilePoint(this.state.player);
    computeFov(this.state.dungeon, playerTile.x, playerTile.y, calculatePlayerStats(this.state).torchRadius);
  }

  dispatch(action: GameAction, record = true): void {
    if (action.type === "toggleDebug") {
      this.state.debug.enabled = !this.state.debug.enabled;
      return;
    }
    if (action.type === "toggleDebugFlag") {
      this.state.debug[action.flag] = !this.state.debug[action.flag];
      return;
    }
    if (action.type === "restart") {
      this.restart(action.seed);
      return;
    }
    if (this.state.mode === "dead") return;
    if (action.type === "pause") {
      if (this.state.mode === "paused") {
        this.state.mode = "playing";
        this.pushMessage("Resumed.");
        return;
      }
      if (this.state.mode === "playing") {
        this.state.mode = "paused";
        this.pushMessage("Paused.", "pause-open", "audio");
      }
      return;
    }
    if (action.type === "resume") {
      if (this.state.mode === "paused") {
        this.state.mode = "playing";
        this.pushMessage("Resumed.");
      }
      return;
    }
    if (this.state.mode === "paused") return;

    if (record && shouldRecordAction(action))
      recordAction(this.state.replay, this.state.turn, this.state.elapsedMs, action);

    if (this.state.mode === "skill-choice") {
      if (action.type === "chooseSkill") this.chooseSkill(action.index);
      return;
    }

    switch (action.type) {
      case "moveTo":
        this.commandMoveTo(action.x, action.y);
        break;
      case "targetActor":
        this.commandTargetActor(action.id);
        break;
      case "basicAttack":
        this.commandBasicAttack();
        break;
      case "useAbility":
        this.commandUseAbility();
        break;
      case "interactAt":
        this.commandInteractAt(action.x, action.y);
        break;
      case "move":
        this.tryMove(action.dx, action.dy);
        break;
      case "wait":
        this.waitTurn();
        break;
      case "useStairs":
        this.useStairs();
        break;
      case "drinkPotion":
        this.drinkPotion();
        break;
      case "useInventoryItem":
        this.useInventoryItem(action.index);
        break;
      case "activateShrine":
        this.activateShrine();
        break;
    }
  }

  tickFrame(dtMs = 16.67): void {
    if (this.state.mode !== "playing") return;
    const started = performance.now();
    const dt = Math.min(0.05, Math.max(0, dtMs / 1000));
    this.state.elapsedMs += dtMs;
    if (this.state.replay.status === "recording") this.state.replay.elapsedMs = this.state.elapsedMs;
    this.updateRealtimeCooldowns(dtMs);
    this.updatePlayerRealtime(dt);
    this.updateMonstersRealtime(dt);
    this.pickupNearby();
    this.autoOpenAdjacent(true);
    this.tickBuffsRealtime(dt);
    if (
      Math.floor((this.state.elapsedMs - dtMs) / FOV_REFRESH_MS) !==
      Math.floor(this.state.elapsedMs / FOV_REFRESH_MS)
    ) {
      const playerTile = tilePoint(this.state.player);
      decayFogMemory(this.state.dungeon, calculatePlayerStats(this.state).memoryRetention * 0.16);
      computeFov(
        this.state.dungeon,
        playerTile.x,
        playerTile.y,
        calculatePlayerStats(this.state).torchRadius
      );
    }
    if (this.state.player.hp <= 0) this.die();
    this.state.debug.updateMs = Math.round((performance.now() - started) * 10) / 10;
  }

  drainEffects(): EffectEvent[] {
    const events = this.state.effects;
    this.state.effects = [];
    return events;
  }

  replayFromStart(): void {
    const replayActions = cloneReplayActions(this.state.replay);
    const seed = this.state.replay.seed;
    const targetElapsedMs = this.state.replay.elapsedMs;
    this.restart(seed);
    this.state.replay.status = "playing";
    this.state.replay.actions = replayActions;
    let cursorMs = 0;
    for (const entry of replayActions) {
      cursorMs = this.advanceReplayClock(cursorMs, Math.max(cursorMs, entry.elapsedMs));
      this.dispatch(entry.action, false);
    }
    this.advanceReplayClock(cursorMs, Math.max(cursorMs, targetElapsedMs));
    this.state.replay.actions = replayActions;
    this.state.replay.elapsedMs = this.state.elapsedMs;
    this.state.replay.status = "recording";
    this.pushMessage(`Replayed ${replayActions.length} actions.`);
  }

  private advanceReplayClock(fromMs: number, toMs: number): number {
    let cursorMs = fromMs;
    while (cursorMs + 0.001 < toMs && this.state.mode === "playing") {
      const dtMs = Math.min(REPLAY_STEP_MS, toMs - cursorMs);
      this.tickFrame(dtMs);
      cursorMs += dtMs;
    }
    return cursorMs;
  }

  markMissingAsset(path: string): void {
    if (!this.state.debug.missingAssets.includes(path)) this.state.debug.missingAssets.push(path);
  }

  markMissingAudio(path: string): void {
    if (!this.state.debug.missingAudio.includes(path)) this.state.debug.missingAudio.push(path);
  }

  notify(text: string, audio?: EffectEvent["audio"], type: EffectEvent["type"] = "message"): void {
    this.pushMessage(text, audio, type);
  }

  forcePlayerDeathForDebug(): void {
    this.die();
  }

  private createState(seed: number): GameState {
    return {
      saveVersion: SAVE_VERSION,
      mode: "playing",
      seed,
      rngSeed: (seed ^ 0xa53f19) >>> 0,
      sceneId: SCENE_ID,
      floor: 1,
      turn: 0,
      elapsedMs: 0,
      kills: 0,
      player: this.preparePlayer(createPlayer()),
      dungeon: generateDungeon(1, seed),
      monsters: [],
      items: [],
      shrines: [],
      activeBuffs: [],
      pendingSkills: null,
      messages: [],
      effects: [],
      replay: createReplay(seed),
      debug: createDebugState()
    };
  }

  private preparePlayer(player: GameState["player"]): GameState["player"] {
    player.moveTarget = player.moveTarget ?? null;
    player.movePath = player.movePath ?? [];
    player.targetActorId = player.targetActorId ?? null;
    player.facing = player.facing ?? -Math.PI / 4;
    player.animation = player.animation ?? "idle";
    player.animationLockMs = player.animationLockMs ?? 0;
    player.attackCooldownMs = player.attackCooldownMs ?? 0;
    player.abilityCooldownMs = player.abilityCooldownMs ?? 0;
    player.footstepCooldownMs = player.footstepCooldownMs ?? 0;
    return player;
  }

  private newFloor(first: boolean): void {
    const state = this.state;
    state.mode = "playing";
    state.dungeon = generateDungeon(state.floor, state.seed);
    if (state.floor === 1) this.shapeOpeningShowcaseChamber();
    state.player.x = state.dungeon.spawn.x;
    state.player.y = state.dungeon.spawn.y;
    state.player.moveTarget = null;
    state.player.movePath = [];
    state.player.targetActorId = null;
    state.player.animation = "idle";
    state.player.animationLockMs = 0;
    this.preparePlayer(state.player);
    state.monsters = [];
    state.items = [];
    state.shrines = [];

    const rng = new RNG((state.seed + state.floor * 10007 + 731) >>> 0);
    const monsterCount = state.floor === 1 ? 0 : 13 + state.floor * 3;
    const monsterKinds = Object.keys(MONSTER_DEFS) as MonsterKind[];

    for (let i = 0; i < monsterCount; i += 1) {
      const pos = randomFloorAway(state.dungeon, rng, state.player, 8);
      if (this.monsterAt(pos.x, pos.y)) continue;
      const kind = rng.pick(monsterKinds);
      state.monsters.push(this.makeMonster(kind, pos, state.floor, rng));
    }

    if (state.monsters.length) {
      const eliteIndex = rng.int(0, Math.max(0, state.monsters.length - 1));
      state.monsters[eliteIndex] = applyElite(rng, state.monsters[eliteIndex]!);
      this.pushEffect({
        type: "audio",
        audio: "elite-alert",
        x: state.monsters[eliteIndex]!.x,
        y: state.monsters[eliteIndex]!.y
      });
    }

    const itemCount = state.floor === 1 ? 0 : 7 + Math.floor(state.floor * 1.7);
    for (let i = 0; i < itemCount; i += 1) {
      const pos = randomFloorAway(state.dungeon, rng, state.player, 5);
      if (this.itemAt(pos.x, pos.y)) continue;
      state.items.push({ ...makeItem(rng, state.floor), x: pos.x, y: pos.y });
    }
    if (state.floor !== 1) {
      const starter = makeItem(rng, state.floor, "weapon");
      state.items.push({ ...starter, x: state.dungeon.rooms[0]!.x + 1, y: state.dungeon.rooms[0]!.y + 1 });
    }

    if (state.floor === 1) {
      this.seedOpeningLoadout(rng);
      this.stageOpeningEncounter(rng);
    }

    if (state.floor === 1) {
      const shrinePoint = sceneToGamePoint(state, {
        x: floorOneScene.shrineHint.dx,
        y: floorOneScene.shrineHint.dy
      });
      const shrineTile = { x: Math.round(shrinePoint.x), y: Math.round(shrinePoint.y) };
      setTile(state.dungeon, shrineTile.x, shrineTile.y, Tile.ShrineFloor);
      state.shrines.push(
        makeShrine(rng, state.floor, shrineTile.x, shrineTile.y, floorOneScene.shrineHint.kind)
      );
    } else {
      const shrineCount = rng.chance(0.75) ? 1 : 0;
      for (let i = 0; i < shrineCount; i += 1) {
        const pos = randomFloorAway(state.dungeon, rng, state.player, 8);
        if (this.itemAt(pos.x, pos.y)) continue;
        setTile(state.dungeon, pos.x, pos.y, Tile.ShrineFloor);
        state.shrines.push(makeShrine(rng, state.floor, pos.x, pos.y));
      }
    }

    this.autoOpenAdjacent(false);
    const playerTile = tilePoint(state.player);
    computeFov(state.dungeon, playerTile.x, playerTile.y, calculatePlayerStats(state).torchRadius);
    this.pushMessage(
      first ? "The torch catches in the undercroft." : `Floor ${state.floor}. The dark rearranges itself.`,
      first ? "torch-loop" : "floor-transition",
      first ? "audio" : "floor-transition"
    );
  }

  private restart(seed?: number): void {
    const nextSeed = seed ?? this.state.seed ?? DEFAULT_SEED;
    resetItemIds();
    this.state = this.createState(nextSeed);
    this.newFloor(true);
  }

  private shapeOpeningShowcaseChamber(): void {
    const dungeon = this.state.dungeon;
    const room = dungeon.rooms[0];
    if (!room) return;
    const initialCenter = dungeon.spawn;
    const left = clamp(initialCenter.x - 8, 2, dungeon.width - 18);
    const top = clamp(initialCenter.y - 6, 2, dungeon.height - 14);
    const right = Math.min(dungeon.width - 3, left + 17);
    const bottom = Math.min(dungeon.height - 3, top + 13);
    const cx = Math.round((left + right) / 2);
    const cy = Math.round((top + bottom) / 2);

    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const isBoundary = x === left || x === right || y === top || y === bottom;
        setTile(dungeon, x, y, isBoundary ? Tile.Wall : Tile.Floor);
      }
    }

    room.x = left;
    room.y = top;
    room.w = right - left + 1;
    room.h = bottom - top + 1;
    room.cx = cx;
    room.cy = cy;
    dungeon.spawn = { x: cx, y: cy };
    const stairsPoint = sceneToGamePoint(this.state, { x: 5.4, y: 4.6 });
    dungeon.stairs = { x: Math.round(stairsPoint.x), y: Math.round(stairsPoint.y) };
    setTile(dungeon, cx, cy, Tile.Floor);
    for (const door of floorOneSceneDoors(this.state)) setTile(dungeon, door.tile.x, door.tile.y, Tile.Door);
    setTile(dungeon, dungeon.stairs.x, dungeon.stairs.y, Tile.Stairs);
  }

  private makeMonster(kind: MonsterKind, pos: Point, floor: number, rng: RNG): MonsterState {
    const definition = MONSTER_DEFS[kind];
    const maxHp = Math.round(definition.hp + floor * 3.4 + rng.int(0, floor + 2));
    return {
      id: `${kind}-${floor}-${pos.x}-${pos.y}-${rng.int(100, 999)}`,
      kind,
      name: definition.name,
      x: pos.x,
      y: pos.y,
      hp: maxHp,
      maxHp,
      attack: Math.round(definition.attack + floor * 1.25),
      defense: definition.defense + Math.floor(floor / 3),
      xp: Math.round(definition.xp + floor * 5),
      color: definition.color,
      role: definition.role,
      cooldown: 0,
      aiState: "idle",
      moveTarget: null,
      movePath: [],
      facing: Math.PI,
      speed: definition.speed,
      animationLockMs: 0,
      attackCooldownMs: 600 + rng.int(0, 450),
      pathRecalcMs: 0,
      hitFlashMs: 0,
      aggroRadius: definition.role === "caster" ? 5.8 : 4.8,
      animation: "idle"
    };
  }

  private stageOpeningEncounter(rng: RNG): void {
    const state = this.state;
    const room = state.dungeon.rooms[0];
    if (!room) return;

    for (const placement of floorOneScene.showcaseMonsters) {
      const x = clamp(state.player.x + placement.dx, room.x + 1, room.x + room.w - 2);
      const y = clamp(state.player.y + placement.dy, room.y + 1, room.y + room.h - 2);
      if (manhattan({ x, y }, state.player) < 3) continue;
      if (blocksMove(state.dungeon, x, y) || this.monsterAt(x, y)) continue;
      const monster = this.makeMonster(placement.kind, { x, y }, state.floor, rng);
      state.monsters.push(placement.elite ? applyElite(rng, monster) : monster);
    }

    for (const placement of floorOneScene.showcaseLoot) {
      const x = clamp(state.player.x + placement.dx, room.x + 1, room.x + room.w - 2);
      const y = clamp(state.player.y + placement.dy, room.y + 1, room.y + room.h - 2);
      if (blocksMove(state.dungeon, x, y) || this.itemAt(x, y)) continue;
      const item = makeItem(rng, state.floor, placement.forced, placement.rare ? "Rare" : undefined);
      state.items.push({ ...item, x, y });
    }
  }

  private seedOpeningLoadout(rng: RNG): void {
    const state = this.state;
    const equipmentSlots: Slot[] = ["weapon", "armor", "charm"];
    for (const slot of equipmentSlots) {
      if (state.player.equipment[slot]) continue;
      const item = makeItem(rng, state.floor, slot, slot === "armor" ? "Fine" : "Rare");
      if (item.kind === "gear") {
        state.player.equipment[slot] = item;
      }
    }

    if (state.player.inventory.length) return;
    const packTypes: (Slot | "potion")[] = [
      "potion",
      "weapon",
      "armor",
      "charm",
      "potion",
      "weapon",
      "armor",
      "charm"
    ];
    for (const forced of packTypes) {
      const item = makeItem(
        rng,
        state.floor,
        forced,
        forced === "weapon" || forced === "charm" ? "Fine" : undefined
      );
      state.player.inventory.push(item);
    }
  }

  private withActionRng<T>(fn: (rng: RNG) => T): T {
    const rng = new RNG(this.state.rngSeed);
    const result = fn(rng);
    this.state.rngSeed = rng.seed;
    return result;
  }

  private commandMoveTo(x: number, y: number): void {
    const target = this.nearestWalkablePoint({ x, y });
    const firstWaypoint = this.setEntityMoveTarget(this.state.player, target, 0.28);
    this.state.player.targetActorId = null;
    this.state.player.facing = angleTo(this.state.player, firstWaypoint);
    this.setActorAnimation(this.state.player, "run");
    this.state.turn += 1;
    this.state.debug.lastCommand = `move ${target.x.toFixed(1)},${target.y.toFixed(1)}`;
  }

  private commandTargetActor(id: string): void {
    const monster = this.monstersById(id);
    if (!monster) return;
    this.state.player.targetActorId = id;
    this.state.player.moveTarget = null;
    this.state.player.facing = angleTo(this.state.player, monster);
    this.state.turn += 1;
    this.state.debug.lastCommand = `target ${monster.name}`;
    this.tryPlayerAttack(monster);
  }

  private commandBasicAttack(): void {
    const target = this.currentOrNearestMonster(PLAYER_ATTACK_RANGE + 0.25);
    if (target) this.commandTargetActor(target.id);
    else {
      this.state.turn += 1;
      this.state.debug.lastCommand = "guard";
      this.pushMessage("You guard the torchline.");
    }
  }

  private commandUseAbility(): void {
    if ((this.state.player.abilityCooldownMs ?? 0) > 0) {
      this.pushMessage("The ember sigil is still cooling.");
      return;
    }

    const stats = calculatePlayerStats(this.state);
    this.state.player.abilityCooldownMs = PLAYER_ABILITY_COOLDOWN_MS;
    this.setActorAnimation(this.state.player, "attack", 420);
    this.state.turn += 1;
    this.state.debug.lastCommand = "ember burst";

    this.withActionRng((rng) => {
      const targets = this.state.monsters.filter((monster) => distance(monster, this.state.player) <= 2.65);
      if (!targets.length) {
        this.pushMessage(
          "The torch flares, but nothing is close enough to burn.",
          "hit-light",
          "hit",
          this.state.player.x,
          this.state.player.y
        );
        return;
      }
      for (const monster of [...targets]) {
        const damage = Math.max(3, Math.round(stats.attack * 0.82) + rng.int(2, 6));
        monster.hp -= damage;
        monster.hitFlashMs = 180;
        monster.aiState = "hit";
        this.setActorAnimation(monster, "hit", 240);
        this.pushEffect({
          type: "damage",
          amount: damage,
          x: monster.x,
          y: monster.y,
          color: "#ffb75f",
          heavy: true,
          audio: "hit-heavy"
        });
        if (monster.hp <= 0) this.killMonster(monster, rng, stats);
      }
      this.pushMessage(
        `Ember burst scorches ${targets.length} foe${targets.length === 1 ? "" : "s"}.`,
        "hit-heavy",
        "hit",
        this.state.player.x,
        this.state.player.y
      );
    });
  }

  private commandInteractAt(x: number, y: number): void {
    const point = { x, y };
    const item = this.closestItem(point, 0.95);
    if (
      item?.x !== undefined &&
      item.y !== undefined &&
      distance({ x: item.x, y: item.y }, this.state.player) < 1.35
    ) {
      this.pickupItem(item);
      this.state.turn += 1;
      this.state.debug.lastCommand = "pickup";
      return;
    }

    const shrine = this.state.shrines.find((entry) => !entry.used && distance(entry, point) < 1.2);
    if (shrine && distance(shrine, this.state.player) <= 1.65) {
      this.activateShrineState(shrine, false);
      this.state.turn += 1;
      this.state.debug.lastCommand = "shrine";
      return;
    }

    if (
      distance(point, this.state.dungeon.stairs) < 1.1 &&
      distance(this.state.player, this.state.dungeon.stairs) <= 1.25
    ) {
      this.useStairs();
      return;
    }

    const door = this.closestDoor(point, 1.25);
    if (door && distance(this.state.player, door) <= 1.8) {
      this.openDoor(door.x, door.y);
      this.state.turn += 1;
      this.state.debug.lastCommand = "door";
      return;
    }

    this.commandMoveTo(x, y);
  }

  private updateRealtimeCooldowns(dtMs: number): void {
    const player = this.state.player;
    player.attackCooldownMs = Math.max(0, (player.attackCooldownMs ?? 0) - dtMs);
    player.abilityCooldownMs = Math.max(0, (player.abilityCooldownMs ?? 0) - dtMs);
    player.footstepCooldownMs = Math.max(0, (player.footstepCooldownMs ?? 0) - dtMs);
    player.animationLockMs = Math.max(0, (player.animationLockMs ?? 0) - dtMs);
    for (const monster of this.state.monsters) {
      monster.attackCooldownMs = Math.max(0, (monster.attackCooldownMs ?? 0) - dtMs);
      monster.pathRecalcMs = Math.max(0, (monster.pathRecalcMs ?? 0) - dtMs);
      monster.hitFlashMs = Math.max(0, (monster.hitFlashMs ?? 0) - dtMs);
      monster.animationLockMs = Math.max(0, (monster.animationLockMs ?? 0) - dtMs);
    }
  }

  private updatePlayerRealtime(dt: number): void {
    const player = this.state.player;
    const target = player.targetActorId ? this.monstersById(player.targetActorId) : undefined;
    if (target) {
      player.facing = angleTo(player, target);
      if (distance(player, target) > PLAYER_ATTACK_RANGE) {
        const approach = this.pointNearTarget(player, target, PLAYER_ATTACK_RANGE * 0.82);
        if (!player.moveTarget || distance(player.moveTarget, approach) > 0.72)
          this.setEntityMoveTarget(player, approach, 0.28);
        const moved = this.followEntityPath(player, PLAYER_SPEED, dt, 0.28);
        this.setActorAnimation(player, moved ? "run" : "idle");
      } else {
        player.moveTarget = null;
        player.movePath = [];
        this.setActorAnimation(player, "idle");
        this.tryPlayerAttack(target);
      }
      return;
    }

    if (!player.moveTarget) {
      if (player.animation === "run") this.setActorAnimation(player, "idle");
      return;
    }

    const moved = this.followEntityPath(player, PLAYER_SPEED, dt, 0.28);
    this.setActorAnimation(player, moved ? "run" : "idle");
    if (!moved && !player.movePath?.length) {
      player.moveTarget = null;
      this.setActorAnimation(player, "idle");
    }
  }

  private updateMonstersRealtime(dt: number): void {
    const stats = calculatePlayerStats(this.state);
    const openingAggroGrace = isFloorOneScene(this.state) && this.state.turn === 0;
    this.withActionRng((rng) => {
      for (const monster of [...this.state.monsters]) {
        const dist = distance(monster, this.state.player);
        const monsterTile = tilePoint(monster);
        const playerTile = tilePoint(this.state.player);
        const canSeePlayer = hasLineOfSight(
          this.state.dungeon,
          monsterTile.x,
          monsterTile.y,
          playerTile.x,
          playerTile.y
        );
        const aggro =
          monster.aiState === "chase" ||
          monster.aiState === "attack" ||
          (!openingAggroGrace && dist <= (monster.aggroRadius ?? 6));
        if (!aggro) {
          monster.aiState = "idle";
          monster.attackCooldownMs = Math.max(
            monster.attackCooldownMs ?? 0,
            monster.role === "caster" ? OPENING_WAKE_CASTER_COOLDOWN_MS : OPENING_WAKE_MELEE_COOLDOWN_MS
          );
          this.setActorAnimation(monster, "idle");
          continue;
        }

        monster.facing = angleTo(monster, this.state.player);
        const attackRange = monster.role === "caster" ? 4.4 : MONSTER_MELEE_RANGE;
        if (dist <= attackRange && (monster.role === "melee" || canSeePlayer)) {
          monster.aiState = "attack";
          this.setActorAnimation(monster, "attack");
          if ((monster.attackCooldownMs ?? 0) <= 0) {
            this.setActorAnimation(monster, "attack", monster.role === "caster" ? 460 : 340);
            this.monsterAttack(monster, stats, rng, monster.role === "caster");
            monster.attackCooldownMs = monster.role === "caster" ? 1650 : 980;
          }
          continue;
        }

        monster.aiState = "chase";
        const speed =
          (monster.speed ?? 1) *
          (monster.kind === "gutter-fiend" ? 2.55 : monster.kind === "ash-chanter" ? 1.85 : 2.1);
        if (
          (monster.pathRecalcMs ?? 0) <= 0 ||
          !monster.moveTarget ||
          distance(monster.moveTarget, this.state.player) > 1.4
        ) {
          this.setEntityMoveTarget(monster, this.state.player, 0.3);
          monster.pathRecalcMs = MONSTER_PATH_RECALC_MS;
        }
        const moved = this.followEntityPath(monster, speed, dt, 0.3);
        this.setActorAnimation(monster, moved ? "run" : "idle");
      }
    });
  }

  private tryPlayerAttack(monster: MonsterState): void {
    if ((this.state.player.attackCooldownMs ?? 0) > 0 || monster.hp <= 0) return;
    if (distance(this.state.player, monster) > PLAYER_ATTACK_RANGE) return;
    this.state.player.attackCooldownMs = PLAYER_ATTACK_COOLDOWN_MS;
    this.setActorAnimation(this.state.player, "attack", 320);
    this.attackMonster(monster);
    monster.hitFlashMs = 180;
    monster.aiState = monster.hp <= 0 ? "dead" : "hit";
    this.setActorAnimation(monster, monster.hp <= 0 ? "death" : "hit", monster.hp <= 0 ? 520 : 240);
    if (monster.hp <= 0) this.state.player.targetActorId = null;
  }

  private setActorAnimation(entity: PathingEntity, animation: ActorAnimation, lockMs = 0): void {
    if ((entity.animationLockMs ?? 0) > 0 && lockMs <= 0) return;
    entity.animation = animation;
    if (lockMs > 0) entity.animationLockMs = lockMs;
  }

  private setEntityMoveTarget(entity: PathingEntity, target: Point, radius: number): Point {
    const path = this.pathTo(entity, target, radius);
    const first = path[0] ?? target;
    entity.moveTarget = first;
    entity.movePath = path.slice(1);
    entity.facing = angleTo(entity, first);
    return first;
  }

  private followEntityPath(entity: PathingEntity, speed: number, dt: number, radius: number): boolean {
    if (!entity.moveTarget) return false;
    if (distance(entity, entity.moveTarget) <= 0.1) this.advanceEntityPath(entity);
    if (!entity.moveTarget) return false;
    const moved = this.moveEntityToward(entity, entity.moveTarget, speed, dt, radius);
    if (entity.moveTarget && distance(entity, entity.moveTarget) <= 0.1) this.advanceEntityPath(entity);
    return moved;
  }

  private advanceEntityPath(entity: PathingEntity): void {
    const next = entity.movePath?.shift();
    entity.moveTarget = next ?? null;
    if (next) entity.facing = angleTo(entity, next);
  }

  private pathTo(start: Point, target: Point, radius: number): Point[] {
    if (isFloorOneScene(this.state)) {
      const scenePath = findFloorOnePath(this.state, start, target, radius);
      if (scenePath?.length) return scenePath;
    }
    return [this.nearestWalkablePoint(target)];
  }

  private moveEntityToward(
    entity: Point & { facing?: number },
    target: Point,
    speed: number,
    dt: number,
    radius: number
  ): boolean {
    const dx = target.x - entity.x;
    const dy = target.y - entity.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.06) return false;
    const step = Math.min(length, speed * dt);
    const nx = entity.x + (dx / length) * step;
    const ny = entity.y + (dy / length) * step;
    entity.facing = Math.atan2(dy, dx);

    if (this.isWorldWalkable(nx, ny, radius)) {
      entity.x = nx;
      entity.y = ny;
      this.playFootstepIfPlayer(entity);
      return true;
    }
    if (this.isWorldWalkable(nx, entity.y, radius)) {
      entity.x = nx;
      this.playFootstepIfPlayer(entity);
      return true;
    }
    if (this.isWorldWalkable(entity.x, ny, radius)) {
      entity.y = ny;
      this.playFootstepIfPlayer(entity);
      return true;
    }
    return false;
  }

  private playFootstepIfPlayer(entity: Point): void {
    if (entity !== this.state.player || (this.state.player.footstepCooldownMs ?? 0) > 0) return;
    const step = (Math.floor(this.state.elapsedMs / 260) % 3) + 1;
    this.state.player.footstepCooldownMs = 260;
    this.pushEffect({
      type: "audio",
      audio: `footstep-stone-${step}` as EffectEvent["audio"],
      x: this.state.player.x,
      y: this.state.player.y
    });
  }

  private isWorldWalkable(x: number, y: number, radius: number): boolean {
    if (isFloorOneScene(this.state) && !isFloorOneWalkable(this.state, { x, y }, radius)) return false;
    return this.legacyWorldWalkable(x, y, radius);
  }

  private legacyWorldWalkable(x: number, y: number, radius: number): boolean {
    const samples: Point[] = [
      { x, y },
      { x: x + radius, y },
      { x: x - radius, y },
      { x, y: y + radius },
      { x, y: y - radius }
    ];
    return samples.every(
      (sample) => !blocksMove(this.state.dungeon, Math.round(sample.x), Math.round(sample.y))
    );
  }

  private nearestWalkablePoint(point: Point): Point {
    if (isFloorOneScene(this.state)) {
      const scenePoint = nearestFloorOneWalkablePoint(this.state, point, 0.22);
      if (scenePoint && this.legacyWorldWalkable(scenePoint.x, scenePoint.y, 0.22)) return scenePoint;
    }
    if (this.isWorldWalkable(point.x, point.y, 0.22)) return point;
    const cx = Math.round(point.x);
    const cy = Math.round(point.y);
    let best: Point | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let radius = 1; radius <= 5; radius += 1) {
      for (let y = cy - radius; y <= cy + radius; y += 1) {
        for (let x = cx - radius; x <= cx + radius; x += 1) {
          if (!this.isWorldWalkable(x, y, 0.22)) continue;
          const candidate = { x, y };
          const score = distance(candidate, point);
          if (score < bestDistance) {
            best = candidate;
            bestDistance = score;
          }
        }
      }
      if (best) return best;
    }
    return { x: this.state.player.x, y: this.state.player.y };
  }

  private pointNearTarget(from: Point, target: Point, preferredDistance: number): Point {
    const dx = from.x - target.x;
    const dy = from.y - target.y;
    const length = Math.hypot(dx, dy) || 1;
    return this.nearestWalkablePoint({
      x: target.x + (dx / length) * preferredDistance,
      y: target.y + (dy / length) * preferredDistance
    });
  }

  private currentOrNearestMonster(maxDistance: number): MonsterState | undefined {
    const current = this.state.player.targetActorId
      ? this.monstersById(this.state.player.targetActorId)
      : undefined;
    if (current && distance(current, this.state.player) <= maxDistance) return current;
    return [...this.state.monsters]
      .filter((monster) => monster.hp > 0 && distance(monster, this.state.player) <= maxDistance)
      .sort((a, b) => distance(a, this.state.player) - distance(b, this.state.player))[0];
  }

  private monstersById(id: string): MonsterState | undefined {
    return this.state.monsters.find((monster) => monster.id === id);
  }

  private closestItem(point: Point, maxDistance: number): Item | undefined {
    return this.state.items
      .filter(
        (item) =>
          item.x !== undefined && item.y !== undefined && distance(item as Point, point) <= maxDistance
      )
      .sort((a, b) => distance(a as Point, point) - distance(b as Point, point))[0];
  }

  private closestDoor(point: Point, maxDistance: number): Point | undefined {
    const sceneDoor = nearestFloorOneDoor(this.state, point, maxDistance);
    if (sceneDoor && !sceneDoor.open) return sceneDoor.tile;

    let best: Point | undefined;
    let bestDistance = maxDistance;
    for (let y = 0; y < this.state.dungeon.height; y += 1) {
      for (let x = 0; x < this.state.dungeon.width; x += 1) {
        if (getTile(this.state.dungeon, x, y) !== Tile.Door) continue;
        const score = distance({ x, y }, point);
        if (score <= bestDistance) {
          best = { x, y };
          bestDistance = score;
        }
      }
    }
    return best;
  }

  private pickupNearby(): void {
    const item = this.closestItem(this.state.player, 0.72);
    if (item) this.pickupItem(item);
  }

  private tickBuffsRealtime(dt: number): void {
    const expired: TimedBuff[] = [];
    for (const buff of this.state.activeBuffs) {
      buff.turnsRemaining -= dt;
      if (buff.turnsRemaining <= 0) expired.push(buff);
    }
    if (!expired.length) return;
    this.state.activeBuffs = this.state.activeBuffs.filter((buff) => buff.turnsRemaining > 0);
    for (const buff of expired) this.pushMessage(`${buff.name} fades.`, "buff-expire", "buff-expire");
  }

  private tryMove(dx: number, dy: number): void {
    const state = this.state;
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    const monster = this.monsterAt(nx, ny);
    if (monster) {
      this.attackMonster(monster);
      this.afterPlayerAction();
      return;
    }

    const tile = getTile(state.dungeon, nx, ny);
    if (tile === Tile.Door) {
      this.openDoor(nx, ny);
      this.afterPlayerAction();
      return;
    }
    if (blocksMove(state.dungeon, nx, ny)) {
      this.pushMessage("Stone blocks the way.");
      return;
    }

    state.player.x = nx;
    state.player.y = ny;
    this.pushEffect({
      type: "audio",
      audio: `footstep-stone-${(state.turn % 3) + 1}` as EffectEvent["audio"],
      x: nx,
      y: ny
    });
    this.pickupHere();
    this.autoOpenAdjacent(true);
    this.afterPlayerAction();
  }

  private waitTurn(): void {
    const adjacent = DIRECTIONS.map((dir) =>
      this.monsterAt(this.state.player.x + dir.x, this.state.player.y + dir.y)
    ).find(Boolean);
    if (adjacent) this.attackMonster(adjacent);
    else this.pushMessage("You hold the torch steady.");
    this.afterPlayerAction();
  }

  private openDoor(x: number, y: number): void {
    setTile(this.state.dungeon, x, y, Tile.OpenDoor);
    this.pushMessage("A door groans open.", "door-open", "door", x, y);
  }

  private autoOpenAdjacent(report: boolean): void {
    let opened = 0;
    const playerTile = tilePoint(this.state.player);
    for (const dir of DIRECTIONS) {
      const x = playerTile.x + dir.x;
      const y = playerTile.y + dir.y;
      if (getTile(this.state.dungeon, x, y) === Tile.Door) {
        setTile(this.state.dungeon, x, y, Tile.OpenDoor);
        this.pushEffect({ type: "door", audio: "door-open", x, y, color: "#f2a84b" });
        opened += 1;
      }
    }
    if (opened && report)
      this.pushMessage(opened === 1 ? "A nearby door opens at your touch." : `${opened} doors swing open.`);
  }

  private afterPlayerAction(): void {
    const state = this.state;
    state.turn += 1;
    this.monsterTurns();
    this.tickBuffs();
    const playerTile = tilePoint(state.player);
    computeFov(state.dungeon, playerTile.x, playerTile.y, calculatePlayerStats(state).torchRadius);
    if (state.player.hp <= 0) this.die();
  }

  private attackMonster(monster: MonsterState): void {
    const stats = calculatePlayerStats(this.state);
    this.withActionRng((rng) => {
      const crit = rng.chance(stats.crit);
      const raw = stats.attack + (crit ? Math.ceil(stats.attack * 0.75) : 0);
      let damage = Math.max(1, raw - monster.defense + rng.int(0, 2));
      if (monster.elite?.affix === "shielded" && this.state.turn % 3 === 0)
        damage = Math.max(1, Math.floor(damage * 0.55));
      monster.hp -= damage;
      this.pushMessage(
        `${crit ? "Critical " : ""}Hit ${monster.name} for ${damage}.`,
        crit ? "hit-heavy" : "hit-light",
        "hit",
        monster.x,
        monster.y,
        {
          color: crit ? "#ffd17a" : monster.color,
          heavy: crit
        }
      );
      this.pushEffect({
        type: "damage",
        amount: damage,
        x: monster.x,
        y: monster.y,
        color: crit ? "#ffd17a" : "#f3ede0",
        heavy: crit,
        audio: crit ? "hit-heavy" : "hit-light"
      });
      if (monster.hp <= 0) this.killMonster(monster, rng, stats);
    });
  }

  private killMonster(monster: MonsterState, rng: RNG, stats: StatBlock): void {
    this.state.monsters = this.state.monsters.filter((entry) => entry !== monster);
    this.state.kills += 1;
    this.gainXp(monster.xp);
    if (stats.sustain > 0) this.heal(stats.sustain);
    this.pushEffect({
      type: "death",
      audio: "monster-death",
      x: monster.x,
      y: monster.y,
      color: monster.color,
      heavy: Boolean(monster.elite),
      monsterKind: monster.kind
    });
    const dropChance = 0.48 + this.state.player.skills.Shadow * 0.05 + (monster.elite ? 0.32 : 0);
    if (rng.chance(dropChance)) {
      const item = makeItem(rng, this.state.floor);
      this.state.items.push({ ...item, x: monster.x, y: monster.y });
      const isRare = item.kind === "gear" && (item.rarity === "Rare" || item.rarity === "Relic");
      this.pushMessage(
        `${monster.name} drops ${item.name}.`,
        isRare ? "rare-item-drop" : "loot-pickup",
        isRare ? "loot-beam" : "pickup",
        monster.x,
        monster.y,
        {
          color: item.color,
          heavy: isRare || Boolean(monster.elite)
        }
      );
    } else {
      this.pushMessage(`${monster.name} collapses.`);
    }
  }

  private monsterTurns(): void {
    const state = this.state;
    const player = state.player;
    const stats = calculatePlayerStats(state);

    this.withActionRng((rng) => {
      for (const monster of [...state.monsters]) {
        const dist = manhattan(monster, player);
        const monsterTile = tilePoint(monster);
        const playerTile = tilePoint(player);
        const seen = state.dungeon.visible[idx(state.dungeon, monsterTile.x, monsterTile.y)] === 1;
        if (monster.elite?.affix === "summoner") this.trySummon(monster, rng);

        if (dist === 1) {
          this.monsterAttack(monster, stats, rng);
          continue;
        }

        if (
          monster.role === "caster" &&
          dist <= 5 &&
          hasLineOfSight(state.dungeon, monsterTile.x, monsterTile.y, playerTile.x, playerTile.y)
        ) {
          this.monsterAttack(monster, stats, rng, true);
          continue;
        }

        if (!seen && dist > 5) continue;
        if (dist > 13) continue;

        const choices = [...DIRECTIONS].sort(
          (a, b) =>
            manhattan({ x: monster.x + a.x, y: monster.y + a.y }, player) -
            manhattan({ x: monster.x + b.x, y: monster.y + b.y }, player)
        );
        for (const step of choices) {
          const nx = monster.x + step.x;
          const ny = monster.y + step.y;
          if (nx === player.x && ny === player.y) continue;
          if (blocksMove(state.dungeon, nx, ny) || this.monsterAt(nx, ny)) continue;
          const definition = MONSTER_DEFS[monster.kind];
          const fear = definition.torchFear + state.player.skills.Flame * 0.025;
          if (!rng.chance(Math.max(0, fear))) {
            monster.x = nx;
            monster.y = ny;
          }
          break;
        }
      }
    });
  }

  private monsterAttack(monster: MonsterState, stats: StatBlock, rng: RNG, ranged = false): void {
    let attack = monster.attack;
    if (monster.elite?.affix === "ragebrand" && monster.hp / monster.maxHp < 0.45) attack += 3;
    const damage = Math.max(1, attack - stats.defense + rng.int(0, 2));
    this.state.player.hp -= damage;
    const verb = ranged ? "chants at" : "hits";
    this.pushMessage(
      `${monster.name} ${verb} you for ${damage}.`,
      damage > 6 ? "hit-heavy" : "hit-light",
      "damage",
      this.state.player.x,
      this.state.player.y,
      {
        color: "#d95d4d",
        heavy: damage > 6
      }
    );
    this.pushEffect({
      type: "damage",
      amount: damage,
      x: this.state.player.x,
      y: this.state.player.y,
      color: "#d95d4d",
      heavy: damage > 6,
      audio: damage > 6 ? "hit-heavy" : "hit-light"
    });

    if (monster.elite?.affix === "lantern-eater" && rng.chance(0.28)) {
      this.state.activeBuffs.push({
        id: `lantern-eater-${this.state.turn}`,
        source: "lantern-eater",
        name: "Torch Pressure",
        turnsRemaining: 5,
        color: "#5fc6df",
        modifiers: { torchRadius: -1.2 }
      });
      this.pushMessage("The elite drinks at the edge of your torch.");
    }
  }

  private trySummon(monster: MonsterState, rng: RNG): void {
    if (!monster.elite) return;
    if (monster.elite.cooldown > 0) {
      monster.elite.cooldown -= 1;
      return;
    }
    for (const dir of DIRECTIONS) {
      const x = monster.x + dir.x;
      const y = monster.y + dir.y;
      if (
        this.isWorldWalkable(x, y, 0.25) &&
        !this.monsterAt(x, y) &&
        manhattan({ x, y }, this.state.player) > 1
      ) {
        this.state.monsters.push(this.makeMonster("gutter-fiend", { x, y }, this.state.floor, rng));
        monster.elite.cooldown = 6;
        this.pushMessage(`${monster.name} calls a gutter fiend.`);
        return;
      }
    }
  }

  private pickupHere(): void {
    const item = this.itemAt(this.state.player.x, this.state.player.y);
    if (!item) return;
    this.pickupItem(item);
  }

  private pickupItem(item: Item): void {
    this.state.items = this.state.items.filter((entry) => entry !== item);
    const stats = calculatePlayerStats(this.state);
    if (item.kind === "gold") {
      const amount = Math.max(1, Math.round(item.amount * stats.goldGain));
      this.state.player.gold += amount;
      this.pushMessage(
        `Picked up ${amount} gold.`,
        "loot-pickup",
        "pickup",
        this.state.player.x,
        this.state.player.y,
        { color: item.color }
      );
      return;
    }
    if (item.kind === "potion") {
      this.state.player.inventory.push(itemWithoutPosition(item));
      this.pushMessage(
        `Packed ${item.name}.`,
        "loot-pickup",
        "pickup",
        this.state.player.x,
        this.state.player.y,
        { color: item.color }
      );
      this.trimInventory();
      return;
    }
    const gear = itemWithoutPosition(item) as GearItem;
    const equipped = this.state.player.equipment[gear.slot];
    if (!equipped || gearScore(gear) > gearScore(equipped)) {
      if (equipped) this.state.player.inventory.push(equipped);
      this.state.player.equipment[gear.slot] = gear;
      this.pushMessage(
        `Equipped ${gear.name}.`,
        "loot-pickup",
        "pickup",
        this.state.player.x,
        this.state.player.y,
        {
          color: gear.color,
          heavy: gear.rarity === "Rare" || gear.rarity === "Relic"
        }
      );
    } else {
      this.state.player.inventory.push(gear);
      this.pushMessage(
        `Packed ${gear.name}.`,
        "loot-pickup",
        "pickup",
        this.state.player.x,
        this.state.player.y,
        {
          color: gear.color,
          heavy: gear.rarity === "Rare" || gear.rarity === "Relic"
        }
      );
    }
    this.trimInventory();
  }

  private trimInventory(): void {
    const max = 12 + this.state.player.skills.Survival;
    while (this.state.player.inventory.length > max) {
      const dropped = this.state.player.inventory.shift()!;
      this.state.items.push({ ...dropped, x: this.state.player.x, y: this.state.player.y });
      this.pushMessage(`Dropped ${dropped.name}; pack is full.`);
    }
  }

  private useInventoryItem(index: number): void {
    const item = this.state.player.inventory[index];
    if (!item) return;
    if (item.kind === "potion") {
      this.state.player.inventory.splice(index, 1);
      const heal = Math.round(item.heal * calculatePlayerStats(this.state).potionValue);
      this.heal(heal);
      this.pushMessage(`Drank ${item.name} for ${heal} HP.`, "potion-drink", "audio");
      this.afterPlayerAction();
      return;
    }
    if (item.kind === "gear") {
      const current = this.state.player.equipment[item.slot];
      this.state.player.equipment[item.slot] = item;
      this.state.player.inventory.splice(index, 1);
      if (current) this.state.player.inventory.push(current);
      this.pushMessage(`Equipped ${item.name}.`);
    }
  }

  private drinkPotion(): void {
    const index = this.state.player.inventory.findIndex((item) => item.kind === "potion");
    if (index >= 0) this.useInventoryItem(index);
    else this.pushMessage("No flask in the pack.");
  }

  private activateShrine(): void {
    const shrine = this.state.shrines.find(
      (entry) => !entry.used && distance(entry, this.state.player) <= 1.65
    );
    if (!shrine) {
      this.pushMessage("No dormant shrine is within reach.");
      return;
    }
    this.activateShrineState(shrine, true);
  }

  private activateShrineState(shrine: ShrineState, consumeTurn: boolean): void {
    shrine.used = true;
    const buff = createTimedBuff(
      shrine.buffId,
      shrine.kind,
      `${shrine.buffId}-${this.state.floor}-${this.state.turn}`
    );
    this.state.activeBuffs.push(buff);
    this.pushMessage(`${shrine.name} flares to life.`, "shrine-activate", "shrine", shrine.x, shrine.y, {
      color: shrine.color,
      heavy: true
    });
    if (consumeTurn) this.afterPlayerAction();
  }

  private useStairs(): void {
    const state = this.state;
    if (distance(state.player, state.dungeon.stairs) > 1.1) {
      this.pushMessage("Find the downward stairs first.");
      return;
    }
    this.gainXp(20 + state.floor * 8);
    state.pendingSkills = this.rollSkills();
    state.mode = "skill-choice";
  }

  private chooseSkill(index: number): void {
    const choices = this.state.pendingSkills;
    if (!choices || !choices[index]) return;
    const chosen = choices[index]!;
    this.state.player.skills[chosen.tree] += 1;
    if (chosen.tree === "Survival") {
      this.state.player.base.maxHp += 6;
      this.heal(16);
    }
    const skillBuff = createSkillBuff(chosen.tree);
    if (skillBuff) this.state.activeBuffs.push(skillBuff);
    this.pushMessage(`${chosen.tree} answers.`, "skill-select", "audio");
    this.state.floor += 1;
    this.state.pendingSkills = null;
    this.newFloor(false);
  }

  private rollSkills(): SkillChoice[] {
    return this.withActionRng((rng) => {
      const picked: SkillChoice[] = [];
      while (picked.length < 3) {
        const option = rng.pick(SKILL_OPTIONS);
        if (!picked.includes(option)) picked.push(option);
      }
      return picked;
    });
  }

  private gainXp(amount: number): void {
    const stats = calculatePlayerStats(this.state);
    this.state.player.xp += Math.round(amount * stats.xpGain);
    while (this.state.player.xp >= this.state.player.nextXp) {
      this.state.player.xp -= this.state.player.nextXp;
      this.state.player.level += 1;
      this.state.player.nextXp = Math.round(this.state.player.nextXp * 1.35 + 20);
      this.state.player.base.maxHp += 8;
      this.state.player.base.attack += 1;
      this.state.player.hp = calculatePlayerStats(this.state).maxHp;
      this.pushMessage(`Level ${this.state.player.level}. Breath returns.`);
    }
  }

  private heal(amount: number): void {
    const maxHp = calculatePlayerStats(this.state).maxHp;
    this.state.player.hp = Math.min(maxHp, this.state.player.hp + amount);
  }

  private tickBuffs(): void {
    const expired: TimedBuff[] = [];
    for (const buff of this.state.activeBuffs) {
      buff.turnsRemaining -= 1;
      if (buff.turnsRemaining <= 0) expired.push(buff);
    }
    if (!expired.length) return;
    this.state.activeBuffs = this.state.activeBuffs.filter((buff) => buff.turnsRemaining > 0);
    for (const buff of expired) {
      this.pushMessage(`${buff.name} fades.`, "buff-expire", "buff-expire");
    }
  }

  private die(): void {
    if (this.state.mode === "dead") return;
    this.state.mode = "dead";
    this.state.player.hp = 0;
    this.state.player.moveTarget = null;
    this.state.player.movePath = [];
    this.state.player.targetActorId = null;
    this.setActorAnimation(this.state.player, "death", 900);
    this.pushEffect({
      type: "death",
      audio: "hit-heavy",
      x: this.state.player.x,
      y: this.state.player.y,
      color: "#d95d4d",
      heavy: true
    });
    this.pushMessage("Your torch gutters out.");
  }

  private monsterAt(x: number, y: number): MonsterState | undefined {
    return this.state.monsters.find(
      (monster) => Math.round(monster.x) === Math.round(x) && Math.round(monster.y) === Math.round(y)
    );
  }

  private itemAt(x: number, y: number): Item | undefined {
    return this.state.items.find(
      (item) =>
        Math.round(item.x ?? Number.NaN) === Math.round(x) &&
        Math.round(item.y ?? Number.NaN) === Math.round(y)
    );
  }

  private pushMessage(
    text: string,
    audio?: EffectEvent["audio"],
    type: EffectEvent["type"] = "message",
    x?: number,
    y?: number,
    visual?: Pick<EffectEvent, "color" | "heavy" | "monsterKind">
  ): void {
    this.state.messages.unshift(text);
    this.state.messages = this.state.messages.slice(0, 6);
    this.pushEffect({ type, text, audio, x, y, ...visual });
  }

  private pushEffect(event: Omit<EffectEvent, "id">): void {
    this.state.effects.push({
      id: `${this.state.turn}-${this.state.effects.length}-${event.type}`,
      ...event
    });
  }
}
