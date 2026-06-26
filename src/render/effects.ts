import type { EffectEvent, GameState } from "../core/types";

type LiveEffect = EffectEvent & {
  age: number;
  duration: number;
};

export type EffectProjector = (x: number, y: number) => { x: number; y: number; scale: number };

export class EffectLayer {
  private effects: LiveEffect[] = [];
  private shake = 0;

  add(events: EffectEvent[]): void {
    for (const event of events) {
      if (event.type === "message" || event.type === "audio") continue;
      if (event.type === "damage" && event.amount === undefined) continue;
      const duration = event.type === "damage" ? 720 : event.type === "floor-transition" ? 900 : 560;
      this.effects.push({ ...event, age: 0, duration });
      if (event.heavy || event.type === "floor-transition") this.shake = Math.max(this.shake, event.type === "floor-transition" ? 8 : 5);
    }
  }

  update(dt: number, paused: boolean): void {
    if (!paused) {
      for (const effect of this.effects) effect.age += dt;
      this.effects = this.effects.filter((effect) => effect.age < effect.duration);
      this.shake *= 0.86;
      if (this.shake < 0.05) this.shake = 0;
    }
  }

  offset(now: number): { x: number; y: number } {
    if (this.shake <= 0) return { x: 0, y: 0 };
    return {
      x: Math.sin(now * 0.071) * this.shake,
      y: Math.cos(now * 0.061) * this.shake
    };
  }

  draw(ctx: CanvasRenderingContext2D, state: GameState, tileSize: number, project?: EffectProjector): void {
    for (const effect of this.effects) {
      if (effect.x === undefined || effect.y === undefined) continue;
      const progress = Math.min(1, effect.age / effect.duration);
      const projected = project?.(effect.x, effect.y);
      const x = projected?.x ?? effect.x * tileSize + tileSize / 2;
      const y = projected?.y ?? effect.y * tileSize + tileSize / 2;
      const scale = projected?.scale ?? tileSize;
      if (effect.type === "damage") {
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.fillStyle = effect.color ?? "#f3ede0";
        ctx.font = `900 ${Math.max(14, scale * 0.24)}px ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 12;
        ctx.fillText(String(effect.amount ?? ""), x, y - scale * (0.72 + progress * 0.82));
        ctx.restore();
      } else if (effect.type === "pickup" || effect.type === "loot-beam") {
        const radius = scale * (0.18 + progress * 0.54);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = effect.color ?? "#f7cf70";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y + scale * 0.14, radius * 1.35, radius * 0.48, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (effect.type === "loot-beam") {
          const beam = ctx.createLinearGradient(x, y - scale * 3.2, x, y + scale * 0.22);
          beam.addColorStop(0, "rgba(255,255,255,0)");
          beam.addColorStop(0.2, effect.color ?? "#75aee8");
          beam.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = effect.color ?? "#75aee8";
          ctx.fillStyle = beam;
          ctx.fillRect(x - scale * 0.035, y - scale * 3.2, scale * 0.07, scale * 3.4);
        }
        ctx.restore();
      } else if (effect.type === "shrine" || effect.type === "buff-expire") {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.8 * (1 - progress);
        ctx.strokeStyle = effect.color ?? "#f2a84b";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y + scale * 0.1, scale * (0.45 + progress * 1.1), scale * (0.22 + progress * 0.45), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (effect.type === "door") {
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = "#f2a84b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - scale * 0.32, y - scale * 0.12);
        ctx.lineTo(x + scale * 0.32, y - scale * 0.12);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (state.mode === "skill-choice") {
      ctx.save();
      ctx.fillStyle = "rgba(2, 2, 3, 0.32)";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }
}
