import type { GameAction, ReplayAction, ReplayState } from "./types";

export function createReplay(seed: number): ReplayState {
  return {
    seed,
    status: "recording",
    elapsedMs: 0,
    actions: []
  };
}

export function shouldRecordAction(action: GameAction): boolean {
  return !["toggleDebug", "toggleDebugFlag", "pause", "resume"].includes(action.type);
}

export function recordAction(replay: ReplayState, turn: number, elapsedMs: number, action: GameAction): void {
  if (replay.status !== "recording" || !shouldRecordAction(action)) return;
  replay.actions.push({ turn, elapsedMs, action: structuredClone(action) as GameAction });
}

export function replayLabel(replay: ReplayState): string {
  return `${replay.status} · ${replay.actions.length} actions · ${(replay.elapsedMs / 1000).toFixed(1)}s`;
}

export function cloneReplayActions(replay: ReplayState): ReplayAction[] {
  return replay.actions.map((entry) => ({
    turn: entry.turn,
    elapsedMs: entry.elapsedMs ?? 0,
    action: structuredClone(entry.action) as GameAction
  }));
}
