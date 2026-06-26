import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { atlasManifest } from "./manifest";

function toFilePath(path: string): string {
  if (path.startsWith("file://")) return fileURLToPath(path);
  if (path.startsWith("http://") || path.startsWith("https://")) throw new Error(`Remote runtime asset URL is not allowed: ${path}`);
  return path;
}

export function validateAtlasManifest(): string[] {
  const errors: string[] = [];

  for (const [key, image] of Object.entries(atlasManifest.images)) {
    try {
      const filePath = toFilePath(image.path);
      if (!existsSync(filePath)) errors.push(`Missing atlas image ${key}: ${filePath}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const [name, frame] of Object.entries(atlasManifest.frames)) {
    const image = atlasManifest.images[String(frame.atlas)];
    if (!image) {
      errors.push(`Frame ${name} uses missing atlas ${String(frame.atlas)}`);
      continue;
    }
    if (frame.x < 0 || frame.y < 0 || frame.w <= 0 || frame.h <= 0 || frame.x + frame.w > image.width || frame.y + frame.h > image.height) {
      errors.push(`Frame ${name} is outside ${String(frame.atlas)} bounds`);
    }
  }

  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = validateAtlasManifest();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Validated ${Object.keys(atlasManifest.frames).length} atlas frames.`);
}
