import type { AudioCueId } from "../core/types";
import type { AudioCue } from "./manifest";

export class AudioMixer {
  private context: AudioContext | null = null;
  private buffers = new Map<AudioCueId, AudioBuffer>();
  private loops = new Map<AudioCueId, AudioBufferSourceNode>();
  private cueMap: Map<AudioCueId, AudioCue>;
  private unlocked = false;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  readonly missing: string[] = [];

  constructor(cues: AudioCue[]) {
    this.cueMap = new Map(cues.map((cue) => [cue.id, cue]));
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.ambienceGain = this.context.createGain();
    this.sfxGain = this.context.createGain();
    this.masterGain.gain.value = 0.85;
    this.ambienceGain.gain.value = 0.85;
    this.sfxGain.gain.value = 1;
    this.ambienceGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
    await this.context.resume();
    await this.preload();
    this.unlocked = true;
    this.play("ambience-crypt-loop");
    this.play("torch-loop");
  }

  setPaused(paused: boolean): void {
    if (!this.ambienceGain || !this.context) return;
    this.ambienceGain.gain.setTargetAtTime(paused ? 0.25 : 0.85, this.context.currentTime, 0.08);
  }

  play(id: AudioCueId | undefined): void {
    if (!id || !this.context || !this.unlocked) return;
    const cue = this.cueMap.get(id);
    const buffer = this.buffers.get(id);
    if (!cue || !buffer) return;
    if (cue.loop && this.loops.has(id)) return;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = cue.loop;
    source.playbackRate.value = cue.loop ? 1 : 0.96 + Math.random() * 0.08;
    gain.gain.value = cue.volume * (cue.loop ? 1 : 0.88 + Math.random() * 0.18);
    source.connect(gain);
    gain.connect(cue.category === "ambience" ? this.ambienceGain! : this.sfxGain!);
    source.start();
    if (cue.loop) this.loops.set(id, source);
  }

  private async preload(): Promise<void> {
    if (!this.context) return;
    await Promise.all(
      [...this.cueMap.values()].map(async (cue) => {
        if (!cue.preload) return;
        try {
          const response = await fetch(cue.path);
          if (!response.ok) throw new Error(response.statusText);
          const data = await response.arrayBuffer();
          this.buffers.set(cue.id, await this.context!.decodeAudioData(data));
        } catch {
          this.missing.push(cue.path);
        }
      })
    );
  }
}
