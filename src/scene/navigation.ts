import { getTile } from "../core/dungeon";
import { Tile, type GameState, type Point } from "../core/types";
import { floorOneScene, FLOOR_ONE_SCENE_ID, type SceneCircle, type SceneDoorSpec, type SceneRect } from "./floor-one";

const NAV_STEP = 0.5;
const MAX_NEAREST_RADIUS = 5.5;
const SEGMENT_SAMPLE = 0.22;

type GridNode = {
  x: number;
  y: number;
};

export type SceneDoorRuntime = {
  spec: SceneDoorSpec;
  tile: Point;
  open: boolean;
};

export type SceneCollisionDebug = {
  bounds: SceneRect;
  blockers: SceneCircle[];
  doorRects: SceneRect[];
};

export function isFloorOneScene(state: GameState): boolean {
  return state.floor === 1 && state.sceneId === FLOOR_ONE_SCENE_ID;
}

export function sceneOrigin(state: GameState): Point {
  const room = state.dungeon.rooms[0];
  return room ? { x: room.cx, y: room.cy } : { x: state.player.x, y: state.player.y };
}

export function sceneToGamePoint(state: GameState, point: Point): Point {
  const origin = sceneOrigin(state);
  return { x: origin.x + point.x, y: origin.y + point.y };
}

export function gameToScenePoint(state: GameState, point: Point): Point {
  const origin = sceneOrigin(state);
  return { x: point.x - origin.x, y: point.y - origin.y };
}

export function sceneDoorTile(state: GameState, door: SceneDoorSpec): Point {
  const point = sceneToGamePoint(state, door);
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

export function floorOneSceneDoors(state: GameState): SceneDoorRuntime[] {
  if (!isFloorOneScene(state)) return [];
  return floorOneScene.doorways.map((spec) => {
    const tile = sceneDoorTile(state, spec);
    return { spec, tile, open: getTile(state.dungeon, tile.x, tile.y) === Tile.OpenDoor };
  });
}

export function nearestFloorOneDoor(state: GameState, point: Point, maxDistance: number): SceneDoorRuntime | undefined {
  let best: SceneDoorRuntime | undefined;
  let bestDistance = maxDistance;
  for (const door of floorOneSceneDoors(state)) {
    const score = Math.hypot(point.x - door.tile.x, point.y - door.tile.y);
    if (score <= bestDistance) {
      best = door;
      bestDistance = score;
    }
  }
  return best;
}

export function isFloorOneWalkable(state: GameState, point: Point, radius: number): boolean {
  if (!isFloorOneScene(state)) return false;
  return isLocalWalkable(state, gameToScenePoint(state, point), radius);
}

export function nearestFloorOneWalkablePoint(state: GameState, point: Point, radius: number): Point | null {
  if (!isFloorOneScene(state)) return null;
  if (isFloorOneWalkable(state, point, radius)) return point;

  const origin = sceneOrigin(state);
  const local = gameToScenePoint(state, point);
  let best: Point | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let search = NAV_STEP; search <= MAX_NEAREST_RADIUS; search += NAV_STEP) {
    for (let y = local.y - search; y <= local.y + search; y += NAV_STEP) {
      for (let x = local.x - search; x <= local.x + search; x += NAV_STEP) {
        if (Math.abs(x - local.x) < search - NAV_STEP && Math.abs(y - local.y) < search - NAV_STEP) continue;
        const candidate = { x, y };
        if (!isLocalWalkable(state, candidate, radius)) continue;
        const score = Math.hypot(candidate.x - local.x, candidate.y - local.y);
        if (score < bestScore) {
          best = { x: origin.x + candidate.x, y: origin.y + candidate.y };
          bestScore = score;
        }
      }
    }
    if (best) return best;
  }

  return null;
}

export function findFloorOnePath(state: GameState, start: Point, target: Point, radius: number): Point[] | null {
  if (!isFloorOneScene(state)) return null;
  const snappedTarget = nearestFloorOneWalkablePoint(state, target, radius);
  if (!snappedTarget) return null;
  if (segmentWalkable(state, start, snappedTarget, radius)) return [snappedTarget];

  const bounds = floorOneScene.walkableBounds;
  const width = Math.floor((bounds.maxX - bounds.minX) / NAV_STEP) + 1;
  const height = Math.floor((bounds.maxY - bounds.minY) / NAV_STEP) + 1;
  const total = width * height;
  const origin = sceneOrigin(state);
  const startLocal = gameToScenePoint(state, start);
  const targetLocal = gameToScenePoint(state, snappedTarget);
  const startNode = nearestWalkableNode(state, localToNode(startLocal, bounds), width, height, radius);
  const targetNode = nearestWalkableNode(state, localToNode(targetLocal, bounds), width, height, radius);
  if (!startNode || !targetNode) return [snappedTarget];

  const startIndex = nodeIndex(startNode, width);
  const targetIndex = nodeIndex(targetNode, width);
  const open: number[] = [startIndex];
  const openFlags = new Uint8Array(total);
  const closed = new Uint8Array(total);
  const cameFrom = new Int32Array(total);
  const gScore = new Float32Array(total);
  const fScore = new Float32Array(total);
  cameFrom.fill(-1);
  gScore.fill(Number.POSITIVE_INFINITY);
  fScore.fill(Number.POSITIVE_INFINITY);
  openFlags[startIndex] = 1;
  gScore[startIndex] = 0;
  fScore[startIndex] = heuristic(startNode, targetNode);

  while (open.length) {
    let currentOpenIndex = 0;
    let currentIndex = open[0]!;
    let currentScore = fScore[currentIndex]!;
    for (let i = 1; i < open.length; i += 1) {
      const candidate = open[i]!;
      if (fScore[candidate]! < currentScore) {
        currentIndex = candidate;
        currentOpenIndex = i;
        currentScore = fScore[candidate]!;
      }
    }

    if (currentIndex === targetIndex) {
      const points = reconstructPath(cameFrom, currentIndex, width, bounds, origin);
      return smoothPath(state, start, points, snappedTarget, radius);
    }

    open.splice(currentOpenIndex, 1);
    openFlags[currentIndex] = 0;
    closed[currentIndex] = 1;

    const current = indexToNode(currentIndex, width);
    for (const neighbor of neighbors(current, width, height)) {
      const neighborIndex = nodeIndex(neighbor, width);
      if (closed[neighborIndex]) continue;
      const localPoint = nodeToLocal(neighbor, bounds);
      if (!isLocalWalkable(state, localPoint, radius)) continue;
      if (neighbor.x !== current.x && neighbor.y !== current.y) {
        const horizontal = { x: neighbor.x, y: current.y };
        const vertical = { x: current.x, y: neighbor.y };
        if (!isLocalWalkable(state, nodeToLocal(horizontal, bounds), radius) || !isLocalWalkable(state, nodeToLocal(vertical, bounds), radius)) continue;
      }

      const moveCost = neighbor.x === current.x || neighbor.y === current.y ? 1 : Math.SQRT2;
      const tentative = gScore[currentIndex]! + moveCost;
      if (tentative >= gScore[neighborIndex]!) continue;
      cameFrom[neighborIndex] = currentIndex;
      gScore[neighborIndex] = tentative;
      fScore[neighborIndex] = tentative + heuristic(neighbor, targetNode);
      if (!openFlags[neighborIndex]) {
        open.push(neighborIndex);
        openFlags[neighborIndex] = 1;
      }
    }
  }

  return [snappedTarget];
}

export function floorOneCollisionDebug(state: GameState): SceneCollisionDebug | null {
  if (!isFloorOneScene(state)) return null;
  const doorRects = floorOneSceneDoors(state)
    .filter((door) => !door.open)
    .map((door) => doorRect(door.spec));
  return {
    bounds: floorOneScene.walkableBounds,
    blockers: floorOneScene.propBlockers,
    doorRects
  };
}

function isLocalWalkable(state: GameState, local: Point, radius: number): boolean {
  const bounds = floorOneScene.walkableBounds;
  if (local.x < bounds.minX + radius || local.x > bounds.maxX - radius || local.y < bounds.minY + radius || local.y > bounds.maxY - radius) return false;

  for (const blocker of floorOneScene.propBlockers) {
    if (Math.hypot(local.x - blocker.x, local.y - blocker.y) < blocker.radius + radius) return false;
  }

  for (const door of floorOneSceneDoors(state)) {
    if (!door.open && circleIntersectsRect(local, radius, doorRect(door.spec))) return false;
  }

  return true;
}

function segmentWalkable(state: GameState, start: Point, end: Point, radius: number): boolean {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const steps = Math.max(1, Math.ceil(length / SEGMENT_SAMPLE));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const point = {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t
    };
    if (!isFloorOneWalkable(state, point, radius)) return false;
  }
  return true;
}

function smoothPath(state: GameState, start: Point, points: Point[], exactTarget: Point, radius: number): Point[] {
  const result: Point[] = [];
  let anchor = start;
  let index = 0;
  while (index < points.length) {
    let best = index;
    for (let candidate = points.length - 1; candidate >= index; candidate -= 1) {
      if (segmentWalkable(state, anchor, points[candidate]!, radius)) {
        best = candidate;
        break;
      }
    }
    const waypoint = points[best]!;
    result.push(waypoint);
    anchor = waypoint;
    index = best + 1;
  }

  if (result.length && segmentWalkable(state, result[result.length - 1]!, exactTarget, radius)) result[result.length - 1] = exactTarget;
  else if (!result.length || Math.hypot(result[result.length - 1]!.x - exactTarget.x, result[result.length - 1]!.y - exactTarget.y) > 0.2) result.push(exactTarget);
  return result;
}

function nearestWalkableNode(state: GameState, node: GridNode, width: number, height: number, radius: number): GridNode | null {
  if (nodeWithin(node, width, height) && isLocalWalkable(state, nodeToLocal(node, floorOneScene.walkableBounds), radius)) return node;
  for (let ring = 1; ring < Math.max(width, height); ring += 1) {
    for (let y = node.y - ring; y <= node.y + ring; y += 1) {
      for (let x = node.x - ring; x <= node.x + ring; x += 1) {
        if (Math.abs(x - node.x) < ring && Math.abs(y - node.y) < ring) continue;
        const candidate = { x, y };
        if (!nodeWithin(candidate, width, height)) continue;
        if (isLocalWalkable(state, nodeToLocal(candidate, floorOneScene.walkableBounds), radius)) return candidate;
      }
    }
  }
  return null;
}

function localToNode(local: Point, bounds: SceneRect): GridNode {
  return {
    x: Math.round((local.x - bounds.minX) / NAV_STEP),
    y: Math.round((local.y - bounds.minY) / NAV_STEP)
  };
}

function nodeToLocal(node: GridNode, bounds: SceneRect): Point {
  return {
    x: bounds.minX + node.x * NAV_STEP,
    y: bounds.minY + node.y * NAV_STEP
  };
}

function nodeIndex(node: GridNode, width: number): number {
  return node.y * width + node.x;
}

function indexToNode(index: number, width: number): GridNode {
  return {
    x: index % width,
    y: Math.floor(index / width)
  };
}

function nodeWithin(node: GridNode, width: number, height: number): boolean {
  return node.x >= 0 && node.y >= 0 && node.x < width && node.y < height;
}

function neighbors(node: GridNode, width: number, height: number): GridNode[] {
  const result: GridNode[] = [];
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      if (x === 0 && y === 0) continue;
      const candidate = { x: node.x + x, y: node.y + y };
      if (nodeWithin(candidate, width, height)) result.push(candidate);
    }
  }
  return result;
}

function heuristic(a: GridNode, b: GridNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function reconstructPath(cameFrom: Int32Array, currentIndex: number, width: number, bounds: SceneRect, origin: Point): Point[] {
  const reversed: Point[] = [];
  let current = currentIndex;
  while (current >= 0) {
    const local = nodeToLocal(indexToNode(current, width), bounds);
    reversed.push({ x: origin.x + local.x, y: origin.y + local.y });
    current = cameFrom[current]!;
  }
  reversed.reverse();
  return reversed.slice(1);
}

function doorRect(door: SceneDoorSpec): SceneRect {
  return {
    id: door.id,
    minX: door.x - door.width / 2,
    minY: door.y - door.depth / 2,
    maxX: door.x + door.width / 2,
    maxY: door.y + door.depth / 2
  };
}

function circleIntersectsRect(point: Point, radius: number, rect: SceneRect): boolean {
  const closestX = Math.max(rect.minX, Math.min(point.x, rect.maxX));
  const closestY = Math.max(rect.minY, Math.min(point.y, rect.maxY));
  return Math.hypot(point.x - closestX, point.y - closestY) < radius;
}
