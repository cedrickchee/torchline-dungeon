export const TILE_SIZE = 64;

export enum Tile {
  Void = 0,
  Floor = 1,
  Wall = 2,
  Door = 3,
  OpenDoor = 4,
  Stairs = 5,
  ShrineFloor = 6
}

export type GameMode = "playing" | "paused" | "skill-choice" | "dead" | "error";
export type Slot = "weapon" | "armor" | "charm";
export type Rarity = "Common" | "Fine" | "Rare" | "Relic";
export type ItemKind = "gold" | "potion" | "gear";
export type MonsterKind = "gutter-fiend" | "bone-warden" | "ash-chanter";
export type SkillTree = "Flame" | "Steel" | "Shadow" | "Survival";
export type ShrineKind = "ember" | "coin" | "warden" | "fleet" | "sight";
export type EliteAffixId = "ashbound" | "shielded" | "venomous" | "lantern-eater" | "summoner" | "ragebrand";
export type AffixId = "ember" | "warded" | "keen" | "gravebound" | "lucent" | "vampiric" | "swift";

export type Point = {
  x: number;
  y: number;
};

export type ActorAnimation = "idle" | "run" | "attack" | "hit" | "death";
export type ActorAiState = "idle" | "patrol" | "aggro" | "chase" | "attack" | "hit" | "dead";

export type Room = Point & {
  w: number;
  h: number;
  cx: number;
  cy: number;
};

export type DungeonState = {
  width: number;
  height: number;
  tiles: Uint8Array;
  blockers: Uint8Array;
  visible: Uint8Array;
  memory: Float32Array;
  tileVariants: Uint16Array;
  rooms: Room[];
  spawn: Point;
  stairs: Point;
};

export type StatBlock = {
  attack: number;
  defense: number;
  crit: number;
  maxHp: number;
  torchRadius: number;
  potionValue: number;
  goldGain: number;
  xpGain: number;
  memoryRetention: number;
  sustain: number;
};

export type RolledAffix = {
  id: AffixId;
  name: string;
  magnitude: number;
  text: string;
};

export type BaseItem = {
  id: string;
  kind: ItemKind;
  name: string;
  color: string;
  x?: number;
  y?: number;
};

export type GoldItem = BaseItem & {
  kind: "gold";
  amount: number;
};

export type PotionItem = BaseItem & {
  kind: "potion";
  heal: number;
};

export type GearItem = BaseItem & {
  kind: "gear";
  slot: Slot;
  rarity: Rarity;
  attack: number;
  defense: number;
  crit: number;
  affixes: RolledAffix[];
};

export type Item = GoldItem | PotionItem | GearItem;

export type Equipment = Record<Slot, GearItem | null>;

export type Skills = Record<SkillTree, number>;

export type PlayerState = Point & {
  id: "player";
  classId: string;
  level: number;
  xp: number;
  nextXp: number;
  gold: number;
  hp: number;
  base: StatBlock;
  equipment: Equipment;
  inventory: Item[];
  skills: Skills;
  moveTarget?: Point | null;
  movePath?: Point[];
  targetActorId?: string | null;
  facing?: number;
  animation?: ActorAnimation;
  animationLockMs?: number;
  attackCooldownMs?: number;
  abilityCooldownMs?: number;
  footstepCooldownMs?: number;
};

export type MonsterDefinition = {
  id: MonsterKind;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  xp: number;
  color: string;
  speed: number;
  torchFear: number;
  role: "melee" | "caster";
};

export type EliteState = {
  affix: EliteAffixId;
  name: string;
  auraColor: string;
  pulse: string;
  cooldown: number;
};

export type MonsterState = Point & {
  id: string;
  kind: MonsterKind;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xp: number;
  color: string;
  role: "melee" | "caster";
  cooldown: number;
  aiState?: ActorAiState;
  animation?: ActorAnimation;
  moveTarget?: Point | null;
  movePath?: Point[];
  facing?: number;
  speed?: number;
  animationLockMs?: number;
  attackCooldownMs?: number;
  pathRecalcMs?: number;
  hitFlashMs?: number;
  aggroRadius?: number;
  elite?: EliteState;
};

export type TimedBuff = {
  id: string;
  source: ShrineKind | EliteAffixId | AffixId | "skill";
  name: string;
  turnsRemaining: number;
  color: string;
  modifiers: Partial<StatBlock>;
};

export type ShrineState = Point & {
  id: string;
  kind: ShrineKind;
  name: string;
  used: boolean;
  color: string;
  buffId: string;
};

export type SkillChoice = {
  tree: SkillTree;
  name: string;
  desc: string;
};

export type EffectType =
  | "message"
  | "damage"
  | "pickup"
  | "door"
  | "hit"
  | "death"
  | "loot-beam"
  | "shrine"
  | "buff-expire"
  | "floor-transition"
  | "save"
  | "load"
  | "audio";

export type AudioCueId =
  | "ambience-crypt-loop"
  | "torch-loop"
  | "footstep-stone-1"
  | "footstep-stone-2"
  | "footstep-stone-3"
  | "door-open"
  | "hit-light"
  | "hit-heavy"
  | "elite-alert"
  | "monster-death"
  | "loot-pickup"
  | "rare-item-drop"
  | "potion-drink"
  | "pause-open"
  | "save-confirm"
  | "load-confirm"
  | "shrine-activate"
  | "buff-expire"
  | "floor-transition"
  | "skill-select";

export type EffectEvent = {
  id: string;
  type: EffectType;
  text?: string;
  x?: number;
  y?: number;
  amount?: number;
  color?: string;
  heavy?: boolean;
  monsterKind?: MonsterKind;
  audio?: AudioCueId;
};

export type ReplayAction = {
  turn: number;
  elapsedMs: number;
  action: GameAction;
};

export type ReplayState = {
  seed: number;
  status: "recording" | "playing" | "idle";
  elapsedMs: number;
  actions: ReplayAction[];
};

export type GameState = {
  saveVersion: number;
  mode: GameMode;
  seed: number;
  rngSeed: number;
  sceneId: string;
  floor: number;
  turn: number;
  elapsedMs: number;
  kills: number;
  player: PlayerState;
  dungeon: DungeonState;
  monsters: MonsterState[];
  items: Item[];
  shrines: ShrineState[];
  activeBuffs: TimedBuff[];
  pendingSkills: SkillChoice[] | null;
  messages: string[];
  effects: EffectEvent[];
  replay: ReplayState;
  debug: DebugState;
  error?: string;
};

export type DebugState = {
  enabled: boolean;
  showCollision: boolean;
  showLos: boolean;
  showFogMemory: boolean;
  showRoomGraph: boolean;
  showMonsterTargets: boolean;
  showReplayLog: boolean;
  missingAssets: string[];
  missingAudio: string[];
  fps: number;
  avgFps: number;
  frameMs: number;
  p95FrameMs: number;
  slowFrames: number;
  sampleFrames: number;
  updateMs: number;
  renderMs: number;
  drawCalls: number;
  triangles: number;
  objects: number;
  animatedSprites: number;
  particles: number;
  lastCommand: string;
};

export type GameAction =
  | { type: "move"; dx: number; dy: number }
  | { type: "moveTo"; x: number; y: number }
  | { type: "targetActor"; id: string }
  | { type: "basicAttack" }
  | { type: "useAbility" }
  | { type: "interactAt"; x: number; y: number }
  | { type: "wait" }
  | { type: "useStairs" }
  | { type: "chooseSkill"; index: number }
  | { type: "useInventoryItem"; index: number }
  | { type: "drinkPotion" }
  | { type: "activateShrine" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "restart"; seed?: number }
  | { type: "toggleDebug" }
  | {
      type: "toggleDebugFlag";
      flag: keyof Pick<
        DebugState,
        | "showCollision"
        | "showLos"
        | "showFogMemory"
        | "showRoomGraph"
        | "showMonsterTargets"
        | "showReplayLog"
      >;
    };

export const DIRECTIONS: Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
];
