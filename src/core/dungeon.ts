import { RNG } from "./rng";
import { DIRECTIONS, Tile, type DungeonState, type Point, type Room } from "./types";

export function idx(dungeon: DungeonState, x: number, y: number): number {
  return y * dungeon.width + x;
}

export function inBounds(dungeon: DungeonState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < dungeon.width && y < dungeon.height;
}

export function getTile(dungeon: DungeonState, x: number, y: number): Tile {
  if (!inBounds(dungeon, x, y)) return Tile.Void;
  return dungeon.tiles[idx(dungeon, x, y)] as Tile;
}

export function setTile(dungeon: DungeonState, x: number, y: number, tile: Tile): void {
  if (!inBounds(dungeon, x, y)) return;
  dungeon.tiles[idx(dungeon, x, y)] = tile;
  updateBlockerAt(dungeon, x, y);
}

export function isFloorish(dungeon: DungeonState, x: number, y: number): boolean {
  const tile = getTile(dungeon, x, y);
  return tile === Tile.Floor || tile === Tile.OpenDoor || tile === Tile.Stairs || tile === Tile.ShrineFloor;
}

export function blocksMove(dungeon: DungeonState, x: number, y: number): boolean {
  const tile = getTile(dungeon, x, y);
  return tile === Tile.Void || tile === Tile.Wall || tile === Tile.Door;
}

export function blocksLight(dungeon: DungeonState, x: number, y: number): boolean {
  const tile = getTile(dungeon, x, y);
  return tile === Tile.Void || tile === Tile.Wall || tile === Tile.Door;
}

export function updateBlockers(dungeon: DungeonState): void {
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      updateBlockerAt(dungeon, x, y);
    }
  }
}

function updateBlockerAt(dungeon: DungeonState, x: number, y: number): void {
  dungeon.blockers[idx(dungeon, x, y)] = blocksMove(dungeon, x, y) ? 1 : 0;
}

function setRaw(dungeon: DungeonState, x: number, y: number, tile: Tile): void {
  if (!inBounds(dungeon, x, y)) return;
  dungeon.tiles[idx(dungeon, x, y)] = tile;
}

function carveRoom(dungeon: DungeonState, room: Room): void {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) setRaw(dungeon, x, y, Tile.Floor);
  }
}

function carveCorridor(dungeon: DungeonState, rng: RNG, a: Room, b: Room): void {
  let x = a.cx;
  let y = a.cy;
  const horizontalFirst = rng.chance(0.5);
  const carveTo = (tx: number, ty: number): void => {
    while (x !== tx) {
      x += Math.sign(tx - x);
      setRaw(dungeon, x, y, Tile.Floor);
    }
    while (y !== ty) {
      y += Math.sign(ty - y);
      setRaw(dungeon, x, y, Tile.Floor);
    }
  };

  if (horizontalFirst) carveTo(b.cx, b.cy);
  else {
    while (y !== b.cy) {
      y += Math.sign(b.cy - y);
      setRaw(dungeon, x, y, Tile.Floor);
    }
    while (x !== b.cx) {
      x += Math.sign(b.cx - x);
      setRaw(dungeon, x, y, Tile.Floor);
    }
  }
}

function placeDoors(dungeon: DungeonState, rng: RNG): void {
  for (let y = 1; y < dungeon.height - 1; y += 1) {
    for (let x = 1; x < dungeon.width - 1; x += 1) {
      if (getTile(dungeon, x, y) !== Tile.Floor) continue;
      const wallNS = getTile(dungeon, x, y - 1) === Tile.Wall && getTile(dungeon, x, y + 1) === Tile.Wall;
      const floorEW = isFloorish(dungeon, x - 1, y) && isFloorish(dungeon, x + 1, y);
      const wallEW = getTile(dungeon, x - 1, y) === Tile.Wall && getTile(dungeon, x + 1, y) === Tile.Wall;
      const floorNS = isFloorish(dungeon, x, y - 1) && isFloorish(dungeon, x, y + 1);
      const farFromSpawn = Math.abs(x - dungeon.spawn.x) + Math.abs(y - dungeon.spawn.y) > 6;
      if (((wallNS && floorEW) || (wallEW && floorNS)) && farFromSpawn && rng.chance(0.24)) {
        setRaw(dungeon, x, y, Tile.Door);
      }
    }
  }
}

function wrapVoid(dungeon: DungeonState): void {
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (x === 0 || y === 0 || x === dungeon.width - 1 || y === dungeon.height - 1) setRaw(dungeon, x, y, Tile.Void);
    }
  }
}

export function generateDungeon(floor: number, seed: number): DungeonState {
  const rng = new RNG((seed + floor * 10007) >>> 0);
  const width = 56 + Math.min(12, floor * 2);
  const height = 40 + Math.min(10, floor);
  const dungeon: DungeonState = {
    width,
    height,
    tiles: new Uint8Array(width * height),
    blockers: new Uint8Array(width * height),
    visible: new Uint8Array(width * height),
    memory: new Float32Array(width * height),
    tileVariants: new Uint16Array(width * height),
    rooms: [],
    spawn: { x: 3, y: 3 },
    stairs: { x: width - 4, y: height - 4 }
  };
  dungeon.tiles.fill(Tile.Wall);

  const attempts = 150 + floor * 8;
  for (let i = 0; i < attempts && dungeon.rooms.length < 18 + floor; i += 1) {
    const w = rng.int(5, 11);
    const h = rng.int(4, 9);
    const x = rng.int(2, width - w - 3);
    const y = rng.int(2, height - h - 3);
    const room: Room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    const overlaps = dungeon.rooms.some(
      (other) =>
        x <= other.x + other.w + 2 &&
        x + w + 2 >= other.x &&
        y <= other.y + other.h + 2 &&
        y + h + 2 >= other.y
    );
    if (overlaps) continue;
    carveRoom(dungeon, room);
    if (dungeon.rooms.length) carveCorridor(dungeon, rng, dungeon.rooms[dungeon.rooms.length - 1]!, room);
    dungeon.rooms.push(room);
  }

  if (!dungeon.rooms.length) {
    const room: Room = { x: 3, y: 3, w: 10, h: 8, cx: 8, cy: 7 };
    dungeon.rooms.push(room);
    carveRoom(dungeon, room);
  }

  dungeon.spawn = { x: dungeon.rooms[0]!.cx, y: dungeon.rooms[0]!.cy };
  const last = dungeon.rooms[dungeon.rooms.length - 1]!;
  dungeon.stairs = { x: last.cx, y: last.cy };
  setRaw(dungeon, dungeon.stairs.x, dungeon.stairs.y, Tile.Stairs);

  placeDoors(dungeon, rng);
  wrapVoid(dungeon);
  for (let i = 0; i < dungeon.tileVariants.length; i += 1) dungeon.tileVariants[i] = rng.int(0, 5);
  updateBlockers(dungeon);
  return dungeon;
}

export function randomFloorAway(dungeon: DungeonState, rng: RNG, from: Point, minDistance: number): Point {
  for (let i = 0; i < 900; i += 1) {
    const room = rng.pick(dungeon.rooms);
    const x = rng.int(room.x + 1, room.x + room.w - 2);
    const y = rng.int(room.y + 1, room.y + room.h - 2);
    if (isFloorish(dungeon, x, y) && Math.abs(x - from.x) + Math.abs(y - from.y) >= minDistance) return { x, y };
  }
  return { ...dungeon.stairs };
}

export function reachable(dungeon: DungeonState, start: Point, target: Point, doorsPassable = true): boolean {
  const queue: Point[] = [start];
  const seen = new Uint8Array(dungeon.width * dungeon.height);
  seen[idx(dungeon, start.x, start.y)] = 1;

  while (queue.length) {
    const point = queue.shift()!;
    if (point.x === target.x && point.y === target.y) return true;
    for (const dir of DIRECTIONS) {
      const x = point.x + dir.x;
      const y = point.y + dir.y;
      if (!inBounds(dungeon, x, y)) continue;
      const index = idx(dungeon, x, y);
      if (seen[index]) continue;
      const tile = getTile(dungeon, x, y);
      if (tile === Tile.Wall || tile === Tile.Void) continue;
      if (!doorsPassable && tile === Tile.Door) continue;
      seen[index] = 1;
      queue.push({ x, y });
    }
  }
  return false;
}
