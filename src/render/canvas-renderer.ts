import { drawFrame, type LoadedAtlas } from "../assets/asset-loader";
import { getTile, idx, inBounds } from "../core/dungeon";
import { calculatePlayerStats } from "../core/game";
import { visibleCount } from "../core/fov";
import { Tile, type EffectEvent, type GameState, type Item, type MonsterState, type ShrineState } from "../core/types";
import { EffectLayer } from "./effects";

type Viewport = {
  width: number;
  height: number;
  dpr: number;
};

type IsoPoint = {
  x: number;
  y: number;
};

type DrawCommand = {
  depth: number;
  draw: () => void;
};

type SpriteDrawOptions = {
  anchorY?: number;
  alpha?: number;
  blend?: GlobalCompositeOperation;
  flipX?: boolean;
  filter?: string;
  shadow?: boolean;
};

type HeroDressingKind =
  | "altar"
  | "coins"
  | "bones"
  | "candles"
  | "ghost"
  | "blood"
  | "rack"
  | "brazier"
  | "blueObelisk"
  | "fallenKnight"
  | "treasure"
  | "brokenArch";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function hash01(x: number, y: number, seed = 0): number {
  let h = Math.imul(x + 0x9e3779b1, 374761393) ^ Math.imul(y + 0x85ebca77, 668265263) ^ Math.imul(seed + 0xc2b2ae35, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isFloorish(tile: Tile): boolean {
  return tile === Tile.Floor || tile === Tile.OpenDoor || tile === Tile.Stairs || tile === Tile.ShrineFloor;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private viewport: Viewport = { width: 1, height: 1, dpr: 1 };
  private atlas: LoadedAtlas | null = null;
  private effects = new EffectLayer();
  private cameraX = 0;
  private cameraY = 0;
  private tileW = 86;
  private tileH = 43;
  private wallH = 96;
  private scale = 1;
  private cameraReady = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable.");
    this.ctx = context;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  loadAssets(atlas: LoadedAtlas): void {
    this.atlas = atlas;
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.floor(window.innerWidth);
    const height = Math.floor(window.innerHeight);
    this.viewport = { width, height, dpr };
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cameraReady = false;
  }

  render(state: GameState, events: EffectEvent[], dt: number, now: number): void {
    this.effects.add(events);
    this.effects.update(dt, state.mode === "paused");
    state.debug.fps = Math.round(1000 / Math.max(1, dt));
    state.debug.frameMs = Math.round(dt * 10) / 10;

    this.scale = clamp(Math.min(this.viewport.width / 1500, this.viewport.height / 860), 0.8, 1.18);
    this.tileW = 102 * this.scale;
    this.tileH = 51 * this.scale;
    this.wallH = 132 * this.scale;

    const target = this.projectTile(state.player.x + 0.5, state.player.y + 0.5);
    const targetX = target.x - this.viewport.width * 0.5;
    const targetY = target.y - this.viewport.height * 0.5;
    if (!this.cameraReady) {
      this.cameraX = targetX;
      this.cameraY = targetY;
      this.cameraReady = true;
    } else {
      this.cameraX += (targetX - this.cameraX) * 0.18;
      this.cameraY += (targetY - this.cameraY) * 0.18;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    ctx.fillStyle = "#020303";
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);
    this.drawBackdrop(ctx, now);

    const shake = this.effects.offset(now);
    ctx.save();
    ctx.translate(-this.cameraX + shake.x, -this.cameraY + shake.y);
    this.drawWorld(ctx, state, now);
    ctx.restore();

    this.drawAtmosphericFog(ctx, now);
    this.drawScreenVignette(ctx);
    if (state.debug.enabled) this.drawDebugText(ctx, state);
  }

  private drawWorld(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
    this.drawFloors(ctx, state);
    this.drawOpeningRoomGlaze(ctx, state, now);
    this.drawChamberShadows(ctx, state);
    this.drawLightSources(ctx, state, now);

    const commands = this.collectDrawCommands(ctx, state, now);
    commands.sort((a, b) => a.depth - b.depth);
    for (const command of commands) command.draw();

    this.drawFog(ctx, state);
    this.effects.draw(ctx, state, this.tileW, (x, y) => {
      const p = this.projectEntity(x, y);
      return { x: p.x, y: p.y, scale: this.tileW };
    });
    this.drawForegroundArchitecture(ctx, state, now);
    if (state.debug.enabled) this.drawDebugWorld(ctx, state);
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, now: number): void {
    const gradient = ctx.createRadialGradient(
      this.viewport.width * 0.5,
      this.viewport.height * 0.46,
      this.viewport.height * 0.1,
      this.viewport.width * 0.5,
      this.viewport.height * 0.48,
      Math.max(this.viewport.width, this.viewport.height) * 0.78
    );
    gradient.addColorStop(0, "#10100e");
    gradient.addColorStop(0.42, "#040706");
    gradient.addColorStop(1, "#000101");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = "#26353a";
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i += 1) {
      const x = ((i * 157 + Math.sin(now / 900 + i) * 20) % (this.viewport.width + 260)) - 130;
      ctx.beginPath();
      ctx.moveTo(x, this.viewport.height * 0.05);
      ctx.lineTo(x + this.viewport.height * 0.35, this.viewport.height * 0.78);
      ctx.stroke();
    }
    ctx.restore();
  }

  private projectTile(x: number, y: number): IsoPoint {
    return {
      x: (x - y) * (this.tileW / 2),
      y: (x + y) * (this.tileH / 2)
    };
  }

  private projectEntity(x: number, y: number): IsoPoint {
    const p = this.projectTile(x + 0.5, y + 0.5);
    return { x: p.x, y: p.y + this.tileH * 0.2 };
  }

  private tileVisibility(state: GameState, x: number, y: number): { visible: boolean; memory: number } {
    const index = idx(state.dungeon, x, y);
    return {
      visible: state.dungeon.visible[index] === 1,
      memory: state.dungeon.memory[index]
    };
  }

  private isInScreenMargin(p: IsoPoint, margin = 260): boolean {
    const sx = p.x - this.cameraX;
    const sy = p.y - this.cameraY;
    return sx > -margin && sy > -margin && sx < this.viewport.width + margin && sy < this.viewport.height + margin;
  }

  private diamondPath(ctx: CanvasRenderingContext2D, p: IsoPoint, width = this.tileW, height = this.tileH): void {
    const hw = width / 2;
    const hh = height / 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - hh);
    ctx.lineTo(p.x + hw, p.y);
    ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x - hw, p.y);
    ctx.closePath();
  }

  private drawFloors(ctx: CanvasRenderingContext2D, state: GameState): void {
    const d = state.dungeon;
    for (let y = 0; y < d.height; y += 1) {
      for (let x = 0; x < d.width; x += 1) {
        const tile = getTile(d, x, y);
        if (!isFloorish(tile) && tile !== Tile.Door) continue;
        const { visible, memory } = this.tileVisibility(state, x, y);
        if (memory <= 0.002) continue;
        const p = this.projectTile(x + 0.5, y + 0.5);
        if (!this.isInScreenMargin(p)) continue;
        const alpha = visible ? 1 : clamp(memory * 0.38, 0.14, 0.42);
        ctx.save();
        ctx.globalAlpha = alpha;
        this.drawFloorDiamond(ctx, state, x, y, tile, p, visible);
        if (visible) this.drawFloorScatter(ctx, state, x, y, p);
        ctx.restore();
      }
    }
  }

  private drawOpeningRoomGlaze(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
    if (state.floor !== 1) return;
    const room = state.dungeon.rooms[0];
    if (!room) return;
    const center = this.projectTile(room.cx + 0.5, room.cy + 0.5);
    if (!this.isInScreenMargin(center, 720)) return;

    const nw = this.projectTile(room.x, room.y);
    const ne = this.projectTile(room.x + room.w, room.y);
    const se = this.projectTile(room.x + room.w, room.y + room.h);
    const sw = this.projectTile(room.x, room.y + room.h);
    const player = this.projectEntity(state.player.x, state.player.y);
    const minX = Math.min(nw.x, ne.x, se.x, sw.x) - this.tileW * 1.4;
    const maxX = Math.max(nw.x, ne.x, se.x, sw.x) + this.tileW * 1.4;
    const minY = Math.min(nw.y, ne.y, se.y, sw.y) - this.wallH * 1.1;
    const maxY = Math.max(nw.y, ne.y, se.y, sw.y) + this.tileH * 1.5;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(sw.x, sw.y);
    ctx.closePath();
    ctx.clip();

    const ember = ctx.createRadialGradient(player.x + this.tileW * 0.1, player.y - this.tileH * 0.7, 0, player.x + this.tileW * 0.1, player.y - this.tileH * 0.45, this.tileW * 5.2);
    ember.addColorStop(0, "rgba(255, 206, 112, 0.26)");
    ember.addColorStop(0.25, "rgba(196, 92, 36, 0.16)");
    ember.addColorStop(0.62, "rgba(57, 31, 22, 0.1)");
    ember.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = ember;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

    const cold = ctx.createRadialGradient(ne.x - this.tileW * 1.6, ne.y + this.tileH * 2.4, 0, ne.x - this.tileW * 1.4, ne.y + this.tileH * 2.6, this.tileW * 3.8);
    cold.addColorStop(0, "rgba(71, 157, 185, 0.16)");
    cold.addColorStop(0.42, "rgba(24, 62, 76, 0.1)");
    cold.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = cold;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

    ctx.globalCompositeOperation = "multiply";
    const depth = ctx.createLinearGradient(center.x, nw.y - this.wallH * 0.6, center.x, se.y + this.tileH);
    depth.addColorStop(0, "rgba(0, 0, 0, 0.48)");
    depth.addColorStop(0.32, "rgba(45, 30, 18, 0.08)");
    depth.addColorStop(0.72, "rgba(0, 0, 0, 0.06)");
    depth.addColorStop(1, "rgba(0, 0, 0, 0.48)");
    ctx.fillStyle = depth;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < 34; i += 1) {
      const tx = room.x + 1 + Math.floor(hash01(i, state.seed, 901) * Math.max(1, room.w - 2));
      const ty = room.y + 1 + Math.floor(hash01(state.seed, i, 907) * Math.max(1, room.h - 2));
      const p = this.projectTile(tx + 0.5, ty + 0.5);
      if (!this.isInScreenMargin(p, 320)) continue;
      const roll = hash01(tx, ty, state.seed + 1191);
      ctx.save();
      ctx.translate(p.x, p.y + this.tileH * (roll - 0.5) * 0.18);
      ctx.rotate((roll - 0.5) * 0.7);
      ctx.globalAlpha = 0.16 + roll * 0.14;
      if (i % 7 === 0) {
        ctx.fillStyle = "rgba(80, 11, 7, 0.72)";
        ctx.beginPath();
        ctx.ellipse(0, this.tileH * 0.08, this.tileW * (0.12 + roll * 0.2), this.tileH * (0.04 + roll * 0.06), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (i % 5 === 0) {
        ctx.strokeStyle = "rgba(203, 163, 97, 0.46)";
        ctx.lineWidth = Math.max(1, this.scale);
        ctx.beginPath();
        ctx.ellipse(0, this.tileH * 0.04, this.tileW * 0.2, this.tileH * 0.1, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "rgba(5, 5, 4, 0.72)";
        ctx.lineWidth = 1.4 * this.scale;
        ctx.beginPath();
        ctx.moveTo(-this.tileW * 0.16, 0);
        ctx.lineTo(this.tileW * (0.1 + roll * 0.16), this.tileH * (roll - 0.35) * 0.45);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.36 + Math.sin(now / 420) * 0.04;
    ctx.strokeStyle = "rgba(238, 177, 82, 0.34)";
    ctx.lineWidth = 1.5 * this.scale;
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + this.tileH * 0.15, this.tileW * 1.18, this.tileH * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + this.tileH * 0.16, this.tileW * 0.74, this.tileH * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  private drawFloorDiamond(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, tile: Tile, p: IsoPoint, visible: boolean): void {
    const variant = state.dungeon.tileVariants[idx(state.dungeon, x, y)];
    const frameName =
      variant % 19 === 0
        ? "raster-floor-compass"
        : variant % 17 === 0
          ? "raster-floor-rune"
          : variant % 13 === 0
            ? "raster-floor-grate"
            : variant % 7 === 0
              ? "raster-floor-rubble"
              : variant % 2 === 0
                ? "raster-floor-slab"
                : "raster-floor-cracked";
    this.drawFloorBevel(ctx, p, visible);
    this.diamondPath(ctx, p);
    ctx.fillStyle = visible ? "#171512" : "#081017";
    ctx.fill();

    ctx.save();
    this.diamondPath(ctx, p);
    ctx.clip();
    ctx.globalAlpha *= visible ? 1 : 0.3;
    this.drawAtlas(frameName, p.x - this.tileW / 2, p.y - this.tileH / 2, this.tileW, this.tileH);
    if (!visible) {
      ctx.fillStyle = "rgba(7, 16, 22, 0.58)";
      ctx.fillRect(p.x - this.tileW / 2, p.y - this.tileH / 2, this.tileW, this.tileH);
    }
    ctx.restore();

    ctx.strokeStyle = visible ? "rgba(218, 178, 106, 0.1)" : "rgba(95, 129, 143, 0.1)";
    ctx.lineWidth = 1;
    this.diamondPath(ctx, p);
    ctx.stroke();

    if (tile === Tile.Stairs)
      this.drawRasterSprite(ctx, "sprite-stairs", { x: p.x, y: p.y + this.tileH * 0.32 }, this.tileW * 0.8, this.wallH * 0.96, 0.9, {
        alpha: 1,
        blend: "source-over",
        filter: this.architectureFilter(visible)
      });
    if (tile === Tile.ShrineFloor) this.drawRuneRing(ctx, p, "#68d7ba", 0.46);
  }

  private drawFloorBevel(ctx: CanvasRenderingContext2D, p: IsoPoint, visible: boolean): void {
    const lip = this.tileH * 0.16;
    const hw = this.tileW / 2;
    const hh = this.tileH / 2;
    ctx.save();
    ctx.globalAlpha *= visible ? 0.92 : 0.55;
    const right = ctx.createLinearGradient(p.x, p.y, p.x + hw, p.y + hh + lip);
    right.addColorStop(0, visible ? "rgba(87, 68, 42, 0.42)" : "rgba(18, 28, 32, 0.35)");
    right.addColorStop(1, "rgba(0, 0, 0, 0.56)");
    ctx.fillStyle = right;
    ctx.beginPath();
    ctx.moveTo(p.x + hw, p.y);
    ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x, p.y + hh + lip);
    ctx.lineTo(p.x + hw, p.y + lip);
    ctx.closePath();
    ctx.fill();

    const left = ctx.createLinearGradient(p.x, p.y, p.x - hw, p.y + hh + lip);
    left.addColorStop(0, visible ? "rgba(48, 39, 29, 0.46)" : "rgba(10, 18, 22, 0.42)");
    left.addColorStop(1, "rgba(0, 0, 0, 0.68)");
    ctx.fillStyle = left;
    ctx.beginPath();
    ctx.moveTo(p.x - hw, p.y);
    ctx.lineTo(p.x, p.y + hh);
    ctx.lineTo(p.x, p.y + hh + lip);
    ctx.lineTo(p.x - hw, p.y + lip);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawFloorScatter(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, p: IsoPoint): void {
    const h = hash01(x, y, state.seed + 911);
    if (h < 0.38) return;
    ctx.save();
    ctx.globalAlpha *= 0.72;
    if (h > 0.93) {
      ctx.fillStyle = "rgba(77, 20, 14, 0.34)";
      ctx.beginPath();
      ctx.ellipse(p.x + this.tileW * (hash01(y, x, state.seed) - 0.5) * 0.38, p.y + this.tileH * 0.12, this.tileW * 0.14, this.tileH * 0.08, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (h > 0.82) {
      ctx.strokeStyle = "rgba(177, 157, 116, 0.5)";
      ctx.lineWidth = 2 * this.scale;
      for (let i = 0; i < 3; i += 1) {
        const px = p.x + (hash01(x + i, y, state.seed) - 0.5) * this.tileW * 0.46;
        const py = p.y + (hash01(x, y + i, state.seed) - 0.5) * this.tileH * 0.42;
        ctx.beginPath();
        ctx.moveTo(px - this.tileW * 0.06, py);
        ctx.lineTo(px + this.tileW * 0.06, py + this.tileH * 0.06);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "rgba(176, 139, 78, 0.28)";
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.arc(p.x + (hash01(x + i, y, state.seed) - 0.5) * this.tileW * 0.56, p.y + (hash01(x, y + i, state.seed) - 0.5) * this.tileH * 0.34, this.scale * (1.4 + h * 2.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawChamberShadows(ctx: CanvasRenderingContext2D, state: GameState): void {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    for (const room of state.dungeon.rooms) {
      const center = this.projectTile(room.cx + 0.5, room.cy + 0.5);
      if (!this.isInScreenMargin(center, 620)) continue;
      const radius = Math.max(room.w, room.h) * this.tileW * 0.5;
      const gradient = ctx.createRadialGradient(center.x, center.y, radius * 0.1, center.x, center.y, radius);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(1, "rgba(0,0,0,0.42)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, radius * 1.1, radius * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private collectDrawCommands(ctx: CanvasRenderingContext2D, state: GameState, now: number): DrawCommand[] {
    const commands: DrawCommand[] = [];
    const d = state.dungeon;
    for (let y = 0; y < d.height; y += 1) {
      for (let x = 0; x < d.width; x += 1) {
        const tile = getTile(d, x, y);
        const vis = this.tileVisibility(state, x, y);
        if (vis.memory <= 0.002) continue;
        if ((tile === Tile.Wall || tile === Tile.Door || tile === Tile.OpenDoor) && this.hasRememberedFloorNeighbor(state, x, y)) {
          const p = this.projectTile(x + 0.5, y + 0.5);
          if (this.isInScreenMargin(p, 360)) {
            commands.push({ depth: x + y + 0.12, draw: () => this.drawWallOrDoor(ctx, state, x, y, tile, p, vis.visible, vis.memory, now) });
          }
        } else if (isFloorish(tile) && vis.visible) {
          const propRoll = hash01(x, y, state.seed + 4217);
          if (propRoll > 0.78 && Math.abs(x - state.player.x) + Math.abs(y - state.player.y) > 1) {
            const p = this.projectEntity(x, y);
            if (this.isInScreenMargin(p, 220)) commands.push({ depth: x + y + 0.35, draw: () => this.drawSetDressing(ctx, p, propRoll, now) });
          }
        }
      }
    }

    this.addOpeningArchitecture(commands, ctx, state, now);
    this.addHeroRoomDressing(commands, ctx, state, now);

    for (const shrine of state.shrines) {
      const vis = this.tileVisibility(state, shrine.x, shrine.y);
      if (vis.memory <= 0.002) continue;
      const p = this.projectEntity(shrine.x, shrine.y);
      if (this.isInScreenMargin(p, 220)) commands.push({ depth: shrine.x + shrine.y + 0.45, draw: () => this.drawShrine(ctx, shrine, p, vis.visible, vis.memory, now) });
    }

    for (const item of state.items) {
      if (item.x === undefined || item.y === undefined) continue;
      const vis = this.tileVisibility(state, item.x, item.y);
      if (vis.memory <= 0.002) continue;
      const p = this.projectEntity(item.x, item.y);
      if (this.isInScreenMargin(p, 220)) commands.push({ depth: item.x + item.y + 0.5, draw: () => this.drawItem(ctx, item, p, vis.visible, vis.memory, now) });
    }

    for (const monster of state.monsters) {
      const vis = this.tileVisibility(state, monster.x, monster.y);
      if (vis.memory <= 0.002) continue;
      const p = this.projectEntity(monster.x, monster.y);
      if (this.isInScreenMargin(p, 260)) commands.push({ depth: monster.x + monster.y + 0.64, draw: () => this.drawMonster(ctx, monster, p, vis.visible, vis.memory, now) });
    }

    const playerPoint = this.projectEntity(state.player.x, state.player.y);
    commands.push({ depth: state.player.x + state.player.y + 0.68, draw: () => this.drawPlayer(ctx, state, playerPoint, now) });
    return commands;
  }

  private addOpeningArchitecture(commands: DrawCommand[], ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
    if (state.floor !== 1) return;
    const room = state.dungeon.rooms[0];
    if (!room) return;

    const topY = room.y - 1;
    for (let x = room.x - 1; x <= room.x + room.w; x += 1) {
      if ((x - room.x) % 8 === 4) continue;
      const p = this.projectTile(x + 0.5, topY + 0.65);
      if (!this.isInScreenMargin(p, 420)) continue;
      commands.push({ depth: x + topY - 0.18, draw: () => this.drawWallBlock(ctx, state, x, topY, p, true, now, false, false) });
    }

    const innerTopY = room.y;
    for (let x = room.x + 1; x <= room.x + room.w - 2; x += 3) {
      const p = this.projectTile(x + 0.5, innerTopY + 0.25);
      if (!this.isInScreenMargin(p, 380)) continue;
      commands.push({ depth: x + innerTopY - 0.08, draw: () => this.drawBrokenButtress(ctx, p, x, state.seed + 617, now, x > room.cx, false) });
    }

    const leftX = room.x - 1;
    for (let y = room.y + 1; y <= room.y + room.h - 1; y += 1) {
      if ((y - room.y) % 4 === 2) continue;
      const p = this.projectTile(leftX + 0.55, y + 0.5);
      if (!this.isInScreenMargin(p, 360)) continue;
      commands.push({ depth: leftX + y + 0.02, draw: () => this.drawBrokenButtress(ctx, p, y, state.seed, now, false, true) });
    }

    const rightX = room.x + room.w;
    for (let y = room.y + 1; y <= room.y + room.h; y += 1) {
      if ((y - room.y) % 4 === 1) continue;
      const p = this.projectTile(rightX + 0.35, y + 0.5);
      if (!this.isInScreenMargin(p, 360)) continue;
      commands.push({ depth: rightX + y + 0.04, draw: () => this.drawBrokenButtress(ctx, p, y, state.seed + 211, now, true, true) });
    }
  }

  private addHeroRoomDressing(commands: DrawCommand[], ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
    if (state.floor !== 1) return;
    const room = state.dungeon.rooms[0];
    if (!room) return;
    const placements: { dx: number; dy: number; kind: HeroDressingKind }[] = [
      { dx: 0, dy: -5, kind: "brazier" },
      { dx: -6, dy: -4, kind: "blueObelisk" },
      { dx: 6, dy: -3, kind: "brokenArch" },
      { dx: -4, dy: -2, kind: "altar" },
      { dx: 4, dy: 1, kind: "coins" },
      { dx: 6, dy: 2, kind: "treasure" },
      { dx: -2, dy: 3, kind: "bones" },
      { dx: 2, dy: -2, kind: "candles" },
      { dx: 5, dy: 2, kind: "ghost" },
      { dx: -5, dy: 3, kind: "fallenKnight" },
      { dx: 0, dy: -3, kind: "blood" },
      { dx: -4, dy: 1, kind: "rack" }
    ];

    for (const placement of placements) {
      const x = clamp(state.dungeon.spawn.x + placement.dx, room.x + 1, room.x + room.w - 2);
      const y = clamp(state.dungeon.spawn.y + placement.dy, room.y + 1, room.y + room.h - 2);
      if (this.tileVisibility(state, x, y).memory <= 0.002 || !isFloorish(getTile(state.dungeon, x, y))) continue;
      const p = this.projectEntity(x, y);
      if (!this.isInScreenMargin(p, 260)) continue;
      commands.push({ depth: x + y + 0.38, draw: () => this.drawHeroDressing(ctx, placement.kind, p, x, y, state.seed, now) });
    }
  }

  private hasRememberedFloorNeighbor(state: GameState, x: number, y: number): boolean {
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (ox === 0 && oy === 0) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (!inBounds(state.dungeon, nx, ny)) continue;
        const tile = getTile(state.dungeon, nx, ny);
        if (isFloorish(tile) && state.dungeon.memory[idx(state.dungeon, nx, ny)] > 0.002) return true;
      }
    }
    return false;
  }

  private hasRememberedWalkableNeighbor(state: GameState, x: number, y: number): boolean {
    if (!inBounds(state.dungeon, x, y)) return false;
    const tile = getTile(state.dungeon, x, y);
    return (isFloorish(tile) || tile === Tile.Door) && state.dungeon.memory[idx(state.dungeon, x, y)] > 0.002;
  }

  private shouldFlipWallSprite(state: GameState, x: number, y: number): boolean {
    const west = this.hasRememberedWalkableNeighbor(state, x - 1, y);
    const east = this.hasRememberedWalkableNeighbor(state, x + 1, y);
    const north = this.hasRememberedWalkableNeighbor(state, x, y - 1);
    const south = this.hasRememberedWalkableNeighbor(state, x, y + 1);
    if (west && !east) return true;
    if (north && !south) return true;
    return false;
  }

  private shouldUseSideWallSprite(state: GameState, x: number, y: number): boolean {
    const west = this.hasRememberedWalkableNeighbor(state, x - 1, y);
    const east = this.hasRememberedWalkableNeighbor(state, x + 1, y);
    const north = this.hasRememberedWalkableNeighbor(state, x, y - 1);
    const south = this.hasRememberedWalkableNeighbor(state, x, y + 1);
    return (west || east) && !(north || south);
  }

  private sideWallFrame(frame: string): string {
    if (frame === "sprite-wall-torch") return "sprite-wall-torch-side";
    if (frame === "sprite-wall-banner") return "sprite-wall-banner-side";
    if (frame === "sprite-wall-arch") return "sprite-wall-arch-side";
    if (frame === "sprite-wall-broken") return "sprite-wall-broken-side";
    return frame;
  }

  private architectureFilter(visible: boolean): string {
    return visible ? "brightness(0.84) contrast(1.28) saturate(0.96)" : "brightness(0.3) contrast(1.16) saturate(0.56)";
  }

  private actorFilter(visible: boolean): string {
    return visible ? "brightness(0.9) contrast(1.22) saturate(1.04)" : "brightness(0.34) contrast(1.14) saturate(0.58)";
  }

  private drawBrokenButtress(ctx: CanvasRenderingContext2D, p: IsoPoint, variant: number, seed: number, now: number, flipX = false, sideFacing = false): void {
    const h = this.wallH * (0.72 + hash01(seed, variant, 313) * 0.34);
    const lean = (hash01(variant, seed, 317) - 0.5) * this.tileW * 0.12;
    ctx.save();
    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.2, this.tileW * 0.34, this.tileH * 0.13, 0.7);
    const baseFrame = hash01(variant, seed, 319) > 0.72 ? "sprite-wall-torch" : "sprite-wall-broken";
    const frame = sideFacing ? this.sideWallFrame(baseFrame) : baseFrame;
    this.drawRasterSprite(ctx, frame, { x: p.x + lean, y: p.y + this.tileH * 0.24 }, this.tileW * (sideFacing ? 0.86 : 0.8), h * 1.24, 0.92, {
      alpha: 1,
      blend: "source-over",
      flipX,
      filter: this.architectureFilter(true)
    });
    if (baseFrame === "sprite-wall-torch") this.drawSoftGlow(ctx, p.x + lean, p.y - h * 0.34, this.tileW * 0.45, "#f2a84b", 0.18 + Math.sin(now / 100 + variant) * 0.03);
    ctx.restore();
  }

  private drawWallOrDoor(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    x: number,
    y: number,
    tile: Tile,
    p: IsoPoint,
    visible: boolean,
    memory: number,
    now: number
  ): void {
    const flipX = this.shouldFlipWallSprite(state, x, y);
    const sideFacing = this.shouldUseSideWallSprite(state, x, y);
    ctx.save();
    ctx.globalAlpha = memory > 0.002 ? 1 : 0;
    if (tile === Tile.Door || tile === Tile.OpenDoor) {
      this.drawDoor(ctx, p, tile === Tile.OpenDoor, now, visible, flipX, sideFacing);
    } else {
      this.drawWallBlock(ctx, state, x, y, p, visible, now, flipX, sideFacing);
    }
    ctx.restore();
  }

  private drawWallBlock(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, p: IsoPoint, visible: boolean, now: number, flipX = false, sideFacing = false): void {
    const h = this.wallH * (0.94 + hash01(x, y, state.seed) * 0.22);
    const roll = hash01(x, y, state.seed + 173);
    const baseFrame =
      visible && hash01(x, y, state.seed + 31) > 0.84
        ? "sprite-wall-torch"
        : roll > 0.78
          ? "sprite-wall-banner"
          : roll > 0.48
            ? "sprite-wall-arch"
            : "sprite-wall-broken";
    const frame = sideFacing ? this.sideWallFrame(baseFrame) : baseFrame;

    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.18, this.tileW * 0.48, this.tileH * 0.18, visible ? 0.72 : 0.48);
    this.drawRasterSprite(ctx, frame, { x: p.x, y: p.y + this.tileH * 0.22 }, this.tileW * (sideFacing ? 1.04 : 1.08), h * 1.22, 0.92, {
      alpha: 1,
      blend: "source-over",
      flipX,
      filter: this.architectureFilter(visible)
    });
    if (baseFrame === "sprite-wall-torch" && visible) this.drawSoftGlow(ctx, p.x, p.y - h * 0.36, this.tileW * 0.56, "#f2a84b", 0.22 + Math.sin(now / 90 + x) * 0.04);
    if (visible && hash01(x, y, state.seed + 89) > 0.93) this.drawHangingChain(ctx, { x: p.x + (hash01(y, x, state.seed) - 0.5) * this.tileW * 0.22, y: p.y - h * 0.72 });
  }

  private drawDoor(ctx: CanvasRenderingContext2D, p: IsoPoint, open: boolean, now: number, visible: boolean, flipX = false, sideFacing = false): void {
    const w = this.tileW * (open ? 0.92 : 1.06);
    const h = this.wallH * 1.18;
    const baseY = p.y + this.tileH * 0.2;
    ctx.save();
    this.drawShadow(ctx, p.x, baseY, w * 0.48, this.tileH * 0.2, 0.7);
    const frame = sideFacing ? "sprite-wall-arch-side" : open ? "sprite-wall-arch" : "sprite-door-boss";
    this.drawRasterSprite(ctx, frame, { x: p.x, y: baseY }, w, h, 0.92, {
      alpha: 1,
      blend: "source-over",
      flipX,
      filter: this.architectureFilter(visible)
    });
    if (open) this.drawSoftGlow(ctx, p.x, baseY - h * 0.42, w * (0.62 + Math.sin(now / 250) * 0.05), "#ffaa4a", 0.28);
    ctx.restore();
  }

  private drawHangingChain(ctx: CanvasRenderingContext2D, p: IsoPoint): void {
    ctx.save();
    ctx.strokeStyle = "rgba(126, 103, 72, 0.42)";
    ctx.lineWidth = 2 * this.scale;
    for (let i = 0; i < 6; i += 1) {
      ctx.beginPath();
      ctx.ellipse(p.x + Math.sin(i) * 1.2, p.y + i * this.scale * 8, this.scale * 3, this.scale * 5, i % 2 ? 0 : Math.PI / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSetDressing(ctx: CanvasRenderingContext2D, p: IsoPoint, roll: number, now: number): void {
    ctx.save();
    if (roll > 0.985) {
      this.drawPillar(ctx, p);
    } else if (roll > 0.955) {
      this.drawRasterSprite(ctx, "sprite-candles", p, this.tileW * 0.56, this.tileW * 0.62, 0.9, {
        alpha: 1,
        blend: "source-over",
        filter: this.architectureFilter(true)
      });
      this.drawSoftGlow(ctx, p.x, p.y - this.tileH * 0.28, this.tileW * 0.28, "#f2a84b", 0.16 + Math.sin(now / 100) * 0.03);
    } else if (roll > 0.93) {
      this.drawRasterSprite(ctx, "sprite-bones", p, this.tileW * 0.78, this.tileW * 0.52, 0.76, {
        alpha: 1,
        blend: "source-over",
        filter: this.architectureFilter(true)
      });
    } else {
      this.drawRasterSprite(ctx, "sprite-bones", p, this.tileW * 0.56, this.tileW * 0.36, 0.78, {
        alpha: 0.92,
        blend: "source-over",
        filter: this.architectureFilter(true)
      });
    }
    ctx.restore();
  }

  private drawHeroDressing(
    ctx: CanvasRenderingContext2D,
    kind: HeroDressingKind,
    p: IsoPoint,
    x: number,
    y: number,
    seed: number,
    now: number
  ): void {
    ctx.save();
    if (kind === "altar") {
      this.drawShadow(ctx, p.x, p.y + this.tileH * 0.16, this.tileW * 0.38, this.tileH * 0.14, 0.58);
      const grad = ctx.createLinearGradient(p.x - this.tileW * 0.3, p.y - this.tileH * 1.2, p.x + this.tileW * 0.3, p.y + this.tileH * 0.1);
      grad.addColorStop(0, "#746044");
      grad.addColorStop(0.45, "#2b2923");
      grad.addColorStop(1, "#090909");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - this.tileH * 1.25);
      ctx.lineTo(p.x + this.tileW * 0.28, p.y - this.tileH * 0.7);
      ctx.lineTo(p.x + this.tileW * 0.2, p.y + this.tileH * 0.06);
      ctx.lineTo(p.x - this.tileW * 0.2, p.y + this.tileH * 0.06);
      ctx.lineTo(p.x - this.tileW * 0.28, p.y - this.tileH * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(217, 160, 76, 0.35)";
      ctx.lineWidth = 2 * this.scale;
      ctx.stroke();
      this.drawRuneRing(ctx, { x: p.x, y: p.y - this.tileH * 0.18 }, "#e76632", 0.32);
    } else if (kind === "coins") {
      this.drawRasterSprite(ctx, "sprite-gold", p, this.tileW * 0.72, this.tileW * 0.52, 0.76, { alpha: 1, blend: "source-over", filter: this.architectureFilter(true) });
      this.drawSoftGlow(ctx, p.x, p.y - this.tileH * 0.04, this.tileW * 0.42, "#ffd66c", 0.12);
    } else if (kind === "bones") {
      this.drawRasterSprite(ctx, "sprite-skulls", p, this.tileW * 0.8, this.tileW * 0.5, 0.74, { alpha: 1, blend: "source-over", filter: this.architectureFilter(true) });
    } else if (kind === "candles") {
      this.drawRasterSprite(ctx, "sprite-candles", p, this.tileW * 0.64, this.tileW * 0.72, 0.9, { alpha: 1, blend: "source-over", filter: this.architectureFilter(true) });
      this.drawSoftGlow(ctx, p.x, p.y - this.tileH * 0.28, this.tileW * 0.38, "#ffd17a", 0.18 + Math.sin(now / 120) * 0.03);
    } else if (kind === "ghost") {
      this.drawSpectralWraith(ctx, p, now);
    } else if (kind === "blood") {
      this.drawBloodSmear(ctx, p, seed + x * 11 + y * 23);
    } else if (kind === "rack") {
      this.drawWeaponRack(ctx, p);
    } else if (kind === "brazier") {
      this.drawRitualBrazier(ctx, p, now);
    } else if (kind === "blueObelisk") {
      this.drawBlueObelisk(ctx, p, now);
    } else if (kind === "fallenKnight") {
      this.drawFallenKnight(ctx, p, seed + x * 17 + y * 29);
    } else if (kind === "treasure") {
      this.drawRasterSprite(ctx, "sprite-treasure", p, this.tileW * 0.9, this.tileW * 0.68, 0.78, { alpha: 1, blend: "source-over", filter: this.architectureFilter(true) });
      this.drawSoftGlow(ctx, p.x, p.y - this.tileH * 0.12, this.tileW * 0.5, "#ffd66c", 0.14);
    } else {
      this.drawRasterSprite(ctx, "sprite-wall-arch", p, this.tileW * 0.82, this.wallH * 1.02, 0.9, {
        alpha: 1,
        blend: "source-over",
        flipX: hash01(x, y, seed + 379) > 0.5,
        filter: this.architectureFilter(true)
      });
      this.drawSoftGlow(ctx, p.x - this.tileW * 0.18, p.y - this.tileH * 0.2, this.tileW * 0.28, "#f2a84b", 0.12 + Math.sin(now / 140) * 0.03);
    }
    ctx.restore();
  }

  private drawSkull(ctx: CanvasRenderingContext2D, p: IsoPoint, size: number): void {
    ctx.save();
    ctx.fillStyle = "rgba(214, 197, 157, 0.8)";
    ctx.strokeStyle = "rgba(50, 40, 28, 0.74)";
    ctx.lineWidth = 1.5 * this.scale;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size, size * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(8, 8, 7, 0.82)";
    ctx.beginPath();
    ctx.ellipse(p.x - size * 0.34, p.y - size * 0.12, size * 0.18, size * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + size * 0.34, p.y - size * 0.12, size * 0.18, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawSpectralWraith(ctx: CanvasRenderingContext2D, p: IsoPoint, now: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const sway = Math.sin(now / 600) * this.tileW * 0.04;
    const grad = ctx.createRadialGradient(p.x + sway, p.y - this.tileH * 0.58, 0, p.x + sway, p.y - this.tileH * 0.38, this.tileW * 0.7);
    grad.addColorStop(0, "rgba(143, 251, 255, 0.44)");
    grad.addColorStop(0.42, "rgba(59, 189, 205, 0.24)");
    grad.addColorStop(1, "rgba(59, 189, 205, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(p.x + sway, p.y - this.tileH * 0.42, this.tileW * 0.54, this.tileH * 0.92, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(179, 252, 255, 0.46)";
    ctx.lineWidth = 2 * this.scale;
    for (let i = 0; i < 5; i += 1) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(p.x - this.tileW * (0.25 - t * 0.1) + sway, p.y - this.tileH * (0.8 - t * 0.28));
      ctx.quadraticCurveTo(p.x + this.tileW * (0.1 + t * 0.15) + sway, p.y - this.tileH * (0.3 - t * 0.08), p.x - this.tileW * 0.18 + t * this.tileW * 0.12 + sway, p.y + this.tileH * 0.24);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawBloodSmear(ctx: CanvasRenderingContext2D, p: IsoPoint, seed: number): void {
    ctx.save();
    ctx.fillStyle = "rgba(82, 13, 9, 0.48)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + this.tileH * 0.1, this.tileW * 0.34, this.tileH * 0.13, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(107, 23, 13, 0.5)";
    ctx.lineWidth = 2 * this.scale;
    for (let i = 0; i < 6; i += 1) {
      const ox = (hash01(i, seed, 97) - 0.5) * this.tileW * 0.42;
      const oy = (hash01(seed, i, 101) - 0.5) * this.tileH * 0.18;
      ctx.beginPath();
      ctx.moveTo(p.x + ox, p.y + oy);
      ctx.lineTo(p.x + ox + (hash01(i, seed, 103) - 0.5) * this.tileW * 0.36, p.y + oy + this.tileH * 0.18);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawWeaponRack(ctx: CanvasRenderingContext2D, p: IsoPoint): void {
    ctx.save();
    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.18, this.tileW * 0.32, this.tileH * 0.1, 0.48);
    ctx.strokeStyle = "rgba(126, 82, 43, 0.78)";
    ctx.lineWidth = 4 * this.scale;
    ctx.beginPath();
    ctx.moveTo(p.x - this.tileW * 0.22, p.y + this.tileH * 0.1);
    ctx.lineTo(p.x - this.tileW * 0.18, p.y - this.tileH * 0.72);
    ctx.moveTo(p.x + this.tileW * 0.22, p.y + this.tileH * 0.1);
    ctx.lineTo(p.x + this.tileW * 0.18, p.y - this.tileH * 0.72);
    ctx.moveTo(p.x - this.tileW * 0.28, p.y - this.tileH * 0.38);
    ctx.lineTo(p.x + this.tileW * 0.28, p.y - this.tileH * 0.38);
    ctx.stroke();
    ctx.strokeStyle = "rgba(215, 199, 166, 0.72)";
    ctx.lineWidth = 3 * this.scale;
    ctx.beginPath();
    ctx.moveTo(p.x - this.tileW * 0.15, p.y - this.tileH * 0.12);
    ctx.lineTo(p.x + this.tileW * 0.16, p.y - this.tileH * 0.85);
    ctx.moveTo(p.x + this.tileW * 0.12, p.y - this.tileH * 0.06);
    ctx.lineTo(p.x - this.tileW * 0.16, p.y - this.tileH * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  private drawRitualBrazier(ctx: CanvasRenderingContext2D, p: IsoPoint, now: number): void {
    ctx.save();
    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.22, this.tileW * 0.46, this.tileH * 0.18, 0.62);
    this.drawRasterSprite(ctx, "sprite-brazier", p, this.tileW * 1.05, this.tileW * 0.82, 0.78, { alpha: 1, blend: "source-over", filter: this.architectureFilter(true) });
    const pulse = 0.92 + Math.sin(now / 80) * 0.08;
    this.drawSoftGlow(ctx, p.x, p.y - this.tileH * 0.62, this.tileW * 1.05 * pulse, "#ff8b2d", 0.42);
    ctx.restore();
  }

  private drawBlueObelisk(ctx: CanvasRenderingContext2D, p: IsoPoint, now: number): void {
    ctx.save();
    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.2, this.tileW * 0.36, this.tileH * 0.12, 0.58);
    this.drawRasterSprite(ctx, "sprite-obelisk", p, this.tileW * 0.72, this.tileW * 0.92, 0.88, { alpha: 1, blend: "source-over", filter: this.architectureFilter(true) });
    const pulse = 0.88 + Math.sin(now / 260) * 0.1;
    this.drawSoftGlow(ctx, p.x, p.y - this.wallH * 0.54, this.tileW * 0.8 * pulse, "#75c9e8", 0.28);
    this.drawRuneRing(ctx, { x: p.x, y: p.y + this.tileH * 0.08 }, "#75c9e8", 0.42);
    ctx.restore();
  }

  private drawFallenKnight(ctx: CanvasRenderingContext2D, p: IsoPoint, seed: number): void {
    ctx.save();
    ctx.translate(p.x, p.y + this.tileH * 0.08);
    ctx.rotate(-0.24);
    this.drawShadow(ctx, 0, this.tileH * 0.1, this.tileW * 0.4, this.tileH * 0.1, 0.48);
    ctx.strokeStyle = "rgba(198, 179, 139, 0.74)";
    ctx.lineWidth = 5 * this.scale;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-this.tileW * 0.24, -this.tileH * 0.1);
    ctx.lineTo(this.tileW * 0.28, this.tileH * 0.04);
    ctx.moveTo(-this.tileW * 0.08, this.tileH * 0.03);
    ctx.lineTo(-this.tileW * 0.22, this.tileH * 0.22);
    ctx.moveTo(this.tileW * 0.1, this.tileH * 0.08);
    ctx.lineTo(this.tileW * 0.28, this.tileH * 0.24);
    ctx.stroke();
    ctx.fillStyle = "rgba(49, 45, 38, 0.9)";
    ctx.strokeStyle = "rgba(211, 171, 91, 0.42)";
    ctx.lineWidth = 2 * this.scale;
    ctx.beginPath();
    ctx.ellipse(0, -this.tileH * 0.08, this.tileW * 0.18, this.tileH * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this.drawSkull(ctx, { x: -this.tileW * 0.32 + hash01(seed, 1, 1) * this.tileW * 0.04, y: -this.tileH * 0.18 }, this.tileW * 0.1);
    ctx.restore();
  }

  private drawPillar(ctx: CanvasRenderingContext2D, p: IsoPoint): void {
    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.18, this.tileW * 0.28, this.tileH * 0.12, 0.5);
    this.drawRasterSprite(ctx, "sprite-wall-broken", p, this.tileW * 0.52, this.wallH * 0.78, 0.9, { alpha: 1, blend: "source-over", filter: this.architectureFilter(true) });
  }

  private drawShrine(ctx: CanvasRenderingContext2D, shrine: ShrineState, p: IsoPoint, visible: boolean, memory: number, now: number): void {
    ctx.save();
    ctx.globalAlpha = memory > 0.002 ? 1 : 0;
    this.drawRuneRing(ctx, p, shrine.used ? "#63706a" : shrine.color, visible ? (shrine.used ? 0.22 : 0.72) : 0.22);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + this.tileH * 0.18, this.tileW * 0.26, this.tileH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    this.drawRasterSprite(ctx, "sprite-obelisk", p, this.tileW * 0.48, this.tileW * 0.7, 0.88, {
      alpha: 1,
      blend: "source-over",
      filter: shrine.used ? "brightness(0.58) contrast(1.08) saturate(0.62)" : this.actorFilter(visible)
    });
    if (!shrine.used && visible) {
      this.drawSoftGlow(ctx, p.x, p.y - this.tileH * 0.5, this.tileW * (0.65 + Math.sin(now / 220) * 0.04), shrine.color, 0.38);
    }
    ctx.restore();
  }

  private drawRuneRing(ctx: CanvasRenderingContext2D, p: IsoPoint, color: string, alpha: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * this.scale;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + this.tileH * 0.08, this.tileW * 0.28, this.tileH * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * this.tileW * 0.18, p.y + this.tileH * 0.08 + Math.sin(a) * this.tileH * 0.1);
      ctx.lineTo(p.x + Math.cos(a) * this.tileW * 0.25, p.y + this.tileH * 0.08 + Math.sin(a) * this.tileH * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawItem(ctx: CanvasRenderingContext2D, item: Item, p: IsoPoint, visible: boolean, memory: number, now: number): void {
    const bob = Math.sin(now / 260 + p.x * 0.02) * this.tileH * 0.08;
    const color = item.color ?? "#f7cf70";
    ctx.save();
    ctx.globalAlpha = memory > 0.002 ? 1 : 0;
    if (visible) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const beamAlpha = item.kind === "gear" && (item.rarity === "Rare" || item.rarity === "Relic") ? 0.76 : item.kind === "gold" ? 0.4 : 0.34;
      const beam = ctx.createLinearGradient(p.x, p.y - this.tileW * 4.1, p.x, p.y + this.tileH * 0.2);
      beam.addColorStop(0, colorWithAlpha(color, 0));
      beam.addColorStop(0.24, colorWithAlpha(color, beamAlpha));
      beam.addColorStop(1, colorWithAlpha(color, 0.04));
      ctx.fillStyle = beam;
      ctx.fillRect(p.x - this.scale * 3.2, p.y - this.tileW * 3.75, this.scale * 6.4, this.tileW * 3.95);
      const pool = ctx.createRadialGradient(p.x, p.y + this.tileH * 0.12, 0, p.x, p.y + this.tileH * 0.12, this.tileW * 0.55);
      pool.addColorStop(0, colorWithAlpha(color, 0.36));
      pool.addColorStop(1, colorWithAlpha(color, 0));
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + this.tileH * 0.12, this.tileW * 0.45, this.tileH * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.18, this.tileW * 0.26, this.tileH * 0.08, 0.42);
    const frame = item.kind === "gold" ? "sprite-gold" : item.kind === "potion" ? "sprite-potion" : item.slot === "weapon" ? "sprite-weapon" : item.slot === "armor" ? "sprite-armor" : "sprite-charm";
    const itemWidth = item.kind === "potion" ? this.tileW * 0.32 : item.kind === "gold" ? this.tileW * 0.5 : this.tileW * 0.46;
    const itemHeight = item.kind === "potion" ? this.tileW * 0.38 : item.kind === "gold" ? this.tileW * 0.38 : this.tileW * 0.44;
    this.drawRasterSprite(ctx, frame, { x: p.x, y: p.y + bob + this.tileH * 0.14 }, itemWidth, itemHeight, 0.74, {
      alpha: 1,
      blend: "source-over",
      filter: this.actorFilter(visible)
    });
    ctx.restore();
  }

  private drawMonster(ctx: CanvasRenderingContext2D, monster: MonsterState, p: IsoPoint, visible: boolean, memory: number, now: number): void {
    const bob = Math.sin(now / 260 + monster.x) * this.tileH * 0.04;
    ctx.save();
    ctx.globalAlpha = memory > 0.002 ? 1 : 0;
    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.28, this.tileW * (monster.kind === "bone-warden" ? 0.34 : 0.3), this.tileH * 0.12, 0.55);
    if (monster.elite && visible) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.45 + Math.sin(now / 220) * 0.1;
      ctx.strokeStyle = monster.elite.auraColor;
      ctx.lineWidth = 3 * this.scale;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + this.tileH * 0.18, this.tileW * 0.42, this.tileH * 0.21, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    const baseSize = monster.kind === "bone-warden" ? 0.9 : monster.kind === "ash-chanter" ? 0.88 : 0.76;
    const size = baseSize * (monster.elite ? (monster.kind === "bone-warden" ? 1.48 : 1.2) : 1);
    const rasterFrame = monster.kind === "bone-warden" ? "sprite-bone-warden" : monster.kind === "ash-chanter" ? "sprite-ash-chanter" : "sprite-fiend";
    const rasterWidth =
      monster.kind === "gutter-fiend"
        ? this.tileW * 1.26 * (monster.elite ? 1.14 : 1)
        : this.tileW * (monster.kind === "bone-warden" ? 1 : 1.04) * (monster.elite ? 1.15 : 1);
    const rasterHeight =
      monster.kind === "gutter-fiend"
        ? this.tileW * 0.9 * (monster.elite ? 1.14 : 1)
        : this.tileW * (monster.kind === "bone-warden" ? 1.22 : 1.28) * (monster.elite ? 1.15 : 1);
    this.drawRasterSprite(ctx, rasterFrame, { x: p.x, y: p.y + bob + this.tileH * 0.16 }, rasterWidth, rasterHeight, monster.kind === "gutter-fiend" ? 0.72 : 0.9, {
      alpha: 1,
      blend: "source-over",
      filter: this.actorFilter(visible)
    });
    const groundY = p.y + this.tileH * (monster.kind === "gutter-fiend" ? 0.46 : 0.34);
    this.drawGroundingTint(ctx, p.x, groundY, rasterWidth * 0.56, this.tileH * 0.26, visible ? (monster.kind === "gutter-fiend" ? 0.62 : 0.54) : 0.32);
    if (visible) {
      if (monster.elite) this.drawRimLight(ctx, p, monster.elite.auraColor, size);
      if (monster.hp < monster.maxHp) this.drawHealthBar(ctx, p.x, p.y - this.tileW * 0.82 * size + bob, monster.hp / monster.maxHp, monster.elite?.auraColor ?? monster.color);
    }
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, state: GameState, p: IsoPoint, now: number): void {
    const bob = Math.sin(now / 180) * this.tileH * 0.025;
    this.drawShadow(ctx, p.x, p.y + this.tileH * 0.28, this.tileW * 0.32, this.tileH * 0.12, 0.66);
    this.drawMaskedPlayerSprite(ctx, { x: p.x, y: p.y + bob + this.tileH * 0.22 }, this.tileW * 1.06, this.tileW * 1.2);
    this.drawGroundingTint(ctx, p.x, p.y + this.tileH * 0.31, this.tileW * 0.56, this.tileH * 0.24, 0.52);
    this.drawRimLight(ctx, p, "#f2a84b", 0.88);

    const flameX = p.x + this.tileW * 0.27;
    const flameY = p.y - this.tileW * 0.72 + bob;
    const flicker = 0.9 + Math.sin(now / 58) * 0.12 + Math.sin(now / 31) * 0.08;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const gradient = ctx.createRadialGradient(flameX, flameY, 0, flameX, flameY, this.tileW * 0.34 * flicker);
    gradient.addColorStop(0, "rgba(255, 230, 164, 0.2)");
    gradient.addColorStop(0.34, "rgba(244, 157, 55, 0.12)");
    gradient.addColorStop(1, "rgba(244, 95, 30, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(flameX, flameY, this.tileW * 0.32 * flicker, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (state.mode === "dead") {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#030303";
      ctx.fillRect(p.x - this.tileW * 0.5, p.y - this.tileW, this.tileW, this.tileW);
      ctx.restore();
    }
  }

  private drawMaskedPlayerSprite(ctx: CanvasRenderingContext2D, p: IsoPoint, width: number, height: number): void {
    this.drawRasterSprite(ctx, "sprite-player", p, width, height, 0.9, {
      alpha: 1,
      blend: "source-over",
      filter: this.actorFilter(true)
    });
  }

  private drawRimLight(ctx: CanvasRenderingContext2D, p: IsoPoint, color: string, scale: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha *= 0.28;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * this.scale;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - this.tileW * 0.42 * scale, this.tileW * 0.28 * scale, this.tileW * 0.36 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha: number): void {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawGroundingTint(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    const floorTint = ctx.createRadialGradient(x, y, 0, x, y, rx);
    floorTint.addColorStop(0, `rgba(50, 31, 18, ${alpha})`);
    floorTint.addColorStop(0.55, `rgba(25, 16, 11, ${alpha * 0.55})`);
    floorTint.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = floorTint;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    const cover = ctx.createRadialGradient(x, y, 0, x, y, rx * 1.06);
    cover.addColorStop(0, `rgba(7, 5, 3, ${alpha * 0.48})`);
    cover.addColorStop(0.62, `rgba(11, 7, 4, ${alpha * 0.24})`);
    cover.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = cover;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 1.06, ry * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawSoftGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, colorWithAlpha(color, alpha));
    glow.addColorStop(0.38, colorWithAlpha(color, alpha * 0.42));
    glow.addColorStop(1, colorWithAlpha(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawRasterSprite(
    ctx: CanvasRenderingContext2D,
    frame: string,
    p: IsoPoint,
    width: number,
    height: number,
    anchorY = 0.88,
    alphaOrOptions: number | SpriteDrawOptions = 1,
    blend: GlobalCompositeOperation = "screen"
  ): void {
    const options: SpriteDrawOptions =
      typeof alphaOrOptions === "number"
        ? { anchorY, alpha: alphaOrOptions, blend }
        : { anchorY, ...alphaOrOptions };
    const resolvedAnchorY = options.anchorY ?? anchorY;
    const resolvedAlpha = options.alpha ?? 1;
    const resolvedBlend = options.blend ?? blend;
    const shadow = options.shadow ?? true;
    const filters = [];
    if (options.filter) filters.push(options.filter);
    if (shadow) filters.push("drop-shadow(0 12px 13px rgba(0,0,0,0.82))");

    ctx.save();
    ctx.globalAlpha *= resolvedAlpha;
    ctx.globalCompositeOperation = resolvedBlend;
    ctx.filter = filters.length > 0 ? filters.join(" ") : "none";
    ctx.translate(p.x, p.y);
    if (options.flipX) ctx.scale(-1, 1);
    this.drawAtlas(frame, -width / 2, -height * resolvedAnchorY, width, height);
    ctx.restore();
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, x: number, y: number, ratio: number, auraColor?: string): void {
    const width = this.tileW * 0.52;
    const height = Math.max(4, 4 * this.scale);
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(x - width / 2, y, width, height);
    ctx.fillStyle = auraColor ?? "#d95d4d";
    ctx.fillRect(x - width / 2, y, width * clamp(ratio, 0, 1), height);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.strokeRect(x - width / 2, y, width, height);
  }

  private drawLightSources(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const stats = calculatePlayerStats(state);
    const player = this.projectEntity(state.player.x, state.player.y);
    this.drawRadialLight(ctx, player.x + this.tileW * 0.18, player.y - this.tileH * 1.25, stats.torchRadius * this.tileW * 0.52, [
      [0, "rgba(255, 232, 160, 0.64)"],
      [0.28, "rgba(232, 129, 43, 0.36)"],
      [0.7, "rgba(99, 53, 28, 0.16)"],
      [1, "rgba(0,0,0,0)"]
    ]);

    for (const item of state.items) {
      if (item.x === undefined || item.y === undefined) continue;
      const vis = this.tileVisibility(state, item.x, item.y);
      if (!vis.visible) continue;
      const p = this.projectEntity(item.x, item.y);
      const strength = item.kind === "gear" && (item.rarity === "Rare" || item.rarity === "Relic") ? 0.5 : 0.24;
      this.drawRadialLight(ctx, p.x, p.y, this.tileW * 1.2, [
        [0, colorWithAlpha(item.color, strength)],
        [1, colorWithAlpha(item.color, 0)]
      ]);
    }

    for (const shrine of state.shrines) {
      if (shrine.used) continue;
      const vis = this.tileVisibility(state, shrine.x, shrine.y);
      if (!vis.visible) continue;
      const p = this.projectEntity(shrine.x, shrine.y);
      this.drawRadialLight(ctx, p.x, p.y - this.tileH * 0.5, this.tileW * 1.6, [
        [0, colorWithAlpha(shrine.color, 0.34)],
        [1, colorWithAlpha(shrine.color, 0)]
      ]);
    }

    const d = state.dungeon;
    for (let y = 0; y < d.height; y += 1) {
      for (let x = 0; x < d.width; x += 1) {
        if (state.dungeon.visible[idx(d, x, y)] !== 1) continue;
        if (hash01(x, y, state.seed + 31) <= 0.84 && hash01(x, y, state.seed + 4217) <= 0.955) continue;
        const p = this.projectEntity(x, y);
        if (!this.isInScreenMargin(p, 250)) continue;
        const pulse = 0.92 + Math.sin(now / 180 + x) * 0.06;
        this.drawRadialLight(ctx, p.x, p.y - this.tileH * 0.65, this.tileW * 1.45 * pulse, [
          [0, "rgba(255, 190, 92, 0.28)"],
          [1, "rgba(255, 121, 45, 0)"]
        ]);
      }
    }
    ctx.restore();
  }

  private drawRadialLight(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, stops: [number, string][]): void {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFog(ctx: CanvasRenderingContext2D, state: GameState): void {
    const d = state.dungeon;
    const stats = calculatePlayerStats(state);
    for (let y = 0; y < d.height; y += 1) {
      for (let x = 0; x < d.width; x += 1) {
        const p = this.projectTile(x + 0.5, y + 0.5);
        if (!this.isInScreenMargin(p, 260)) continue;
        const index = idx(d, x, y);
        const memory = d.memory[index];
        const visible = d.visible[index];
        if (memory <= 0.002) {
          const tile = getTile(d, x, y);
          if (isFloorish(tile) || tile === Tile.Door || tile === Tile.OpenDoor) {
            ctx.fillStyle = "rgba(0, 1, 2, 0.64)";
            this.diamondPath(ctx, p, this.tileW * 1.04, this.tileH * 1.08);
            ctx.fill();
          }
        } else if (!visible) {
          ctx.fillStyle = `rgba(5, 12, 17, ${0.72 - memory * 0.18})`;
          this.diamondPath(ctx, p, this.tileW * 1.04, this.tileH * 1.08);
          ctx.fill();
          ctx.fillStyle = `rgba(75, 114, 130, ${0.16 * memory})`;
          this.diamondPath(ctx, p, this.tileW, this.tileH);
          ctx.fill();
        } else {
          const dist = Math.hypot(x - state.player.x, y - state.player.y);
          const alpha = clamp((dist - 2) / stats.torchRadius, 0, 1) * 0.24;
          if (alpha > 0.01) {
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            this.diamondPath(ctx, p, this.tileW * 1.02, this.tileH * 1.06);
            ctx.fill();
          }
        }
      }
    }
  }

  private drawAtmosphericFog(ctx: CanvasRenderingContext2D, now: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 8; i += 1) {
      const x = (this.viewport.width * (0.15 + i * 0.12) + Math.sin(now / 1800 + i) * 32) % (this.viewport.width + 180);
      const y = this.viewport.height * (0.14 + (i % 4) * 0.2) + Math.cos(now / 2100 + i) * 24;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, this.viewport.width * 0.18);
      gradient.addColorStop(0, "rgba(68, 104, 121, 0.07)");
      gradient.addColorStop(1, "rgba(68, 104, 121, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, this.viewport.width * 0.18, this.viewport.height * 0.07, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawForegroundArchitecture(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
    if (state.floor !== 1) return;
    const room = state.dungeon.rooms[0];
    if (!room) return;
    const center = this.projectTile(room.cx + 0.5, room.cy + 0.5);
    if (!this.isInScreenMargin(center, 820)) return;

    ctx.save();
    const baseY = room.y + room.h;
    for (let x = room.x + 2; x <= room.x + room.w - 2; x += 2) {
      if (x > room.cx - 2 && x < room.cx + 3) continue;
      const p = this.projectTile(x + 0.5, baseY + 0.1);
      if (!this.isInScreenMargin(p, 360)) continue;
      const w = this.tileW * 0.58;
      const h = this.tileH * (0.58 + hash01(x, baseY, state.seed + 803) * 0.3);
      this.drawRasterSprite(ctx, "sprite-wall-broken", { x: p.x, y: p.y + h * 0.42 }, w, h * 2.4, 0.9, {
        alpha: 1,
        blend: "source-over",
        flipX: x > room.cx,
        filter: "brightness(0.54) contrast(1.12) saturate(0.72)"
      });
    }

    const pit = this.projectTile(room.cx + 0.5, baseY + 0.35);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    const abyss = ctx.createRadialGradient(pit.x, pit.y, this.tileW * 0.2, pit.x, pit.y + this.tileH * 0.1, this.tileW * 3.4);
    abyss.addColorStop(0, "rgba(0, 0, 0, 0.24)");
    abyss.addColorStop(0.5, "rgba(0, 0, 0, 0.52)");
    abyss.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = abyss;
    ctx.beginPath();
    ctx.ellipse(pit.x, pit.y + this.tileH * 0.2, this.tileW * 3.4, this.tileH * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.24;
    for (let i = 0; i < 5; i += 1) {
      const x = pit.x + (i - 2) * this.tileW * 0.5 + Math.sin(now / 1400 + i) * this.tileW * 0.12;
      const y = pit.y + this.tileH * (0.1 + i * 0.04);
      const fog = ctx.createRadialGradient(x, y, 0, x, y, this.tileW * 0.9);
      fog.addColorStop(0, "rgba(74, 119, 126, 0.18)");
      fog.addColorStop(1, "rgba(74, 119, 126, 0)");
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.ellipse(x, y, this.tileW * 0.88, this.tileH * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
  }

  private drawDebugWorld(ctx: CanvasRenderingContext2D, state: GameState): void {
    if (!state.debug.showCollision && !state.debug.showFogMemory && !state.debug.showRoomGraph && !state.debug.showMonsterTargets && !state.debug.showLos) return;
    ctx.save();
    for (let y = 0; y < state.dungeon.height; y += 1) {
      for (let x = 0; x < state.dungeon.width; x += 1) {
        const p = this.projectTile(x + 0.5, y + 0.5);
        const index = idx(state.dungeon, x, y);
        if (state.debug.showCollision && state.dungeon.blockers[index]) {
          ctx.fillStyle = "rgba(255, 60, 60, 0.18)";
          this.diamondPath(ctx, p);
          ctx.fill();
        }
        if (state.debug.showFogMemory && state.dungeon.memory[index] > 0) {
          ctx.strokeStyle = `rgba(122, 183, 210, ${state.dungeon.memory[index] * 0.45})`;
          this.diamondPath(ctx, p, this.tileW * 0.72, this.tileH * 0.72);
          ctx.stroke();
        }
        if (state.debug.showLos && state.dungeon.visible[index]) {
          ctx.fillStyle = "rgba(255, 214, 120, 0.1)";
          this.diamondPath(ctx, p, this.tileW * 0.9, this.tileH * 0.9);
          ctx.fill();
        }
      }
    }
    if (state.debug.showRoomGraph) {
      ctx.strokeStyle = "rgba(247, 207, 112, 0.45)";
      for (let i = 1; i < state.dungeon.rooms.length; i += 1) {
        const a = state.dungeon.rooms[i - 1]!;
        const b = state.dungeon.rooms[i]!;
        const pa = this.projectTile(a.cx + 0.5, a.cy + 0.5);
        const pb = this.projectTile(b.cx + 0.5, b.cy + 0.5);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }
    if (state.debug.showMonsterTargets) {
      ctx.strokeStyle = "rgba(217, 93, 77, 0.5)";
      const player = this.projectEntity(state.player.x, state.player.y);
      for (const monster of state.monsters) {
        const p = this.projectEntity(monster.x, monster.y);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawDebugText(ctx: CanvasRenderingContext2D, state: GameState): void {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.66)";
    ctx.fillRect(16, this.viewport.height - 48, 300, 30);
    ctx.fillStyle = "#d9e6e8";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`fps ${state.debug.fps} . visible ${visibleCount(state.dungeon)} . draw ${state.monsters.length + state.items.length}`, 26, this.viewport.height - 28);
    ctx.restore();
  }

  private drawScreenVignette(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createRadialGradient(
      this.viewport.width / 2,
      this.viewport.height * 0.48,
      Math.min(this.viewport.width, this.viewport.height) * 0.18,
      this.viewport.width / 2,
      this.viewport.height * 0.48,
      Math.max(this.viewport.width, this.viewport.height) * 0.72
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.72, "rgba(0,0,0,0.12)");
    gradient.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.viewport.width, this.viewport.height);

    const left = ctx.createLinearGradient(0, 0, this.viewport.width * 0.22, 0);
    left.addColorStop(0, "rgba(0,0,0,0.68)");
    left.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = left;
    ctx.fillRect(0, 0, this.viewport.width * 0.24, this.viewport.height);

    const right = ctx.createLinearGradient(this.viewport.width, 0, this.viewport.width * 0.76, 0);
    right.addColorStop(0, "rgba(0,0,0,0.68)");
    right.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = right;
    ctx.fillRect(this.viewport.width * 0.76, 0, this.viewport.width * 0.24, this.viewport.height);
  }

  private drawAtlas(frame: string, x: number, y: number, w: number, h: number): void {
    if (!this.atlas) {
      this.ctx.fillStyle = "#2a2b27";
      this.ctx.fillRect(x, y, w, h);
      return;
    }
    drawFrame(this.ctx, this.atlas, frame, x, y, w, h);
  }
}
