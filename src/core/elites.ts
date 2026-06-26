import { RNG } from "./rng";
import type { EliteAffixId, EliteState, MonsterState } from "./types";

type EliteDefinition = {
  id: EliteAffixId;
  name: string;
  auraColor: string;
  pulse: string;
  hpMult: number;
  attackMult: number;
  defenseBonus: number;
};

export const ELITE_AFFIXES: Record<EliteAffixId, EliteDefinition> = {
  ashbound: {
    id: "ashbound",
    name: "Ashbound",
    auraColor: "#f27b38",
    pulse: "ember",
    hpMult: 1.45,
    attackMult: 1.25,
    defenseBonus: 0
  },
  shielded: {
    id: "shielded",
    name: "Shielded",
    auraColor: "#8fb7cf",
    pulse: "ward",
    hpMult: 1.55,
    attackMult: 1.1,
    defenseBonus: 2
  },
  venomous: {
    id: "venomous",
    name: "Venomous",
    auraColor: "#86c34a",
    pulse: "venom",
    hpMult: 1.35,
    attackMult: 1.25,
    defenseBonus: 0
  },
  "lantern-eater": {
    id: "lantern-eater",
    name: "Lantern-Eater",
    auraColor: "#5fc6df",
    pulse: "cyan",
    hpMult: 1.35,
    attackMult: 1.2,
    defenseBonus: 1
  },
  summoner: {
    id: "summoner",
    name: "Summoner",
    auraColor: "#bb82e8",
    pulse: "violet",
    hpMult: 1.4,
    attackMult: 1.1,
    defenseBonus: 0
  },
  ragebrand: {
    id: "ragebrand",
    name: "Ragebrand",
    auraColor: "#d95d4d",
    pulse: "blood",
    hpMult: 1.3,
    attackMult: 1.35,
    defenseBonus: 0
  }
};

export function applyElite(rng: RNG, monster: MonsterState): MonsterState {
  const definition = ELITE_AFFIXES[rng.pick(Object.keys(ELITE_AFFIXES) as EliteAffixId[])];
  const maxHp = Math.round(monster.maxHp * definition.hpMult);
  const elite: EliteState = {
    affix: definition.id,
    name: definition.name,
    auraColor: definition.auraColor,
    pulse: definition.pulse,
    cooldown: 0
  };
  return {
    ...monster,
    name: `${definition.name} ${monster.name}`,
    hp: maxHp,
    maxHp,
    attack: Math.round(monster.attack * definition.attackMult),
    defense: monster.defense + definition.defenseBonus,
    xp: Math.round(monster.xp * 2.1),
    elite
  };
}
