import { blocksLight, idx, inBounds } from "./dungeon";
import type { DungeonState } from "./types";

export function hasLineOfSight(dungeon: DungeonState, x0: number, y0: number, x1: number, y1: number): boolean {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;

  while (true) {
    if (!(x === x0 && y === y0) && blocksLight(dungeon, x, y)) return x === x1 && y === y1;
    if (x === x1 && y === y1) return true;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    dx = Math.abs(x1 - x0);
    dy = Math.abs(y1 - y0);
    if (!inBounds(dungeon, x, y)) return false;
  }
}

export function computeFov(dungeon: DungeonState, px: number, py: number, radius: number): void {
  dungeon.visible.fill(0);
  const r = Math.ceil(radius);
  for (let y = py - r; y <= py + r; y += 1) {
    for (let x = px - r; x <= px + r; x += 1) {
      if (!inBounds(dungeon, x, y)) continue;
      if (Math.hypot(x - px, y - py) > radius) continue;
      if (!hasLineOfSight(dungeon, px, py, x, y)) continue;
      const index = idx(dungeon, x, y);
      dungeon.visible[index] = 1;
      dungeon.memory[index] = 1;
    }
  }

  for (let y = py - 1; y <= py + 1; y += 1) {
    for (let x = px - 1; x <= px + 1; x += 1) {
      if (!inBounds(dungeon, x, y)) continue;
      const index = idx(dungeon, x, y);
      dungeon.visible[index] = 1;
      dungeon.memory[index] = 1;
    }
  }
}

export function decayFogMemory(dungeon: DungeonState, retention: number): void {
  const decay = Math.max(0.0003, 0.0014 * Math.max(0.35, 1 - retention));
  for (let i = 0; i < dungeon.memory.length; i += 1) {
    if (!dungeon.visible[i] && dungeon.memory[i] > 0) dungeon.memory[i] = Math.max(0, dungeon.memory[i] - decay);
  }
}

export function visibleCount(dungeon: DungeonState): number {
  let count = 0;
  for (let i = 0; i < dungeon.visible.length; i += 1) count += dungeon.visible[i];
  return count;
}
