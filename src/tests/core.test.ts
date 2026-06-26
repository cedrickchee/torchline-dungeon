import { describe, expect, it } from "vitest";
import { validateAtlasManifest } from "../assets/validate-manifest";
import { blocksMove, generateDungeon, getTile, reachable, setTile, updateBlockers } from "../core/dungeon";
import { hasLineOfSight } from "../core/fov";
import { TorchlineGame } from "../core/game";
import { describeItem, describeItemDetails, makeItem } from "../core/items";
import { deserializeSave, serializeState } from "../core/persistence";
import { RNG } from "../core/rng";
import { Tile, type DungeonState, type GearItem, type MonsterState, type TimedBuff } from "../core/types";
import { floorOneScene } from "../scene/floor-one";
import {
  findFloorOnePath,
  floorOneSceneDoors,
  isFloorOneWalkable,
  sceneToGamePoint
} from "../scene/navigation";

function tinyDoorDungeon(): DungeonState {
  const width = 5;
  const height = 3;
  const tiles = new Uint8Array(width * height);
  tiles.fill(Tile.Wall);
  tiles[1 + width] = Tile.Floor;
  tiles[2 + width] = Tile.Door;
  tiles[3 + width] = Tile.Floor;
  const dungeon: DungeonState = {
    width,
    height,
    tiles,
    blockers: new Uint8Array(width * height),
    visible: new Uint8Array(width * height),
    memory: new Float32Array(width * height),
    tileVariants: new Uint16Array(width * height),
    rooms: [{ x: 1, y: 1, w: 3, h: 1, cx: 1, cy: 1 }],
    spawn: { x: 1, y: 1 },
    stairs: { x: 3, y: 1 }
  };
  updateBlockers(dungeon);
  return dungeon;
}

function weakAdjacentMonster(x: number, y: number): MonsterState {
  return {
    id: "test-monster",
    kind: "gutter-fiend",
    name: "Gutter Fiend",
    x,
    y,
    hp: 1,
    maxHp: 1,
    attack: 0,
    defense: 0,
    xp: 10,
    color: "#9aa16c",
    role: "melee",
    cooldown: 0
  };
}

describe("dungeon generation", () => {
  it("generates reachable stairs for floors 1-5", () => {
    for (let floor = 1; floor <= 5; floor += 1) {
      const dungeon = generateDungeon(floor, 522551);
      expect(reachable(dungeon, dungeon.spawn, dungeon.stairs)).toBe(true);
    }
  });
});

describe("doors and LOS", () => {
  it("closed doors block movement and line of sight", () => {
    const dungeon = tinyDoorDungeon();
    expect(blocksMove(dungeon, 2, 1)).toBe(true);
    expect(hasLineOfSight(dungeon, 1, 1, 3, 1)).toBe(false);
  });

  it("open doors unblock movement and line of sight", () => {
    const dungeon = tinyDoorDungeon();
    setTile(dungeon, 2, 1, Tile.OpenDoor);
    expect(blocksMove(dungeon, 2, 1)).toBe(false);
    expect(hasLineOfSight(dungeon, 1, 1, 3, 1)).toBe(true);
  });
});

describe("items and combat", () => {
  it("rolls item affixes deterministically from seed", () => {
    const first = makeItem(new RNG(12345), 4, "weapon");
    const second = makeItem(new RNG(12345), 4, "weapon");
    expect(second).toEqual(first);
  });

  it("rolls forced rarity gear through the normal deterministic affix path", () => {
    const first = makeItem(new RNG(6789), 1, "weapon", "Rare");
    const second = makeItem(new RNG(6789), 1, "weapon", "Rare");
    expect(second).toEqual(first);
    expect(first.kind).toBe("gear");
    if (first.kind !== "gear") return;
    expect(first.rarity).toBe("Rare");
    expect(first.affixes.length).toBe(2);
    expect(first.name.startsWith("Rare ")).toBe(true);
  });

  it("seeds the opening loadout with affixed gear for tooltip comparison", () => {
    const game = new TorchlineGame(77);
    const inventoryGear = game.state.player.inventory.filter(
      (item): item is GearItem => item.kind === "gear"
    );
    const equippedGear = Object.values(game.state.player.equipment).filter(
      (item): item is GearItem => item !== null
    );
    expect(inventoryGear.length).toBeGreaterThan(0);
    expect(inventoryGear.every((item) => item.rarity === "Common" || item.affixes.length > 0)).toBe(true);
    expect(equippedGear.every((item) => item.rarity === "Common" || item.affixes.length > 0)).toBe(true);
  });

  it("describes item affixes and per-stat deltas against equipped gear", () => {
    const equipped: GearItem = {
      id: "equipped",
      kind: "gear",
      slot: "weapon",
      rarity: "Fine",
      name: "Fine Ash Dirk",
      attack: 3,
      defense: 0,
      crit: 0.01,
      affixes: [{ id: "keen", name: "Keen", magnitude: 0.02, text: "+2% critical chance" }],
      color: "#7ed083"
    };
    const candidate: GearItem = {
      id: "candidate",
      kind: "gear",
      slot: "weapon",
      rarity: "Rare",
      name: "Rare Cinder Saber",
      attack: 5,
      defense: 0,
      crit: 0,
      affixes: [{ id: "ember", name: "Ember", magnitude: 3, text: "+3 attack from ember heat" }],
      color: "#75aee8"
    };

    expect(describeItem(candidate, equipped)).toEqual(
      expect.arrayContaining([
        "Rare Weapon",
        "Affixes",
        "Ember: +3 attack from ember heat",
        "Compared with Fine Ash Dirk",
        "+5 attack",
        "-3% critical",
        "+12 overall score"
      ])
    );
    expect(describeItemDetails(candidate, equipped)).toEqual(
      expect.arrayContaining([
        { text: "+5 attack", tone: "delta-positive" },
        { text: "-3% critical", tone: "delta-negative" },
        { text: "Ember: +3 attack from ember heat", tone: "affix" }
      ])
    );
  });

  it("combat damage, death, XP, and replay recording update core state", () => {
    const game = new TorchlineGame(42);
    const monster = weakAdjacentMonster(game.state.player.x + 1, game.state.player.y);
    game.state.monsters = [monster];
    const beforeActions = game.state.replay.actions.length;
    game.dispatch({ type: "move", dx: 1, dy: 0 });
    const effects = game.drainEffects();
    expect(game.state.monsters).toHaveLength(0);
    expect(game.state.kills).toBe(1);
    expect(game.state.player.xp).toBeGreaterThan(0);
    expect(game.state.replay.actions.length).toBe(beforeActions + 1);
    expect(
      effects.some(
        (effect) =>
          effect.type === "damage" &&
          effect.amount !== undefined &&
          effect.x === monster.x &&
          effect.y === monster.y
      )
    ).toBe(true);
    const deathOrLoot = effects.find((effect) => effect.type === "death" || effect.type === "loot-beam");
    expect(deathOrLoot).toBeDefined();
    expect(deathOrLoot?.x).toBe(monster.x);
    expect(deathOrLoot?.y).toBe(monster.y);
    expect(deathOrLoot?.color).toMatch(/^#/);
    expect(deathOrLoot?.type === "death" ? deathOrLoot.monsterKind : monster.kind).toBe(monster.kind);
  });

  it("keeps attack animation locked across realtime frames", () => {
    const game = new TorchlineGame(43);
    const monster = weakAdjacentMonster(game.state.player.x + 0.8, game.state.player.y);
    monster.hp = 5;
    monster.maxHp = 5;
    game.state.monsters = [monster];
    game.dispatch({ type: "targetActor", id: monster.id });
    const lock = game.state.player.animationLockMs ?? 0;
    expect(game.state.player.animation).toBe("attack");
    expect(lock).toBeGreaterThan(0);
    game.tickFrame(50);
    expect(game.state.player.animation).toBe("attack");
    expect(game.state.player.animationLockMs).toBeLessThan(lock);
  });

  it("keeps the loaded floor-one scene safe until the first player action", () => {
    const game = new TorchlineGame(44);
    const monster = weakAdjacentMonster(game.state.player.x + 0.8, game.state.player.y);
    monster.attack = 4;
    monster.attackCooldownMs = 0;
    monster.aggroRadius = 10;
    game.state.monsters = [monster];
    const hp = game.state.player.hp;

    for (let i = 0; i < 240; i += 1) game.tickFrame(50);

    expect(game.state.mode).toBe("playing");
    expect(game.state.player.hp).toBe(hp);
    expect(game.state.monsters[0]!.aiState).toBe("idle");

    game.dispatch({ type: "moveTo", x: game.state.player.x + 0.1, y: game.state.player.y });
    game.tickFrame(50);

    expect(game.state.turn).toBe(1);
    expect(game.state.player.hp).toBe(hp);

    for (let i = 0; i < 42; i += 1) game.tickFrame(50);

    expect(game.state.player.hp).toBeLessThan(hp);
  });

  it("death stops realtime progression and restart resets the curated run", () => {
    const game = new TorchlineGame(77);
    const seed = game.state.seed;
    const monster = weakAdjacentMonster(game.state.player.x + 0.8, game.state.player.y);
    monster.attack = 999;
    monster.attackCooldownMs = 0;
    monster.aiState = "chase";
    game.state.monsters = [monster];
    game.state.player.hp = 1;
    game.state.elapsedMs = 7000;
    const turnBeforeDeath = game.state.turn;

    game.tickFrame(50);
    const effects = game.drainEffects();

    expect(game.state.mode).toBe("dead");
    expect(game.state.player.hp).toBe(0);
    expect(game.state.player.animation).toBe("death");
    expect(game.state.player.moveTarget).toBeNull();
    expect(effects.some((effect) => effect.type === "death" && effect.audio === "hit-heavy")).toBe(true);

    const deadElapsed = game.state.elapsedMs;
    game.dispatch({ type: "moveTo", x: game.state.player.x + 2, y: game.state.player.y });
    game.tickFrame(500);
    expect(game.state.turn).toBe(turnBeforeDeath);
    expect(game.state.elapsedMs).toBe(deadElapsed);

    game.state.kills = 3;
    game.dispatch({ type: "restart" });
    expect(game.state.mode).toBe("playing");
    expect(game.state.seed).toBe(seed);
    expect(game.state.kills).toBe(0);
    expect(game.state.elapsedMs).toBe(0);
    expect(game.state.player.hp).toBeGreaterThan(0);
  });
});

describe("shrines, pause, and persistence", () => {
  it("places floor-one authored interactables at their visual scene positions", () => {
    const game = new TorchlineGame(77);
    const door = floorOneSceneDoors(game.state)[0]!;
    const shrinePoint = sceneToGamePoint(game.state, {
      x: floorOneScene.shrineHint.dx,
      y: floorOneScene.shrineHint.dy
    });
    expect(game.state.shrines[0]?.kind).toBe(floorOneScene.shrineHint.kind);
    expect(game.state.shrines[0]?.x).toBe(Math.round(shrinePoint.x));
    expect(game.state.shrines[0]?.y).toBe(Math.round(shrinePoint.y));
    expect(game.state.dungeon.stairs).toEqual(
      sceneToGamePoint(game.state, { x: Math.round(5.4), y: Math.round(4.6) })
    );
    expect(door.open).toBe(false);
    expect(game.state.dungeon.tiles[door.tile.y * game.state.dungeon.width + door.tile.x]).toBe(Tile.Door);
  });

  it("finds a floor-one path around authored prop blockers", () => {
    const game = new TorchlineGame(77);
    const target = sceneToGamePoint(game.state, { x: 0, y: -5.45 });
    const path = findFloorOnePath(game.state, game.state.player, target, 0.28);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    expect(path!.every((point) => isFloorOneWalkable(game.state, point, 0.28))).toBe(true);
  });

  it("opens the authored floor-one boss door through click-style interaction", () => {
    const game = new TorchlineGame(77);
    game.state.monsters = [];
    const door = floorOneSceneDoors(game.state)[0]!;
    game.state.player.x = door.tile.x + 1;
    game.state.player.y = door.tile.y;
    const actionsBefore = game.state.replay.actions.length;

    game.dispatch({ type: "interactAt", x: door.tile.x, y: door.tile.y });
    const openedDoor = floorOneSceneDoors(game.state)[0]!;
    const effects = game.drainEffects();

    expect(openedDoor.open).toBe(true);
    expect(getTile(game.state.dungeon, door.tile.x, door.tile.y)).toBe(Tile.OpenDoor);
    expect(game.state.turn).toBe(1);
    expect(game.state.replay.actions.length).toBe(actionsBefore + 1);
    expect(game.state.replay.actions.at(-1)?.action.type).toBe("interactAt");
    expect(effects.some((effect) => effect.type === "door" && effect.audio === "door-open")).toBe(true);
  });

  it("activates shrine buffs and expires them on turns", () => {
    const game = new TorchlineGame(77);
    game.state.monsters = [];
    const shrine = game.state.shrines[0]!;
    game.state.player.x = shrine.x;
    game.state.player.y = shrine.y;
    game.dispatch({ type: "activateShrine" });
    expect(shrine.used).toBe(true);
    expect(game.state.activeBuffs.length).toBeGreaterThan(0);
    game.state.monsters = [];
    for (let i = 0; i < 50; i += 1) game.dispatch({ type: "wait" });
    expect(game.state.activeBuffs).toHaveLength(0);
  });

  it("pause blocks simulation actions while UI actions remain possible", () => {
    const game = new TorchlineGame(88);
    game.dispatch({ type: "pause" });
    const turn = game.state.turn;
    game.dispatch({ type: "wait" });
    expect(game.state.turn).toBe(turn);
    game.dispatch({ type: "resume" });
    game.state.monsters = [];
    game.dispatch({ type: "wait" });
    expect(game.state.turn).toBe(turn + 1);
  });

  it("pause freezes realtime simulation clocks and timers", () => {
    const game = new TorchlineGame(89);
    game.state.monsters = [weakAdjacentMonster(game.state.player.x + 2, game.state.player.y)];
    game.state.monsters[0]!.attackCooldownMs = 900;
    game.state.player.attackCooldownMs = 700;
    game.state.player.abilityCooldownMs = 1100;
    game.state.activeBuffs = [
      {
        id: "pause-buff",
        source: "ember",
        name: "Pause Test",
        turnsRemaining: 4.5,
        color: "#f2a84b",
        modifiers: { attack: 1 }
      }
    ];
    game.dispatch({ type: "moveTo", x: game.state.player.x + 2, y: game.state.player.y + 1 });
    game.dispatch({ type: "pause" });

    const before = {
      elapsedMs: game.state.elapsedMs,
      replayElapsedMs: game.state.replay.elapsedMs,
      playerX: game.state.player.x,
      playerY: game.state.player.y,
      moveTarget: structuredClone(game.state.player.moveTarget),
      attackCooldownMs: game.state.player.attackCooldownMs,
      abilityCooldownMs: game.state.player.abilityCooldownMs,
      monsterAttackCooldownMs: game.state.monsters[0]!.attackCooldownMs,
      buffTurnsRemaining: game.state.activeBuffs[0]!.turnsRemaining
    };

    for (let i = 0; i < 20; i += 1) game.tickFrame(50);

    expect(game.state.elapsedMs).toBe(before.elapsedMs);
    expect(game.state.replay.elapsedMs).toBe(before.replayElapsedMs);
    expect(game.state.player.x).toBe(before.playerX);
    expect(game.state.player.y).toBe(before.playerY);
    expect(game.state.player.moveTarget).toEqual(before.moveTarget);
    expect(game.state.player.attackCooldownMs).toBe(before.attackCooldownMs);
    expect(game.state.player.abilityCooldownMs).toBe(before.abilityCooldownMs);
    expect(game.state.monsters[0]!.attackCooldownMs).toBe(before.monsterAttackCooldownMs);
    expect(game.state.activeBuffs[0]!.turnsRemaining).toBe(before.buffTurnsRemaining);
  });

  it("serializes and reloads save data with typed arrays restored", () => {
    const game = new TorchlineGame(99);
    game.state.monsters = [];
    game.state.kills = 2;
    game.dispatch({ type: "wait" });
    const save = serializeState(game.state);
    const loaded = new TorchlineGame(1);
    loaded.loadSavePayload(deserializeSave(save));
    expect(loaded.state.seed).toBe(99);
    expect(loaded.state.turn).toBe(game.state.turn);
    expect(loaded.state.kills).toBe(2);
    expect(loaded.state.dungeon.tiles).toBeInstanceOf(Uint8Array);
    expect(loaded.state.dungeon.memory).toBeInstanceOf(Float32Array);
  });

  it("rejects incompatible save data without replacing the active run", () => {
    const game = new TorchlineGame(99);
    game.state.monsters = [];
    game.dispatch({ type: "moveTo", x: game.state.player.x + 1.25, y: game.state.player.y + 0.75 });
    for (let i = 0; i < 4; i += 1) game.tickFrame(50);
    const before = {
      seed: game.state.seed,
      turn: game.state.turn,
      elapsedMs: game.state.elapsedMs,
      playerX: game.state.player.x,
      playerY: game.state.player.y,
      replayActions: game.state.replay.actions.length
    };

    const loaded = game.tryLoadSavePayload({
      version: 999,
      seed: 123,
      floor: 4,
      player: {},
      dungeon: {},
      replay: { seed: 123, status: "recording", elapsedMs: 0, actions: [] }
    });

    expect(loaded).toBe(false);
    expect(game.state.mode).toBe("playing");
    expect(game.state.seed).toBe(before.seed);
    expect(game.state.turn).toBe(before.turn);
    expect(game.state.elapsedMs).toBe(before.elapsedMs);
    expect(game.state.player.x).toBe(before.playerX);
    expect(game.state.player.y).toBe(before.playerY);
    expect(game.state.replay.actions).toHaveLength(before.replayActions);
    expect(game.state.debug.lastCommand).toBe("load-error");
    expect(game.state.error).toContain("Unsupported save version");
    expect(game.state.messages[0]).toContain("Load failed:");
  });

  it("round-trips real-time slice state for doors, shrines, buffs, monsters, items, and replay metadata", () => {
    const game = new TorchlineGame(123);
    const door = floorOneSceneDoors(game.state)[0]!;
    const shrine = game.state.shrines[0]!;
    setTile(game.state.dungeon, door.tile.x, door.tile.y, Tile.OpenDoor);
    shrine.used = true;
    const buff: TimedBuff = {
      id: "test-buff",
      source: "ember",
      name: "Test Ember",
      turnsRemaining: 8.5,
      color: "#f2a84b",
      modifiers: { attack: 2 }
    };
    game.state.activeBuffs = [buff];
    game.dispatch({ type: "moveTo", x: game.state.player.x + 1.5, y: game.state.player.y + 1.2 });
    for (let i = 0; i < 6; i += 1) game.tickFrame(50);
    const monster = game.state.monsters[0]!;
    monster.hp -= 3;
    const item = game.state.items.find((entry) => entry.x !== undefined && entry.y !== undefined)!;
    const save = serializeState(game.state);

    const loaded = new TorchlineGame(1);
    loaded.loadSavePayload(deserializeSave(save));
    const loadedDoor = floorOneSceneDoors(loaded.state)[0]!;
    expect(loadedDoor.open).toBe(true);
    expect(loaded.state.shrines[0]?.used).toBe(true);
    expect(loaded.state.activeBuffs[0]?.turnsRemaining).toBeCloseTo(buff.turnsRemaining, 3);
    expect(loaded.state.monsters.find((entry) => entry.id === monster.id)?.hp).toBe(monster.hp);
    expect(loaded.state.items.find((entry) => entry.id === item.id)?.x).toBe(item.x);
    expect(loaded.state.replay.actions.length).toBe(game.state.replay.actions.length);
    expect(loaded.state.replay.elapsedMs).toBe(game.state.replay.elapsedMs);
  });

  it("replays real-time click movement by advancing the recorded simulation clock", () => {
    const game = new TorchlineGame(222);
    const target = sceneToGamePoint(game.state, { x: 1.2, y: 1.4 });
    game.dispatch({ type: "moveTo", x: target.x, y: target.y });
    for (let i = 0; i < 18; i += 1) game.tickFrame(50);
    const expected = { x: game.state.player.x, y: game.state.player.y };
    const actionCount = game.state.replay.actions.length;

    game.replayFromStart();
    expect(game.state.replay.actions).toHaveLength(actionCount);
    expect(game.state.player.x).toBeCloseTo(expected.x, 3);
    expect(game.state.player.y).toBeCloseTo(expected.y, 3);
    expect(game.state.replay.elapsedMs).toBeCloseTo(900, 3);
  });
});

describe("asset manifest", () => {
  it("has existing local atlases and in-bounds frames", () => {
    expect(validateAtlasManifest()).toEqual([]);
  });
});
