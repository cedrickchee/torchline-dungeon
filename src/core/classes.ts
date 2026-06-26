import type { PlayerState, Skills, StatBlock } from "./types";

export const DEFAULT_CLASS_ID = "torchbearer";

export const DEFAULT_BASE_STATS: StatBlock = {
  attack: 5,
  defense: 1,
  crit: 0.05,
  maxHp: 48,
  torchRadius: 8.5,
  potionValue: 1,
  goldGain: 1,
  xpGain: 1,
  memoryRetention: 1,
  sustain: 0
};

export function createDefaultSkills(): Skills {
  return {
    Flame: 0,
    Steel: 0,
    Shadow: 0,
    Survival: 0
  };
}

export function createPlayer(): PlayerState {
  return {
    id: "player",
    classId: DEFAULT_CLASS_ID,
    x: 0,
    y: 0,
    level: 1,
    xp: 0,
    nextXp: 45,
    gold: 0,
    hp: DEFAULT_BASE_STATS.maxHp,
    base: { ...DEFAULT_BASE_STATS },
    equipment: {
      weapon: null,
      armor: null,
      charm: null
    },
    inventory: [],
    skills: createDefaultSkills()
  };
}
