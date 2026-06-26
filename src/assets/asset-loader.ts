import type { AtlasFrame, AtlasManifest } from "./manifest";

export type LoadedAtlas = {
  manifest: AtlasManifest;
  images: Map<string, HTMLImageElement>;
  missing: string[];
};

function loadImage(path: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${path}`));
    image.src = path;
  });
}

export async function loadAtlas(manifest: AtlasManifest): Promise<LoadedAtlas> {
  const images = new Map<string, HTMLImageElement>();
  const missing: string[] = [];

  await Promise.all(
    Object.entries(manifest.images).map(async ([key, meta]) => {
      try {
        images.set(key, await loadImage(meta.path));
      } catch {
        missing.push(meta.path);
      }
    })
  );

  return { manifest, images, missing };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  atlas: LoadedAtlas,
  frameName: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const frame: AtlasFrame | undefined = atlas.manifest.frames[frameName];
  if (!frame) return;
  const image = atlas.images.get(String(frame.atlas));
  if (!image) return;
  ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x, y, width, height);
}
