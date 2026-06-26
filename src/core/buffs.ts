import type { SkillTree, StatBlock, TimedBuff } from "./types";

export type BuffDefinition = {
  id: string;
  name: string;
  turns: number;
  color: string;
  modifiers: Partial<StatBlock>;
};

export const BUFFS: Record<string, BuffDefinition> = {
  "ember-shrine": {
    id: "ember-shrine",
    name: "Ember Shrine",
    turns: 32,
    color: "#f2a84b",
    modifiers: { torchRadius: 2.3, attack: 2 }
  },
  "coin-shrine": {
    id: "coin-shrine",
    name: "Coin Shrine",
    turns: 34,
    color: "#f7cf70",
    modifiers: { goldGain: 0.5 }
  },
  "warden-shrine": {
    id: "warden-shrine",
    name: "Warden Shrine",
    turns: 36,
    color: "#8fb7cf",
    modifiers: { defense: 3 }
  },
  "fleet-shrine": {
    id: "fleet-shrine",
    name: "Fleet Shrine",
    turns: 30,
    color: "#79d1a7",
    modifiers: { crit: 0.04 }
  },
  "sight-shrine": {
    id: "sight-shrine",
    name: "Sight Shrine",
    turns: 38,
    color: "#8ed9ff",
    modifiers: { torchRadius: 1.2, memoryRetention: 0.22 }
  }
};

export function createTimedBuff(id: string, source: TimedBuff["source"], instanceId: string): TimedBuff {
  const definition = BUFFS[id];
  if (!definition) {
    throw new Error(`Unknown buff ${id}`);
  }
  return {
    id: instanceId,
    source,
    name: definition.name,
    turnsRemaining: definition.turns,
    color: definition.color,
    modifiers: { ...definition.modifiers }
  };
}

export function createSkillBuff(tree: SkillTree): TimedBuff | null {
  if (tree !== "Flame") return null;
  return {
    id: "skill-flame-kindled",
    source: "skill",
    name: "Kindled",
    turnsRemaining: 12,
    color: "#ffb35c",
    modifiers: { torchRadius: 0.8 }
  };
}

export function addStatPartials(base: Partial<StatBlock>, next: Partial<StatBlock>): Partial<StatBlock> {
  const out: Partial<StatBlock> = { ...base };
  for (const key of Object.keys(next) as (keyof StatBlock)[]) {
    out[key] = (out[key] ?? 0) + (next[key] ?? 0);
  }
  return out;
}
