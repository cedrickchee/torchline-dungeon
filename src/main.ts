import { atlasManifest } from "./assets/manifest";
import { loadAtlas } from "./assets/asset-loader";
import { audioManifest } from "./audio/manifest";
import { AudioMixer } from "./audio/mixer";
import { TorchlineGame } from "./core/game";
import { serializeState } from "./core/persistence";
import { bindKeyboard } from "./input/input";
import { ThreeRenderer } from "./render/three-renderer";
import { floorOneSceneDoors } from "./scene/navigation";
import { HudController } from "./ui/hud";
import type { DebugState, GameAction, GameState } from "./core/types";
import "./styles.css";

const SAVE_KEY = "torchline-dungeon-save-v1";
const FRAME_SAMPLE_LIMIT = 180;
const SLOW_FRAME_MS = 34;
const HUD_DEBUG_CADENCE_MS = 125;

type QaMetrics = Pick<
  DebugState,
  | "fps"
  | "avgFps"
  | "frameMs"
  | "p95FrameMs"
  | "slowFrames"
  | "sampleFrames"
  | "updateMs"
  | "renderMs"
  | "drawCalls"
  | "triangles"
  | "objects"
  | "animatedSprites"
  | "particles"
> & {
  hudRenders: number;
  hudSkips: number;
  hudLastReason: string;
};

type TorchlineQa = {
  version: "torchline-qa-v1";
  metrics: () => QaMetrics;
  resetMetrics: () => void;
  state: () => {
    mode: string;
    sceneId: string;
    seed: number;
    turn: number;
    elapsedMs: number;
    kills: number;
    player: { x: number; y: number; hp: number; level: number };
    monsters: number;
    items: number;
    doors: { id: string; x: number; y: number; open: boolean }[];
    messages: string[];
  };
  dispatch: (action: GameAction) => void;
  advance: (ms: number) => void;
  killPlayer: () => void;
};

type HotModule = {
  dispose: (callback: () => void) => void;
};

declare global {
  interface Window {
    __torchlineQa?: TorchlineQa;
  }
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

class FrameStats {
  private readonly samples = new Float32Array(FRAME_SAMPLE_LIMIT);
  private readonly sorted = new Float32Array(FRAME_SAMPLE_LIMIT);
  private index = 0;
  private count = 0;
  private totalMs = 0;
  private slowFrames = 0;
  private lastPublishMs = 0;

  record(rawFrameMs: number, now: number, debug: DebugState): void {
    if (!Number.isFinite(rawFrameMs) || rawFrameMs <= 0) return;
    const frameMs = rawFrameMs;
    if (this.count === FRAME_SAMPLE_LIMIT) {
      const previous = this.samples[this.index];
      this.totalMs -= previous;
      if (previous > SLOW_FRAME_MS) this.slowFrames -= 1;
    } else {
      this.count += 1;
    }

    this.samples[this.index] = frameMs;
    this.totalMs += frameMs;
    if (frameMs > SLOW_FRAME_MS) this.slowFrames += 1;
    this.index = (this.index + 1) % FRAME_SAMPLE_LIMIT;

    debug.fps = Math.round(1000 / Math.max(1, frameMs));
    debug.frameMs = roundTenth(frameMs);
    if (now - this.lastPublishMs < 250 && debug.sampleFrames > 0) return;

    this.lastPublishMs = now;
    for (let i = 0; i < this.count; i += 1) this.sorted[i] = this.samples[i];
    for (let i = 1; i < this.count; i += 1) {
      const value = this.sorted[i];
      let cursor = i - 1;
      while (cursor >= 0 && this.sorted[cursor] > value) {
        this.sorted[cursor + 1] = this.sorted[cursor];
        cursor -= 1;
      }
      this.sorted[cursor + 1] = value;
    }

    const averageMs = this.totalMs / Math.max(1, this.count);
    const p95Index = Math.max(0, Math.min(this.count - 1, Math.ceil(this.count * 0.95) - 1));
    debug.avgFps = Math.round(1000 / Math.max(1, averageMs));
    debug.p95FrameMs = roundTenth(this.sorted[p95Index] ?? 0);
    debug.slowFrames = this.slowFrames;
    debug.sampleFrames = this.count;
  }

  reset(debug: DebugState): void {
    this.index = 0;
    this.count = 0;
    this.totalMs = 0;
    this.slowFrames = 0;
    this.lastPublishMs = 0;
    debug.fps = 0;
    debug.avgFps = 0;
    debug.frameMs = 0;
    debug.p95FrameMs = 0;
    debug.slowFrames = 0;
    debug.sampleFrames = 0;
  }
}

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
if (!canvas) throw new Error("Missing game canvas.");

const game = new TorchlineGame();
const renderer = new ThreeRenderer(canvas);
const mixer = new AudioMixer(audioManifest);
const frameStats = new FrameStats();
let hudDirty = true;
let hudRenderCount = 0;
let hudSkipCount = 0;
let hudLastRenderMs = 0;
let hudLastSignature = "";
let hudLastReason = "initial";

function markHudDirty(reason: string): void {
  hudDirty = true;
  hudLastReason = reason;
}

function hudStateSignature(state: GameState, eventCount: number): string {
  const player = state.player;
  const equipment = `${player.equipment.weapon?.id ?? "-"}:${player.equipment.armor?.id ?? "-"}:${player.equipment.charm?.id ?? "-"}`;
  const inventory = player.inventory.map((item) => item.id).join(",");
  const buffs = state.activeBuffs
    .map((buff) => `${buff.id}:${Math.ceil(buff.turnsRemaining)}:${buff.color}`)
    .join(",");
  const playerMapPosition = `${Math.round(player.x * 2) / 2}:${Math.round(player.y * 2) / 2}`;
  const monsterMapPositions = state.monsters
    .map((monster) => `${monster.id}:${Math.round(monster.x)}:${Math.round(monster.y)}:${monster.hp > 0}`)
    .join(",");
  const pendingSkills = state.pendingSkills?.map((choice) => choice.name).join(",") ?? "-";
  const debugFlags = state.debug.enabled
    ? [
        state.debug.showCollision,
        state.debug.showLos,
        state.debug.showFogMemory,
        state.debug.showRoomGraph,
        state.debug.showMonsterTargets,
        state.debug.showReplayLog,
        state.debug.missingAssets.length,
        state.debug.missingAudio.length
      ].join(",")
    : "off";
  return [
    state.mode,
    state.floor,
    state.turn,
    state.kills,
    eventCount,
    player.level,
    player.hp,
    player.xp,
    player.nextXp,
    player.gold,
    playerMapPosition,
    equipment,
    inventory,
    buffs,
    pendingSkills,
    state.monsters.length,
    monsterMapPositions,
    state.items.length,
    state.shrines.map((shrine) => `${shrine.id}:${shrine.used}`).join(","),
    state.messages.join("\u001f"),
    debugFlags
  ].join("|");
}

function saveRun(): void {
  try {
    const previous = localStorage.getItem(SAVE_KEY);
    const previousCreatedAt = previous
      ? (JSON.parse(previous) as { createdAt?: string }).createdAt
      : undefined;
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeState(game.state, previousCreatedAt)));
    game.notify("Run saved.", "save-confirm", "save");
    markHudDirty("save");
  } catch (error) {
    game.notify(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    markHudDirty("save-error");
  }
}

function loadRun(): void {
  try {
    const payload = localStorage.getItem(SAVE_KEY);
    if (!payload) {
      game.notify("No local save slot found.");
      return;
    }
    const loaded = game.tryLoadSavePayload(JSON.parse(payload));
    markHudDirty(loaded ? "load" : "load-error");
  } catch (error) {
    game.notify(`Load failed: ${error instanceof Error ? error.message : String(error)}`);
    markHudDirty("load-error");
  }
}

function dispatch(action: Parameters<TorchlineGame["dispatch"]>[0]): void {
  game.dispatch(action);
  markHudDirty(action.type);
}

function currentQaMetrics(): QaMetrics {
  const debug = game.state.debug;
  return {
    fps: debug.fps,
    avgFps: debug.avgFps,
    frameMs: debug.frameMs,
    p95FrameMs: debug.p95FrameMs,
    slowFrames: debug.slowFrames,
    sampleFrames: debug.sampleFrames,
    updateMs: debug.updateMs,
    renderMs: debug.renderMs,
    drawCalls: debug.drawCalls,
    triangles: debug.triangles,
    objects: debug.objects,
    animatedSprites: debug.animatedSprites,
    particles: debug.particles,
    hudRenders: hudRenderCount,
    hudSkips: hudSkipCount,
    hudLastReason
  };
}

window.__torchlineQa = {
  version: "torchline-qa-v1",
  metrics: currentQaMetrics,
  resetMetrics: () => frameStats.reset(game.state.debug),
  state: () => ({
    mode: game.state.mode,
    sceneId: game.state.sceneId,
    seed: game.state.seed,
    turn: game.state.turn,
    elapsedMs: game.state.elapsedMs,
    kills: game.state.kills,
    player: {
      x: game.state.player.x,
      y: game.state.player.y,
      hp: game.state.player.hp,
      level: game.state.player.level
    },
    monsters: game.state.monsters.length,
    items: game.state.items.length,
    doors: floorOneSceneDoors(game.state).map((door) => ({
      id: door.spec.id,
      x: door.tile.x,
      y: door.tile.y,
      open: door.open
    })),
    messages: game.state.messages.slice(0, 6)
  }),
  dispatch,
  killPlayer: () => game.forcePlayerDeathForDebug(),
  advance: (ms: number) => {
    let remaining = Math.max(0, Math.min(15000, ms));
    while (remaining > 0 && game.state.mode === "playing") {
      const step = Math.min(50, remaining);
      game.tickFrame(step);
      remaining -= step;
    }
  }
};

const hud = new HudController({
  dispatch,
  save: saveRun,
  load: loadRun,
  replay: () => game.replayFromStart()
});

bindKeyboard(dispatch, () => game.state.player);

let audioUnlockStarted = false;
async function unlockAudio(): Promise<void> {
  if (audioUnlockStarted) return;
  audioUnlockStarted = true;
  await mixer.unlock();
  for (const path of mixer.missing) game.markMissingAudio(path);
}

window.addEventListener("pointerdown", () => void unlockAudio(), { once: true });
window.addEventListener("keydown", () => void unlockAudio(), { once: true });

canvas.addEventListener("pointerdown", (event) => {
  void unlockAudio();
  const hit = renderer.getInputHit(event.clientX, event.clientY, game.state);
  if (!hit) return;
  if (hit.type === "monster") dispatch({ type: "targetActor", id: hit.id });
  else dispatch({ type: "interactAt", x: hit.x, y: hit.y });
});

loadAtlas(atlasManifest)
  .then((atlas) => {
    renderer.loadAssets(atlas);
    for (const path of atlas.missing) game.markMissingAsset(path);
    if (atlas.missing.length) markHudDirty("missing-assets");
  })
  .catch((error) => {
    game.notify(`Asset load failed: ${error instanceof Error ? error.message : String(error)}`);
    markHudDirty("asset-error");
  });

let last = performance.now();
let frameRequestId = 0;
let frameLoopActive = true;

function renderHudIfNeeded(now: number, eventCount: number): void {
  const signature = hudStateSignature(game.state, eventCount);
  const debugCadenceDue = game.state.debug.enabled && now - hudLastRenderMs >= HUD_DEBUG_CADENCE_MS;
  let reason = "";
  if (hudDirty) reason = hudLastReason;
  else if (signature !== hudLastSignature) reason = "state";
  else if (debugCadenceDue) reason = "debug-cadence";

  if (!reason) {
    hudSkipCount += 1;
    return;
  }

  hud.render(game.state);
  hudDirty = false;
  hudLastSignature = signature;
  hudLastRenderMs = now;
  hudRenderCount += 1;
  hudLastReason = reason;
}

function frame(now: number): void {
  if (!frameLoopActive) return;
  const rawDt = now - last;
  const dt = Math.min(50, rawDt);
  last = now;
  frameStats.record(rawDt, now, game.state.debug);
  game.tickFrame(dt);
  const events = game.drainEffects();
  for (const event of events) mixer.play(event.audio);
  mixer.setPaused(game.state.mode === "paused");
  renderer.render(game.state, events, dt, now);
  renderHudIfNeeded(now, events.length);
  frameRequestId = requestAnimationFrame(frame);
}

frameRequestId = requestAnimationFrame(frame);

const hot = (import.meta as ImportMeta & { hot?: HotModule }).hot;
if (hot) {
  hot.dispose(() => {
    frameLoopActive = false;
    cancelAnimationFrame(frameRequestId);
    renderer.dispose();
  });
}
