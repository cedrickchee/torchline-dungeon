import { idx } from "../core/dungeon";
import { calculatePlayerStats } from "../core/game";
import { describeItemDetails } from "../core/items";
import { replayLabel } from "../core/replay";
import {
  Tile,
  type GameAction,
  type GameState,
  type GearItem,
  type Item,
  type SkillChoice,
  type SkillTree,
  type Slot
} from "../core/types";

type HudCallbacks = {
  dispatch: (action: GameAction) => void;
  save: () => void;
  load: () => void;
  replay: () => void;
};

type HudElements = {
  hud: HTMLElement;
  level: HTMLElement;
  floor: HTMLElement;
  hpText: HTMLElement;
  hpFill: HTMLElement;
  xpText: HTMLElement;
  xpFill: HTMLElement;
  torchText: HTMLElement;
  torchFill: HTMLElement;
  attack: HTMLElement;
  defense: HTMLElement;
  crit: HTMLElement;
  gold: HTMLElement;
  buffs: HTMLElement;
  equipment: HTMLElement;
  inventory: HTMLElement;
  tooltip: HTMLElement;
  skills: HTMLElement;
  minimap: HTMLCanvasElement;
  messages: HTMLElement;
  skillModal: HTMLElement;
  skillChoices: HTMLElement;
  pauseOverlay: HTMLElement;
  deathOverlay: HTMLElement;
  deathSummary: HTMLElement;
  debugOverlay: HTMLElement;
  packPanel: HTMLElement;
  packToggle: HTMLButtonElement;
};

const skillOrder: SkillTree[] = ["Flame", "Steel", "Shadow", "Survival"];

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function itemFrame(item: Item | GearItem | null): string {
  if (!item) return "slot-empty";
  if (item.kind === "gold") return "loot-gold";
  if (item.kind === "potion") return "loot-potion";
  if (item.slot === "weapon") return "loot-weapon";
  if (item.slot === "armor") return "loot-armor";
  return "loot-charm";
}

function shortStats(item: Item | GearItem | null): string {
  if (!item) return "empty";
  if (item.kind === "gold") return `${item.amount}`;
  if (item.kind === "potion") return `heal ${item.heal}`;
  const stats: string[] = [];
  if (item.attack) stats.push(`+${item.attack} atk`);
  if (item.defense) stats.push(`+${item.defense} def`);
  if (item.crit) stats.push(`+${Math.round(item.crit * 100)}% crit`);
  if (item.affixes.length) stats.push(`${item.affixes.length} affix`);
  return stats.join(" ") || "gear";
}

function tooltipToneClass(tone: string): string {
  return `tooltip-${tone}`;
}

export class HudController {
  private readonly el: HudElements;
  private previousInventoryHtml = "";
  private previousEquipmentHtml = "";
  private previousVitalsKey = "";
  private previousBuffsHtml = "";
  private previousSkillsHtml = "";
  private previousMessagesHtml = "";
  private previousSkillChoicesHtml = "";
  private previousModeKey = "";
  private previousDebugHtml = "";
  private lastDebugRenderMs = 0;
  private lastMinimapRenderMs = 0;
  private packOpen = false;

  constructor(private readonly callbacks: HudCallbacks) {
    this.el = {
      hud: requiredElement("hud"),
      level: requiredElement("level"),
      floor: requiredElement("floor"),
      hpText: requiredElement("hp-text"),
      hpFill: requiredElement("hp-fill"),
      xpText: requiredElement("xp-text"),
      xpFill: requiredElement("xp-fill"),
      torchText: requiredElement("torch-text"),
      torchFill: requiredElement("torch-fill"),
      attack: requiredElement("attack"),
      defense: requiredElement("defense"),
      crit: requiredElement("crit"),
      gold: requiredElement("gold"),
      buffs: requiredElement("buffs"),
      equipment: requiredElement("equipment"),
      inventory: requiredElement("inventory"),
      tooltip: requiredElement("tooltip"),
      skills: requiredElement("skills"),
      minimap: requiredElement("minimap"),
      messages: requiredElement("messages"),
      skillModal: requiredElement("skill-modal"),
      skillChoices: requiredElement("skill-choices"),
      pauseOverlay: requiredElement("pause-overlay"),
      deathOverlay: requiredElement("death-overlay"),
      deathSummary: requiredElement("death-summary"),
      debugOverlay: requiredElement("debug-overlay"),
      packPanel: requiredElement("pack-panel"),
      packToggle: requiredElement("btn-pack")
    };

    requiredElement<HTMLButtonElement>("btn-potion").addEventListener("click", () =>
      callbacks.dispatch({ type: "drinkPotion" })
    );
    requiredElement<HTMLButtonElement>("btn-wait").addEventListener("click", () =>
      callbacks.dispatch({ type: "basicAttack" })
    );
    requiredElement<HTMLButtonElement>("btn-shrine").addEventListener("click", () =>
      callbacks.dispatch({ type: "useAbility" })
    );
    requiredElement<HTMLButtonElement>("btn-stairs").addEventListener("click", () =>
      callbacks.dispatch({ type: "useStairs" })
    );
    requiredElement<HTMLButtonElement>("btn-save").addEventListener("click", () => callbacks.save());
    requiredElement<HTMLButtonElement>("btn-load").addEventListener("click", () => callbacks.load());
    requiredElement<HTMLButtonElement>("btn-pause").addEventListener("click", () =>
      callbacks.dispatch({ type: "pause" })
    );
    requiredElement<HTMLButtonElement>("btn-resume").addEventListener("click", () =>
      callbacks.dispatch({ type: "resume" })
    );
    requiredElement<HTMLButtonElement>("btn-debug").addEventListener("click", () =>
      callbacks.dispatch({ type: "toggleDebug" })
    );
    this.el.packToggle.addEventListener("click", () => this.setPackOpen(!this.packOpen));
    requiredElement<HTMLButtonElement>("btn-death-restart").addEventListener("click", () =>
      callbacks.dispatch({ type: "restart" })
    );
    document.addEventListener("pointerdown", (event) => {
      if (!this.packOpen) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (this.el.packPanel.contains(target) || this.el.packToggle.contains(target)) return;
      this.setPackOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.packOpen) this.setPackOpen(false);
      if (event.key.toLowerCase() === "i") this.setPackOpen(!this.packOpen);
    });
    this.el.debugOverlay.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!button) return;
      const flag = button.dataset.flag;
      if (flag) {
        callbacks.dispatch({
          type: "toggleDebugFlag",
          flag: flag as
            | "showCollision"
            | "showLos"
            | "showFogMemory"
            | "showRoomGraph"
            | "showMonsterTargets"
            | "showReplayLog"
        });
      } else if (button.dataset.replay) callbacks.replay();
    });
  }

  private setPackOpen(open: boolean): void {
    this.packOpen = open;
    this.el.hud.classList.toggle("pack-open", open);
    this.el.packToggle.setAttribute("aria-expanded", String(open));
    if (!open) this.hideTooltip();
  }

  render(state: GameState): void {
    const stats = calculatePlayerStats(state);
    const vitalsKey = [
      state.player.level,
      state.floor,
      state.player.hp,
      stats.maxHp,
      state.player.xp,
      state.player.nextXp,
      stats.torchRadius.toFixed(1),
      Math.round(stats.attack),
      Math.round(stats.defense),
      Math.round(stats.crit * 100),
      state.player.gold
    ].join("|");
    if (vitalsKey !== this.previousVitalsKey) {
      this.previousVitalsKey = vitalsKey;
      this.el.level.textContent = String(state.player.level);
      this.el.floor.textContent = String(state.floor);
      this.el.hpText.textContent = `${Math.max(0, state.player.hp)}/${stats.maxHp}`;
      this.el.hpFill.style.width = `${Math.max(0, Math.min(1, state.player.hp / stats.maxHp)) * 100}%`;
      this.el.xpText.textContent = `${state.player.xp}/${state.player.nextXp}`;
      this.el.xpFill.style.width = `${Math.min(1, state.player.xp / state.player.nextXp) * 100}%`;
      this.el.torchText.textContent = stats.torchRadius.toFixed(1);
      this.el.torchFill.style.width = `${Math.min(100, (stats.torchRadius / 16) * 100)}%`;
      this.el.attack.textContent = String(Math.round(stats.attack));
      this.el.defense.textContent = String(Math.round(stats.defense));
      this.el.crit.textContent = `${Math.round(stats.crit * 100)}%`;
      this.el.gold.textContent = String(state.player.gold);
    }
    this.renderBuffs(state);
    this.renderEquipment(state);
    this.renderInventory(state);
    this.renderSkills(state);
    this.renderMessages(state);
    this.renderSkillModal(state.pendingSkills);
    this.renderModeOverlays(state);
    this.renderMinimap(state);
    this.renderDebug(state);
  }

  private renderBuffs(state: GameState): void {
    const html = state.activeBuffs
      .map(
        (buff) =>
          `<div style="--buff:${buff.color}"><strong>${escapeHtml(buff.name)}</strong><span>${Math.ceil(buff.turnsRemaining)}</span></div>`
      )
      .join("");
    if (html === this.previousBuffsHtml) return;
    this.previousBuffsHtml = html;
    this.el.buffs.innerHTML = html;
  }

  private renderEquipment(state: GameState): void {
    const entries: [Slot, string, GearItem | null][] = [
      ["weapon", "Weapon", state.player.equipment.weapon],
      ["armor", "Armor", state.player.equipment.armor],
      ["charm", "Charm", state.player.equipment.charm]
    ];
    const html = entries
      .map(
        ([slot, label, item]) => `
          <div class="equipment-slot" data-slot="${slot}" data-has-item="${item ? "true" : "false"}" data-frame="${itemFrame(item)}" style="--item:${item?.color ?? "#776f63"}" ${item ? `tabindex="0" aria-label="Equipped ${label}: ${escapeHtml(item.name)}"` : `aria-label="Empty ${label} slot"`}>
            <span>${label}</span>
            <strong>${escapeHtml(item?.name ?? "Empty")}</strong>
            <small>${escapeHtml(shortStats(item))}</small>
          </div>
        `
      )
      .join("");
    if (html === this.previousEquipmentHtml) return;
    this.previousEquipmentHtml = html;
    this.el.equipment.innerHTML = html;
    this.el.equipment
      .querySelectorAll<HTMLElement>(".equipment-slot[data-has-item='true']")
      .forEach((node) => {
        const slot = node.dataset.slot as Slot;
        const item = state.player.equipment[slot];
        if (!item) return;
        node.addEventListener("mouseenter", () => this.showTooltip(state, item, node, false));
        node.addEventListener("focus", () => this.showTooltip(state, item, node, false));
        node.addEventListener("mouseleave", () => this.hideTooltip());
        node.addEventListener("blur", () => this.hideTooltip());
      });
  }

  private renderInventory(state: GameState): void {
    const html =
      state.player.inventory.length === 0
        ? Array.from(
            { length: 20 },
            (_, index) =>
              `<div class="inventory-empty-slot" aria-label="Empty inventory slot">${index === 0 ? "Pack empty" : ""}</div>`
          ).join("")
        : state.player.inventory
            .map(
              (item, index) => `
                <button class="inventory-item" data-index="${index}" type="button" style="--item:${item.color}" data-frame="${itemFrame(item)}">
                  <strong>${escapeHtml(item.name)}</strong>
                  <small>${escapeHtml(shortStats(item))}</small>
                </button>
              `
            )
            .join("");
    if (html === this.previousInventoryHtml) return;
    this.previousInventoryHtml = html;
    this.el.inventory.innerHTML = html;
    this.el.inventory.querySelectorAll<HTMLButtonElement>(".inventory-item").forEach((node) => {
      const index = Number(node.dataset.index ?? "-1");
      node.addEventListener("click", () => this.callbacks.dispatch({ type: "useInventoryItem", index }));
      node.addEventListener("mouseenter", () =>
        this.showTooltip(state, state.player.inventory[index], node, true)
      );
      node.addEventListener("focus", () =>
        this.showTooltip(state, state.player.inventory[index], node, true)
      );
      node.addEventListener("mouseleave", () => this.hideTooltip());
      node.addEventListener("blur", () => this.hideTooltip());
    });
  }

  private showTooltip(state: GameState, item: Item | undefined, anchor: HTMLElement, compare: boolean): void {
    if (!item) return;
    const equipped = compare && item.kind === "gear" ? state.player.equipment[item.slot] : undefined;
    this.el.tooltip.innerHTML = `<strong class="tooltip-title" style="color:${item.color}">${escapeHtml(item.name)}</strong>${describeItemDetails(
      item,
      equipped
    )
      .map(
        (line) => `<span class="tooltip-line ${tooltipToneClass(line.tone)}">${escapeHtml(line.text)}</span>`
      )
      .join("")}`;
    this.el.tooltip.hidden = false;
    this.el.tooltip.style.visibility = "hidden";
    this.el.tooltip.style.left = "0px";
    this.el.tooltip.style.top = "0px";
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = this.el.tooltip.offsetWidth || 260;
    const tooltipHeight = this.el.tooltip.offsetHeight || 180;
    const margin = 12;
    let left = rect.left - tooltipWidth - margin;
    if (left < margin) left = rect.right + margin;
    left = Math.max(margin, Math.min(window.innerWidth - tooltipWidth - margin, left));
    const top = Math.max(margin, Math.min(window.innerHeight - tooltipHeight - margin, rect.top - 4));
    this.el.tooltip.style.left = `${left}px`;
    this.el.tooltip.style.top = `${top}px`;
    this.el.tooltip.style.right = "auto";
    this.el.tooltip.style.visibility = "";
  }

  private hideTooltip(): void {
    this.el.tooltip.hidden = true;
    this.el.tooltip.style.visibility = "";
  }

  private renderSkills(state: GameState): void {
    const html = skillOrder
      .map((tree) => `<div><span>${tree}</span><strong>${state.player.skills[tree]}</strong></div>`)
      .join("");
    if (html === this.previousSkillsHtml) return;
    this.previousSkillsHtml = html;
    this.el.skills.innerHTML = html;
  }

  private renderMessages(state: GameState): void {
    const html = state.messages.map((message) => `<div>${escapeHtml(message)}</div>`).join("");
    if (html === this.previousMessagesHtml) return;
    this.previousMessagesHtml = html;
    this.el.messages.innerHTML = html;
  }

  private renderSkillModal(choices: SkillChoice[] | null): void {
    this.el.skillModal.classList.toggle("open", choices !== null);
    if (!choices) {
      if (this.previousSkillChoicesHtml) {
        this.previousSkillChoicesHtml = "";
        this.el.skillChoices.innerHTML = "";
      }
      return;
    }
    const html = choices
      .map(
        (choice, index) => `
          <button class="choice" data-index="${index}" type="button">
            <strong>${index + 1}. ${escapeHtml(choice.name)}</strong>
            <span>${escapeHtml(choice.desc)}</span>
          </button>
        `
      )
      .join("");
    if (html === this.previousSkillChoicesHtml) return;
    this.previousSkillChoicesHtml = html;
    this.el.skillChoices.innerHTML = html;
    this.el.skillChoices.querySelectorAll<HTMLButtonElement>(".choice").forEach((node) => {
      node.addEventListener("click", () =>
        this.callbacks.dispatch({ type: "chooseSkill", index: Number(node.dataset.index ?? "0") })
      );
    });
  }

  private renderModeOverlays(state: GameState): void {
    const deathSummary =
      state.mode === "dead"
        ? `Floor ${state.floor}, level ${state.player.level}, ${state.player.gold} gold, ${state.kills} kills, ${Math.round(state.elapsedMs / 1000)} seconds.`
        : "";
    const modeKey = `${state.mode}:${deathSummary}`;
    if (modeKey === this.previousModeKey) return;
    this.previousModeKey = modeKey;
    this.el.pauseOverlay.hidden = state.mode !== "paused";
    this.el.deathOverlay.hidden = state.mode !== "dead";
    if (state.mode === "dead") {
      this.el.deathSummary.textContent = deathSummary;
    }
  }

  private renderMinimap(state: GameState): void {
    const now = performance.now();
    if (state.mode === "playing" && now - this.lastMinimapRenderMs < 250) return;
    this.lastMinimapRenderMs = now;
    const canvas = this.el.minimap;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#020303";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const vignette = ctx.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.5,
      10,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.72
    );
    vignette.addColorStop(0, "rgba(36, 52, 54, 0.18)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cell = Math.max(
      2,
      Math.floor(Math.min(canvas.width / state.dungeon.width, canvas.height / state.dungeon.height))
    );
    const ox = Math.floor((canvas.width - state.dungeon.width * cell) / 2);
    const oy = Math.floor((canvas.height - state.dungeon.height * cell) / 2);
    for (let y = 0; y < state.dungeon.height; y += 1) {
      for (let x = 0; x < state.dungeon.width; x += 1) {
        const tile = state.dungeon.tiles[idx(state.dungeon, x, y)] as Tile;
        if (tile === Tile.Void) continue;
        if (tile === Tile.Wall) ctx.fillStyle = "rgba(69, 74, 69, 0.06)";
        else ctx.fillStyle = "rgba(63, 91, 94, 0.12)";
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }
    for (let y = 0; y < state.dungeon.height; y += 1) {
      for (let x = 0; x < state.dungeon.width; x += 1) {
        const index = idx(state.dungeon, x, y);
        const memory = state.dungeon.memory[index];
        if (memory <= 0.01) continue;
        const tile = state.dungeon.tiles[index] as Tile;
        if (tile === Tile.Wall || tile === Tile.Void) ctx.fillStyle = `rgba(88, 88, 80, ${0.34 * memory})`;
        else
          ctx.fillStyle = state.dungeon.visible[index] ? "#c38946" : `rgba(75, 120, 136, ${0.52 * memory})`;
        ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
    }
    for (const monster of state.monsters) {
      const mx = Math.round(monster.x);
      const my = Math.round(monster.y);
      if (mx < 0 || my < 0 || mx >= state.dungeon.width || my >= state.dungeon.height) continue;
      const index = idx(state.dungeon, mx, my);
      if (!state.dungeon.visible[index]) continue;
      ctx.fillStyle = monster.elite ? "#e15d4d" : "#9fb167";
      ctx.fillRect(ox + mx * cell, oy + my * cell, cell + 1, cell + 1);
    }
    ctx.fillStyle = "#ffd17a";
    ctx.fillRect(
      ox + Math.round(state.player.x) * cell - 1,
      oy + Math.round(state.player.y) * cell - 1,
      cell + 2,
      cell + 2
    );
    ctx.fillStyle = "#75aee8";
    ctx.fillRect(ox + state.dungeon.stairs.x * cell, oy + state.dungeon.stairs.y * cell, cell + 1, cell + 1);
  }

  private renderDebug(state: GameState): void {
    this.el.debugOverlay.hidden = !state.debug.enabled;
    if (!state.debug.enabled) return;
    const now = performance.now();
    if (this.previousDebugHtml && now - this.lastDebugRenderMs < 250) return;
    const rows = [
      `FPS ${state.debug.fps} · avg ${state.debug.avgFps} · p95 ${state.debug.p95FrameMs}ms · slow ${state.debug.slowFrames}/${state.debug.sampleFrames}`,
      `Frame ${state.debug.frameMs}ms · update ${state.debug.updateMs}ms · render ${state.debug.renderMs}ms`,
      `Scene ${state.sceneId} · seed ${state.seed} · floor ${state.floor} · commands ${state.turn}`,
      `Player ${state.player.x.toFixed(2)},${state.player.y.toFixed(2)} · entities ${state.monsters.length} · command ${state.debug.lastCommand}`,
      `Draw ${state.debug.drawCalls} · tris ${state.debug.triangles} · objects ${state.debug.objects} · sprites ${state.debug.animatedSprites} · fx ${state.debug.particles}`,
      `Replay ${replayLabel(state.replay)}`,
      `Missing assets ${state.debug.missingAssets.length} · missing audio ${state.debug.missingAudio.length}`
    ];
    const html = `
      <div data-debug-rows>
        ${rows.map((_, index) => `<div data-debug-row="${index}"></div>`).join("")}
      </div>
      <div class="debug-buttons">
        <button data-flag="showCollision">Collision</button>
        <button data-flag="showLos">LOS</button>
        <button data-flag="showFogMemory">Fog</button>
        <button data-flag="showRoomGraph">Rooms</button>
        <button data-flag="showMonsterTargets">Targets</button>
        <button data-flag="showReplayLog">Replay</button>
        <button data-replay="true">Run Replay</button>
      </div>
      ${state.debug.showReplayLog ? `<pre data-debug-replay></pre>` : ""}
      ${
        state.debug.missingAssets.length || state.debug.missingAudio.length
          ? `<pre data-debug-missing></pre>`
          : ""
      }
    `;
    const structureKey = `${state.debug.showReplayLog}:${state.debug.missingAssets.length}:${state.debug.missingAudio.length}`;
    if (structureKey !== this.previousDebugHtml || !this.el.debugOverlay.querySelector("[data-debug-rows]")) {
      this.previousDebugHtml = structureKey;
      this.el.debugOverlay.innerHTML = html;
    }
    this.lastDebugRenderMs = now;
    this.el.debugOverlay.querySelectorAll<HTMLElement>("[data-debug-row]").forEach((node) => {
      const index = Number(node.dataset.debugRow ?? "-1");
      node.textContent = rows[index] ?? "";
    });
    const replayLog = this.el.debugOverlay.querySelector<HTMLElement>("[data-debug-replay]");
    if (replayLog) {
      replayLog.textContent = state.replay.actions
        .slice(-12)
        .map((entry) => `${(entry.elapsedMs / 1000).toFixed(1)}s · ${entry.turn}: ${entry.action.type}`)
        .join("\n");
    }
    const missingLog = this.el.debugOverlay.querySelector<HTMLElement>("[data-debug-missing]");
    if (missingLog)
      missingLog.textContent = [...state.debug.missingAssets, ...state.debug.missingAudio].join("\n");
  }
}
