import { RNG } from "./rng";
import type { ShrineKind, ShrineState } from "./types";

type ShrineDefinition = {
  kind: ShrineKind;
  name: string;
  color: string;
  buffId: string;
};

export const SHRINES: Record<ShrineKind, ShrineDefinition> = {
  ember: {
    kind: "ember",
    name: "Ember Shrine",
    color: "#f2a84b",
    buffId: "ember-shrine"
  },
  coin: {
    kind: "coin",
    name: "Coin Shrine",
    color: "#f7cf70",
    buffId: "coin-shrine"
  },
  warden: {
    kind: "warden",
    name: "Warden Shrine",
    color: "#8fb7cf",
    buffId: "warden-shrine"
  },
  fleet: {
    kind: "fleet",
    name: "Fleet Shrine",
    color: "#79d1a7",
    buffId: "fleet-shrine"
  },
  sight: {
    kind: "sight",
    name: "Sight Shrine",
    color: "#8ed9ff",
    buffId: "sight-shrine"
  }
};

export function makeShrine(rng: RNG, floor: number, x: number, y: number, forcedKind?: ShrineKind): ShrineState {
  const definition = SHRINES[forcedKind ?? rng.pick(Object.keys(SHRINES) as ShrineKind[])];
  return {
    id: `shrine-${floor}-${x}-${y}`,
    kind: definition.kind,
    name: definition.name,
    used: false,
    color: definition.color,
    buffId: definition.buffId,
    x,
    y
  };
}
