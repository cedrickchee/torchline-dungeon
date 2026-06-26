import { RNG } from "./rng";
import type { AffixId, GearItem, Rarity, RolledAffix, Slot, StatBlock } from "./types";

type AffixDefinition = {
  id: AffixId;
  name: string;
  allowed: Slot[];
  weights: Partial<Record<Rarity, number>>;
  stat: keyof StatBlock;
  min: number;
  max: number;
  format: (value: number) => string;
};

const percent = (value: number): string => `+${Math.round(value * 100)}%`;
const flat = (value: number): string => `+${value}`;

export const AFFIXES: Record<AffixId, AffixDefinition> = {
  ember: {
    id: "ember",
    name: "Ember",
    allowed: ["weapon", "charm"],
    weights: { Fine: 2, Rare: 3, Relic: 3 },
    stat: "attack",
    min: 1,
    max: 4,
    format: (value) => `${flat(value)} attack from ember heat`
  },
  warded: {
    id: "warded",
    name: "Warded",
    allowed: ["armor", "charm"],
    weights: { Fine: 3, Rare: 3, Relic: 4 },
    stat: "defense",
    min: 1,
    max: 4,
    format: (value) => `${flat(value)} defense from old wards`
  },
  keen: {
    id: "keen",
    name: "Keen",
    allowed: ["weapon", "charm"],
    weights: { Fine: 2, Rare: 3, Relic: 4 },
    stat: "crit",
    min: 0.02,
    max: 0.07,
    format: (value) => `${percent(value)} critical chance`
  },
  gravebound: {
    id: "gravebound",
    name: "Gravebound",
    allowed: ["weapon", "armor", "charm"],
    weights: { Rare: 2, Relic: 3 },
    stat: "xpGain",
    min: 0.08,
    max: 0.18,
    format: (value) => `${percent(value)} XP from the dead`
  },
  lucent: {
    id: "lucent",
    name: "Lucent",
    allowed: ["armor", "charm"],
    weights: { Fine: 1, Rare: 3, Relic: 4 },
    stat: "torchRadius",
    min: 0.5,
    max: 1.6,
    format: (value) => `${flat(Number(value.toFixed(1)))} torch radius`
  },
  vampiric: {
    id: "vampiric",
    name: "Vampiric",
    allowed: ["weapon", "charm"],
    weights: { Rare: 2, Relic: 4 },
    stat: "sustain",
    min: 1,
    max: 3,
    format: (value) => `heal ${value} on kills`
  },
  swift: {
    id: "swift",
    name: "Swift",
    allowed: ["weapon", "armor", "charm"],
    weights: { Fine: 2, Rare: 3, Relic: 3 },
    stat: "memoryRetention",
    min: 0.08,
    max: 0.18,
    format: (value) => `${percent(value)} slower fog decay`
  }
};

export function affixCountForRarity(rarity: Rarity): number {
  if (rarity === "Relic") return 2;
  if (rarity === "Rare") return 2;
  if (rarity === "Fine") return 1;
  return 0;
}

export function rollAffixes(rng: RNG, slot: Slot, rarity: Rarity): RolledAffix[] {
  const count = affixCountForRarity(rarity);
  const options = Object.values(AFFIXES).filter((affix) => affix.allowed.includes(slot) && affix.weights[rarity]);
  const rolled: RolledAffix[] = [];

  while (rolled.length < count && options.length > rolled.length) {
    const affix = rng.weighted(
      options
        .filter((option) => !rolled.some((entry) => entry.id === option.id))
        .map((option) => ({ value: option, weight: option.weights[rarity] ?? 1 }))
    );
    const raw = affix.min + rng.next() * (affix.max - affix.min);
    const magnitude = affix.stat === "crit" || affix.stat === "xpGain" || affix.stat === "memoryRetention" ? Number(raw.toFixed(3)) : Math.max(1, Math.round(raw));
    rolled.push({
      id: affix.id,
      name: affix.name,
      magnitude,
      text: affix.format(magnitude)
    });
  }

  return rolled;
}

export function affixModifiers(item: GearItem): Partial<StatBlock> {
  const totals: Partial<StatBlock> = {};
  for (const rolled of item.affixes) {
    const definition = AFFIXES[rolled.id];
    const key = definition.stat;
    totals[key] = (totals[key] ?? 0) + rolled.magnitude;
  }
  return totals;
}
