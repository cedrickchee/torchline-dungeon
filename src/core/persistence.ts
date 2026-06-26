import { generateDungeon } from "./dungeon";
import type {
  DungeonState,
  GameAction,
  GameState,
  Item,
  MonsterState,
  PlayerState,
  ReplayState,
  ShrineState,
  TimedBuff
} from "./types";

export const SAVE_VERSION = 1;

type SerializedDungeon = Omit<DungeonState, "tiles" | "blockers" | "visible" | "memory" | "tileVariants"> & {
  tiles: number[];
  blockers: number[];
  visible: number[];
  memory: number[];
  tileVariants: number[];
};

export type SaveGame = {
  version: number;
  createdAt: string;
  updatedAt: string;
  seed: number;
  rngSeed: number;
  sceneId: string;
  floor: number;
  turn: number;
  elapsedMs: number;
  kills: number;
  mode: GameState["mode"];
  player: PlayerState;
  dungeon: SerializedDungeon;
  monsters: MonsterState[];
  items: Item[];
  shrines: ShrineState[];
  activeBuffs: TimedBuff[];
  pendingSkills: GameState["pendingSkills"];
  messages: string[];
  replay: GameState["replay"];
};

export function serializeDungeon(dungeon: DungeonState): SerializedDungeon {
  return {
    ...dungeon,
    tiles: Array.from(dungeon.tiles),
    blockers: Array.from(dungeon.blockers),
    visible: Array.from(dungeon.visible),
    memory: Array.from(dungeon.memory),
    tileVariants: Array.from(dungeon.tileVariants)
  };
}

export function deserializeDungeon(serialized: SerializedDungeon): DungeonState {
  const expectedLength = serialized.width * serialized.height;
  if (
    serialized.tiles.length !== expectedLength ||
    serialized.blockers.length !== expectedLength ||
    serialized.visible.length !== expectedLength ||
    serialized.memory.length !== expectedLength ||
    serialized.tileVariants.length !== expectedLength
  ) {
    throw new Error("Save dungeon dimensions do not match tile arrays.");
  }
  return {
    width: serialized.width,
    height: serialized.height,
    tiles: Uint8Array.from(serialized.tiles),
    blockers: Uint8Array.from(serialized.blockers),
    visible: Uint8Array.from(serialized.visible),
    memory: Float32Array.from(serialized.memory),
    tileVariants: Uint16Array.from(serialized.tileVariants),
    rooms: serialized.rooms,
    spawn: serialized.spawn,
    stairs: serialized.stairs
  };
}

export function serializeState(state: GameState, previousCreatedAt?: string): SaveGame {
  const now = new Date().toISOString();
  return {
    version: SAVE_VERSION,
    createdAt: previousCreatedAt ?? now,
    updatedAt: now,
    seed: state.seed,
    rngSeed: state.rngSeed,
    sceneId: state.sceneId,
    floor: state.floor,
    turn: state.turn,
    elapsedMs: state.elapsedMs,
    kills: state.kills,
    mode: state.mode === "dead" ? "dead" : state.mode === "skill-choice" ? "skill-choice" : "playing",
    player: structuredClone(state.player) as PlayerState,
    dungeon: serializeDungeon(state.dungeon),
    monsters: structuredClone(state.monsters) as MonsterState[],
    items: structuredClone(state.items) as Item[],
    shrines: structuredClone(state.shrines) as ShrineState[],
    activeBuffs: structuredClone(state.activeBuffs) as TimedBuff[],
    pendingSkills: structuredClone(state.pendingSkills) as GameState["pendingSkills"],
    messages: [...state.messages],
    replay: structuredClone(state.replay) as GameState["replay"]
  };
}

export function deserializeSave(payload: unknown): SaveGame {
  if (!payload || typeof payload !== "object") throw new Error("Save data is not an object.");
  const save = payload as Partial<SaveGame>;
  if (save.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${String(save.version)}.`);
  if (typeof save.seed !== "number" || typeof save.floor !== "number")
    throw new Error("Save data is missing seed or floor.");
  if (!save.player || !save.dungeon || !save.replay) throw new Error("Save data is missing required state.");
  return save as SaveGame;
}

function normalizeReplay(replay: ReplayState, elapsedMs: number): ReplayState {
  return {
    seed: replay.seed,
    status: replay.status === "playing" ? "recording" : replay.status,
    elapsedMs: replay.elapsedMs ?? elapsedMs,
    actions: replay.actions.map((entry) => ({
      turn: entry.turn,
      elapsedMs: entry.elapsedMs ?? 0,
      action: structuredClone(entry.action) as GameAction
    }))
  };
}

export function stateFromSave(save: SaveGame, template: GameState): GameState {
  const elapsedMs = save.elapsedMs ?? 0;
  return {
    ...template,
    saveVersion: SAVE_VERSION,
    mode: save.mode,
    seed: save.seed,
    rngSeed: save.rngSeed,
    sceneId: save.sceneId ?? template.sceneId,
    floor: save.floor,
    turn: save.turn,
    elapsedMs,
    kills: save.kills ?? 0,
    player: structuredClone(save.player) as PlayerState,
    dungeon: deserializeDungeon(save.dungeon),
    monsters: structuredClone(save.monsters) as MonsterState[],
    items: structuredClone(save.items) as Item[],
    shrines: structuredClone(save.shrines) as ShrineState[],
    activeBuffs: structuredClone(save.activeBuffs) as TimedBuff[],
    pendingSkills: structuredClone(save.pendingSkills) as GameState["pendingSkills"],
    messages: [...save.messages],
    effects: [],
    replay: normalizeReplay(structuredClone(save.replay) as ReplayState, elapsedMs)
  };
}

export function blankDungeonForTemplate(seed: number): DungeonState {
  return generateDungeon(1, seed);
}
