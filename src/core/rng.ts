export class RNG {
  seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(list: readonly T[]): T {
    if (!list.length) {
      throw new Error("Cannot pick from an empty list.");
    }
    return list[Math.floor(this.next() * list.length)]!;
  }

  weighted<T>(list: readonly { value: T; weight: number }[]): T {
    const total = list.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = this.next() * total;
    for (const entry of list) {
      roll -= entry.weight;
      if (roll <= 0) return entry.value;
    }
    return list[list.length - 1]!.value;
  }
}

export function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
