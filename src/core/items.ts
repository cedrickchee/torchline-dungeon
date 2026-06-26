import { affixModifiers, rollAffixes } from "./affixes";
import { RNG } from "./rng";
import type { GearItem, Item, Rarity, Slot, StatBlock } from "./types";

type BaseGear = {
  name: string;
  attack: number;
  defense: number;
  crit: number;
};

export type ItemDescriptionTone =
  | "meta"
  | "stat"
  | "affix"
  | "section"
  | "delta-positive"
  | "delta-negative"
  | "delta-even";

export type ItemDescriptionLine = {
  text: string;
  tone: ItemDescriptionTone;
};

type ComparableStat =
  | "attack"
  | "defense"
  | "crit"
  | "torchRadius"
  | "xpGain"
  | "memoryRetention"
  | "sustain";

const COMPARABLE_STATS: { key: ComparableStat; label: string; percent?: boolean; precision?: number }[] = [
  { key: "attack", label: "attack" },
  { key: "defense", label: "defense" },
  { key: "crit", label: "critical", percent: true },
  { key: "torchRadius", label: "torch radius", precision: 1 },
  { key: "xpGain", label: "XP gain", percent: true },
  { key: "memoryRetention", label: "fog memory", percent: true },
  { key: "sustain", label: "sustain" }
];

function slotLabel(slot: Slot): string {
  return slot[0]!.toUpperCase() + slot.slice(1);
}

function signedValue(value: number, precision = 0): string {
  const rounded = precision > 0 ? Number(value.toFixed(precision)) : Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function signedPercent(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function statLine(stat: (typeof COMPARABLE_STATS)[number], value: number): string {
  return `${stat.percent ? signedPercent(value) : signedValue(value, stat.precision)} ${stat.label}`;
}

const GEAR_TABLE: Record<Slot, BaseGear[]> = {
  weapon: [
    { name: "Ash Dirk", attack: 2, defense: 0, crit: 0.02 },
    { name: "Iron Mace", attack: 4, defense: 0, crit: 0 },
    { name: "Cinder Saber", attack: 6, defense: 0, crit: 0.04 },
    { name: "Sunken Axe", attack: 8, defense: -1, crit: 0.05 }
  ],
  armor: [
    { name: "Padded Mantle", attack: 0, defense: 1, crit: 0 },
    { name: "Ring Mail", attack: 0, defense: 3, crit: 0 },
    { name: "Blacksteel Vest", attack: 1, defense: 5, crit: 0 },
    { name: "Warden Plate", attack: 1, defense: 7, crit: -0.01 }
  ],
  charm: [
    { name: "Tin Ember", attack: 0, defense: 0, crit: 0.04 },
    { name: "Bone Lens", attack: 1, defense: 0, crit: 0.06 },
    { name: "Moon Bead", attack: 0, defense: 1, crit: 0.08 },
    { name: "Phoenix Coin", attack: 2, defense: 1, crit: 0.05 }
  ]
};

export const RARITY_META: Record<Rarity, { color: string; mult: number; weight: number }> = {
  Common: { color: "#c8bda8", mult: 1, weight: 60 },
  Fine: { color: "#7ed083", mult: 1.25, weight: 26 },
  Rare: { color: "#75aee8", mult: 1.55, weight: 11 },
  Relic: { color: "#c986e8", mult: 1.95, weight: 3 }
};

export function resetItemIds(): void {
  return;
}

function nextItemId(prefix: string, floor: number, rng: RNG): string {
  return `${prefix}-${floor}-${rng.int(100000, 999999)}`;
}

export function makeItem(
  rng: RNG,
  floor: number,
  forcedType?: Slot | "potion" | "gold",
  forcedRarity?: Rarity
): Item {
  if (forcedType === "gold" || (!forcedType && rng.chance(0.2))) {
    return {
      id: nextItemId("gold", floor, rng),
      kind: "gold",
      name: "Gold",
      amount: rng.int(10, 28 + floor * 8),
      color: "#f7cf70"
    };
  }

  if (forcedType === "potion" || (!forcedType && rng.chance(0.26))) {
    return {
      id: nextItemId("potion", floor, rng),
      kind: "potion",
      name: "Red Flask",
      heal: 24 + floor * 4,
      color: "#d95d4d"
    };
  }

  const slot = (forcedType ?? rng.pick(["weapon", "armor", "charm"] as const)) as Slot;
  const index = Math.min(GEAR_TABLE[slot].length - 1, Math.floor((floor + rng.int(0, 4)) / 3));
  const base = GEAR_TABLE[slot][index]!;
  const rarity =
    forcedRarity ??
    rng.weighted(
      (Object.keys(RARITY_META) as Rarity[]).map((rarityKey) => ({
        value: rarityKey,
        weight: RARITY_META[rarityKey].weight / Math.max(1, floor > 3 ? 0.8 : 1)
      }))
    );
  const meta = RARITY_META[rarity];
  const mult = meta.mult + floor * 0.05;
  const affixes = rollAffixes(rng, slot, rarity);

  return {
    id: nextItemId(slot, floor, rng),
    kind: "gear",
    slot,
    rarity,
    name: `${rarity} ${base.name}`,
    attack: Math.max(0, Math.round(base.attack * mult)),
    defense: Math.max(0, Math.round(base.defense * mult)),
    crit: Math.max(0, Number((base.crit * mult).toFixed(3))),
    affixes,
    color: meta.color
  };
}

export function gearScore(item: GearItem | null): number {
  if (!item) return 0;
  const modifiers = affixModifiers(item);
  return (
    item.attack * 3 +
    (modifiers.attack ?? 0) * 3 +
    item.defense * 2.4 +
    (modifiers.defense ?? 0) * 2.4 +
    item.crit * 100 +
    (modifiers.crit ?? 0) * 100 +
    (modifiers.torchRadius ?? 0) * 3 +
    (modifiers.sustain ?? 0) * 3
  );
}

export function itemStatModifiers(item: GearItem | null): Partial<StatBlock> {
  if (!item) return {};
  const modifiers = affixModifiers(item);
  return {
    attack: item.attack + (modifiers.attack ?? 0),
    defense: item.defense + (modifiers.defense ?? 0),
    crit: item.crit + (modifiers.crit ?? 0),
    torchRadius: modifiers.torchRadius ?? 0,
    xpGain: modifiers.xpGain ?? 0,
    memoryRetention: modifiers.memoryRetention ?? 0,
    sustain: modifiers.sustain ?? 0
  };
}

export function describeItemDetails(item: Item, equipped?: GearItem | null): ItemDescriptionLine[] {
  if (item.kind === "gold") return [{ text: `${item.amount} gold`, tone: "stat" }];
  if (item.kind === "potion") return [{ text: `Restores ${item.heal} HP`, tone: "stat" }];

  const lines: ItemDescriptionLine[] = [{ text: `${item.rarity} ${slotLabel(item.slot)}`, tone: "meta" }];
  if (item.attack) lines.push({ text: `Base +${item.attack} attack`, tone: "stat" });
  if (item.defense) lines.push({ text: `Base +${item.defense} defense`, tone: "stat" });
  if (item.crit) lines.push({ text: `Base +${Math.round(item.crit * 100)}% critical`, tone: "stat" });
  if (item.affixes.length) {
    lines.push({ text: "Affixes", tone: "section" });
    for (const affix of item.affixes) lines.push({ text: `${affix.name}: ${affix.text}`, tone: "affix" });
  } else {
    lines.push({ text: "No affixes", tone: "meta" });
  }

  if (equipped !== undefined) {
    if (!equipped) {
      lines.push({ text: `No ${slotLabel(item.slot)} equipped`, tone: "section" });
      lines.push({ text: "Equipping adds all listed stats", tone: "delta-positive" });
      return lines;
    }
    lines.push({ text: `Compared with ${equipped.name}`, tone: "section" });
    const itemStats = itemStatModifiers(item);
    const equippedStats = itemStatModifiers(equipped);
    let visibleDeltas = 0;
    for (const stat of COMPARABLE_STATS) {
      const delta = (itemStats[stat.key] ?? 0) - (equippedStats[stat.key] ?? 0);
      const threshold = stat.percent ? 0.004 : stat.precision ? 0.04 : 0.49;
      if (Math.abs(delta) <= threshold) continue;
      visibleDeltas += 1;
      lines.push({
        text: statLine(stat, delta),
        tone: delta > 0 ? "delta-positive" : "delta-negative"
      });
    }
    if (visibleDeltas === 0) lines.push({ text: "No stat change", tone: "delta-even" });
    const delta = Math.round((gearScore(item) - gearScore(equipped)) * 10) / 10;
    lines.push({
      text: `${delta >= 0 ? "+" : ""}${delta} overall score`,
      tone: delta > 0 ? "delta-positive" : delta < 0 ? "delta-negative" : "delta-even"
    });
  }
  return lines;
}

export function describeItem(item: Item, equipped?: GearItem | null): string[] {
  return describeItemDetails(item, equipped).map((line) => line.text);
}
