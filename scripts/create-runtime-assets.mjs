import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const rawDir = resolve(root, "assets/source/raw-sheets");
const atlasDir = resolve(root, "assets/atlas");
const audioDir = resolve(root, "assets/audio");
const actorSheetDir = resolve(root, "assets/source/actor-sheets");
const environmentSheetDir = resolve(root, "assets/source/environment-sheets");
const environmentSheets = {
  floors: resolve(environmentSheetDir, "stone-floor-plates.png"),
  walls: resolve(environmentSheetDir, "wall-arch-door-kit.png"),
  props: resolve(environmentSheetDir, "dungeon-props-debris.png"),
  wallSpans: resolve(environmentSheetDir, "camera-matched-wall-spans-alpha.png")
};

mkdirSync(rawDir, { recursive: true });
mkdirSync(atlasDir, { recursive: true });
mkdirSync(audioDir, { recursive: true });

function writeAsset(name, width, height, body, defs = "") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.8"/></filter>
    <linearGradient id="slotMetal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6b5738"/><stop offset=".35" stop-color="#181714"/><stop offset="1" stop-color="#030303"/></linearGradient>
    <radialGradient id="emberBloom"><stop stop-color="#fff2ba"/><stop offset=".28" stop-color="#f3a14b" stop-opacity=".62"/><stop offset="1" stop-color="#d55a28" stop-opacity="0"/></radialGradient>
    ${defs}
  </defs>
  <rect width="${width}" height="${height}" fill="transparent"/>
  ${body}
</svg>`;
  const svgPath = resolve(rawDir, `${name}.svg`);
  const atlasPath = resolve(atlasDir, `${name}.png`);
  writeFileSync(svgPath, svg);
  const result = spawnSync("convert", [svgPath, "-background", "none", "-alpha", "on", "-transparent", "white", atlasPath], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`convert failed for ${name}`);
}

function runConvert(args, label) {
  const result = spawnSync("convert", args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`convert failed for ${label}`);
}

function runImageTool(tool, args, label) {
  const result = spawnSync(tool, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${tool} failed for ${label}`);
}

function identifyImageSize(file) {
  const result = spawnSync("identify", ["-format", "%w %h", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`identify failed for ${file}`);
  const [width, height] = result.stdout.trim().split(/\s+/).map((value) => Number(value));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new Error(`Could not identify ${file}: ${result.stdout}`);
  return { width, height };
}

const environmentSheetGrid = { columns: 6, rows: 4 };

function environmentCellCrop(source, column, row) {
  const { width, height } = identifyImageSize(source);
  const { columns, rows } = environmentSheetGrid;
  if (width % columns !== 0 || height % rows !== 0)
    throw new Error(`Expected ${source} to be a ${columns}x${rows} grid; got ${width}x${height}`);
  if (column < 0 || column >= columns || row < 0 || row >= rows)
    throw new Error(`Environment crop out of range for ${source}: ${column},${row}`);
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  return `${cellWidth}x${cellHeight}+${column * cellWidth}+${row * cellHeight}`;
}

function writeEnvironmentCrop(source, crop, output, options = {}) {
  const {
    extent = "160x160",
    resize = extent,
    trim = false,
    modulate = "118,116,100",
    brightnessContrast = "6x10"
  } = options;
  const args = [source, "-crop", crop, "+repage", "-alpha", "set"];
  if (trim) args.push("-trim", "+repage");
  args.push("-filter", "Lanczos", "-resize", resize);
  if (modulate) args.push("-modulate", modulate);
  if (brightnessContrast) args.push("-brightness-contrast", brightnessContrast);
  args.push("-gravity", "center", "-background", "none", "-extent", extent, `PNG32:${output}`);
  runConvert(args, `environment-crop-${crop}`);
}

function writeEnvironmentCell(source, column, row, output, options = {}) {
  writeEnvironmentCrop(source, environmentCellCrop(source, column, row), output, options);
}

function writeEnvironmentAtlasCell(cell, frameSize, output) {
  const options = {
    extent: `${frameSize}x${frameSize}`,
    resize: `${frameSize}x${frameSize}${cell.fill ? "!" : ">"}`,
    trim: cell.trim ?? false,
    modulate: cell.modulate ?? "120,114,100",
    brightnessContrast: cell.brightnessContrast ?? "7x10"
  };
  if (cell.crop) writeEnvironmentCrop(cell.source, cell.crop, output, options);
  else writeEnvironmentCell(cell.source, cell.column, cell.row, output, options);
}

function writeEnvironmentAtlas(name, frameSize, cells) {
  if (!cells.every((cell) => existsSync(cell.source))) return false;
  const tempDir = mkdtempSync(resolve(tmpdir(), `${name}-`));
  try {
    const frameOutputs = cells.map((cell, index) => {
      const output = resolve(tempDir, `${String(index).padStart(2, "0")}-${cell.label}.png`);
      writeEnvironmentAtlasCell(cell, frameSize, output);
      return output;
    });
    runConvert([...frameOutputs, "+append", `PNG32:${resolve(atlasDir, `${name}.png`)}`], name);
    return true;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeEnvironmentFloorAtlas() {
  return writeEnvironmentAtlas("environment-floor-atlas", 160, [
    {
      label: "slab",
      source: environmentSheets.floors,
      column: 0,
      row: 0,
      fill: true,
      modulate: "124,116,100",
      brightnessContrast: "9x11"
    },
    {
      label: "rune",
      source: environmentSheets.floors,
      column: 3,
      row: 2,
      fill: true,
      modulate: "124,120,100",
      brightnessContrast: "8x12"
    },
    {
      label: "compass",
      source: environmentSheets.floors,
      column: 4,
      row: 0,
      fill: true,
      modulate: "124,110,100",
      brightnessContrast: "8x10"
    },
    {
      label: "grate",
      source: environmentSheets.props,
      column: 0,
      row: 2,
      fill: true,
      modulate: "128,110,100",
      brightnessContrast: "9x12"
    },
    {
      label: "rubble",
      source: environmentSheets.floors,
      column: 2,
      row: 1,
      fill: true,
      modulate: "126,116,100",
      brightnessContrast: "8x12"
    },
    {
      label: "cracked",
      source: environmentSheets.floors,
      column: 1,
      row: 1,
      fill: true,
      modulate: "126,116,100",
      brightnessContrast: "8x12"
    }
  ]);
}

function writeEnvironmentDungeonAtlas() {
  return writeEnvironmentAtlas("dungeon-atlas", 128, [
    { label: "slab", source: environmentSheets.floors, column: 0, row: 0, fill: true, modulate: "122,114,100" },
    { label: "cracked", source: environmentSheets.floors, column: 1, row: 1, fill: true, modulate: "124,116,100" },
    { label: "rune", source: environmentSheets.floors, column: 3, row: 2, fill: true, modulate: "124,120,100" },
    { label: "grate", source: environmentSheets.props, column: 0, row: 2, fill: true, modulate: "128,110,100" }
  ]);
}

function writeEnvironmentWallsDoorsAtlas() {
  return writeEnvironmentAtlas("walls-doors-atlas", 128, [
    { label: "wall-face", source: environmentSheets.walls, column: 2, row: 0, trim: true, modulate: "136,112,100", brightnessContrast: "11x14" },
    { label: "wall-top", source: environmentSheets.walls, crop: "256x132+256+256", trim: true, modulate: "136,112,100", brightnessContrast: "10x13" },
    { label: "door-closed", source: environmentSheets.walls, column: 2, row: 2, trim: true, modulate: "134,112,100", brightnessContrast: "10x13" },
    { label: "door-open", source: environmentSheets.walls, column: 1, row: 2, trim: true, modulate: "136,112,100", brightnessContrast: "10x13" }
  ]);
}

const environmentWallKitFrameSize = 192;
const environmentWallKitFrames = [
  { id: "env-wall-window", column: 0, row: 0 },
  { id: "env-wall-blocks", column: 1, row: 0 },
  { id: "env-wall-triple-arch", column: 2, row: 0 },
  { id: "env-wall-cracked", column: 3, row: 0 },
  { id: "env-wall-niche", column: 4, row: 0 },
  { id: "env-wall-arcade", column: 5, row: 0 },
  { id: "env-wall-cap-arcade", column: 0, row: 1 },
  { id: "env-wall-cap-block", column: 1, row: 1 },
  { id: "env-wall-cap-heavy", column: 2, row: 1 },
  { id: "env-arch-gothic", column: 3, row: 1 },
  { id: "env-arch-round", column: 4, row: 1 },
  { id: "env-arch-clover", column: 5, row: 1 },
  { id: "env-door-wood", column: 0, row: 2 },
  { id: "env-door-open", column: 1, row: 2 },
  { id: "env-door-iron", column: 2, row: 2 },
  { id: "env-door-open-side", column: 3, row: 2 },
  { id: "env-wall-ruin-low", column: 4, row: 2 },
  { id: "env-wall-ruin-corner", column: 5, row: 2 },
  { id: "env-pillar-left", column: 0, row: 3 },
  { id: "env-pillar-right", column: 1, row: 3 },
  { id: "env-stone-railing", column: 2, row: 3 },
  { id: "env-iron-fence", column: 3, row: 3 },
  { id: "env-wall-torch-banner", column: 4, row: 3 },
  { id: "env-banner-wide", column: 5, row: 3 }
];

function writeEnvironmentWallKitAtlas() {
  return writeEnvironmentAtlas(
    "environment-wall-kit-atlas",
    environmentWallKitFrameSize,
    environmentWallKitFrames.map((frame) => ({
      label: frame.id,
      source: environmentSheets.walls,
      column: frame.column,
      row: frame.row,
      trim: true,
      modulate: "138,116,100",
      brightnessContrast: "11x14"
    }))
  );
}

const environmentWallSpanFrame = { width: 768, height: 384 };
const environmentWallSpanFrames = [
  { id: "env-span-north-wall", crop: "768x512+0+0" },
  { id: "env-span-door-arch", crop: "768x512+768+0" },
  { id: "env-span-side-return", crop: "768x512+0+512" },
  { id: "env-span-foreground-occluder", crop: "768x512+768+512" }
];

function writeEnvironmentWallSpanAtlas() {
  const source = environmentSheets.wallSpans;
  if (!existsSync(source)) return false;
  const tempDir = mkdtempSync(resolve(tmpdir(), "environment-wall-spans-"));
  try {
    const frameOutputs = environmentWallSpanFrames.map((frame, index) => {
      const output = resolve(tempDir, `${String(index).padStart(2, "0")}-${frame.id}.png`);
      runConvert(
        [
          source,
          "-crop",
          frame.crop,
          "+repage",
          "-alpha",
          "set",
          "-filter",
          "Lanczos",
          "-resize",
          `${environmentWallSpanFrame.width}x${environmentWallSpanFrame.height}>`,
          "-modulate",
          "158,126,100",
          "-brightness-contrast",
          "24x18",
          "-channel",
          "RGB",
          "-level",
          "0%,78%,0.92",
          "+channel",
          "-channel",
          "A",
          "-level",
          "2%,88%",
          "+channel",
          "-gravity",
          "center",
          "-background",
          "none",
          "-extent",
          `${environmentWallSpanFrame.width}x${environmentWallSpanFrame.height}`,
          `PNG32:${output}`
        ],
        `environment-wall-span-${frame.id}`
      );
      return output;
    });
    runConvert([...frameOutputs, "+append", `PNG32:${resolve(atlasDir, "environment-wall-spans-atlas.png")}`], "environment-wall-spans-atlas");
    return true;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const environmentSpriteOverrides = {
  brazier: { source: environmentSheets.props, column: 2, row: 1, resize: "146x146>", modulate: "132,124,100", brightnessContrast: "8x12" },
  obelisk: { source: environmentSheets.props, column: 3, row: 1, resize: "128x156>", modulate: "134,126,102", brightnessContrast: "8x12" },
  candles: { source: environmentSheets.props, column: 0, row: 0, resize: "136x154>", modulate: "136,124,100", brightnessContrast: "9x12" },
  bones: { source: environmentSheets.props, column: 1, row: 0, resize: "150x126>", modulate: "132,112,100", brightnessContrast: "8x12" },
  skulls: { source: environmentSheets.props, column: 5, row: 2, resize: "142x122>", modulate: "132,112,100", brightnessContrast: "8x12" },
  gold: { source: environmentSheets.props, column: 5, row: 0, resize: "136x118>", modulate: "136,126,100", brightnessContrast: "8x12" },
  treasure: { source: environmentSheets.props, column: 0, row: 1, resize: "150x136>", modulate: "134,124,100", brightnessContrast: "8x12" },
  "wall-banner": { source: environmentSheets.walls, column: 4, row: 3, resize: "112x156>", modulate: "132,118,100", brightnessContrast: "9x13" },
  "wall-banner-side": { source: environmentSheets.walls, column: 5, row: 3, resize: "118x156>", modulate: "132,118,100", brightnessContrast: "9x13" },
  "wall-broken": { source: environmentSheets.walls, column: 4, row: 2, resize: "150x150>", modulate: "136,112,100", brightnessContrast: "10x14" },
  "wall-broken-side": { source: environmentSheets.walls, column: 5, row: 2, resize: "150x150>", modulate: "136,112,100", brightnessContrast: "10x14" },
  "wall-arch": { source: environmentSheets.walls, column: 3, row: 1, resize: "154x160>", modulate: "138,112,100", brightnessContrast: "10x14" },
  "wall-arch-side": { source: environmentSheets.walls, column: 5, row: 1, resize: "154x160>", modulate: "138,112,100", brightnessContrast: "10x14" },
  "door-boss": { source: environmentSheets.walls, column: 2, row: 2, resize: "146x156>", modulate: "136,112,100", brightnessContrast: "10x14" }
};

function writeRasterAssetSheet() {
  const sheet = resolve(root, "raster_asset_sheet.png");
  const spriteSheet = existsSync(resolve(root, "raster_atlas_sprite.png")) ? resolve(root, "raster_atlas_sprite.png") : sheet;
  const spriteSheetHasLightMatte = spriteSheet.endsWith("raster_atlas_sprite.png");
  if (!existsSync(sheet)) {
    console.warn("raster_asset_sheet.png not found; generated raster art will be skipped.");
    return;
  }

  copyFileSync(sheet, resolve(atlasDir, "raster-asset-sheet.png"));
  runConvert([sheet, "-crop", "1536x132+0+892", "+repage", "-resize", "512x512!", "-blur", "0x4.4", "-modulate", "68,112,96", resolve(atlasDir, "raster-panel-texture.png")], "raster-panel-texture");
  runConvert([sheet, "-crop", "760x128+476+896", "+repage", "-resize", "768x128!", "-modulate", "74,116,96", resolve(atlasDir, "raster-hotbar-texture.png")], "raster-hotbar-texture");
  runConvert([sheet, "-crop", "238x128+0+892", "+repage", "-resize", "238x680!", "-modulate", "72,112,96", resolve(atlasDir, "raster-left-panel-chrome.png")], "raster-left-panel-chrome");
  runConvert([sheet, "-crop", "286x128+1250+892", "+repage", "-resize", "286x610!", "-modulate", "72,112,96", resolve(atlasDir, "raster-right-panel-chrome.png")], "raster-right-panel-chrome");
  runConvert([sheet, "-crop", "138x136+18+422", "+repage", "-resize", "168x168!", "-modulate", "86,116,96", resolve(atlasDir, "raster-ui-portrait.png")], "raster-ui-portrait");
  runConvert([sheet, "-crop", "72x70+8+692", "+repage", "-resize", "96x96!", resolve(atlasDir, "raster-ui-potion.png")], "raster-ui-potion");
  runConvert([sheet, "-crop", "92x76+590+688", "+repage", "-resize", "96x96!", resolve(atlasDir, "raster-ui-weapon.png")], "raster-ui-weapon");
  runConvert([sheet, "-crop", "94x82+742+686", "+repage", "-resize", "96x96!", resolve(atlasDir, "raster-ui-armor.png")], "raster-ui-armor");
  runConvert([sheet, "-crop", "80x80+1030+688", "+repage", "-resize", "96x96!", resolve(atlasDir, "raster-ui-charm.png")], "raster-ui-charm");
  runConvert([sheet, "-crop", "112x102+1000+312", "+repage", "-resize", "96x96!", resolve(atlasDir, "raster-ui-gold.png")], "raster-ui-gold");
  runConvert([sheet, "-crop", "130x132+172+294", "+repage", "-resize", "96x96!", resolve(atlasDir, "raster-ui-shrine.png")], "raster-ui-shrine");
  runConvert([sheet, "-crop", "142x178+1172+126", "+repage", "-resize", "96x96!", resolve(atlasDir, "raster-ui-stairs.png")], "raster-ui-stairs");
  runConvert([sheet, "-crop", "154x118+324+0", "+repage", "-resize", "96x96!", resolve(atlasDir, "raster-ui-rune.png")], "raster-ui-rune");

  const spriteDir = resolve(root, "assets/source/raster-sprites");
  mkdirSync(spriteDir, { recursive: true });
  const legacySprites = [
    ["player", "138x136+18+422", "112x128"],
    ["fiend", "150x116+0+564", "140x108"],
    ["bone-warden", "135x126+570+558", "144x148"],
    ["ash-chanter", "132x126+1204+558", "144x148"],
    ["brazier", "150x116+0+306", "140x108"],
    ["obelisk", "130x132+172+294", "112x132"],
    ["candles", "98x116+340+304", "96x112"],
    ["bones", "150x118+482+300", "140x104"],
    ["skulls", "150x112+672+304", "140x100"],
    ["gold", "112x102+1000+312", "112x96"],
    ["treasure", "160x120+1364+300", "146x110"],
    ["potion", "72x70+8+692", "82x82"],
    ["weapon", "92x76+590+688", "96x82"],
    ["armor", "94x82+742+686", "96x92"],
    ["charm", "80x80+1030+688", "86x86"],
    ["wall-torch", "150x178+4+126", "136x160"],
    ["wall-banner", "142x178+318+126", "128x160"],
    ["wall-broken", "150x178+500+126", "136x160"],
    ["wall-arch", "142x178+680+126", "128x160"],
    ["door-boss", "178x178+858+126", "160x160"],
    ["stairs", "142x178+1172+126", "128x160"],
    ["wall-torch-side", "150x178+162+126", "136x160"],
    ["wall-banner-side", "150x178+1032+126", "136x160"],
    ["wall-broken-side", "150x178+500+126", "136x160"],
    ["wall-arch-side", "150x178+1328+126", "136x160"]
  ];
  const savedAtlasSprites = [
    ["player", "130x160+30+526", "120x144"],
    ["fiend", "150x128+8+700", "150x118"],
    ["bone-warden", "122x148+632+690", "128x148"],
    ["ash-chanter", "142x136+1374+692", "128x148"],
    ["brazier", "145x190+36+325", "145x130"],
    ["obelisk", "145x175+218+356", "116x144"],
    ["candles", "145x150+410+355", "100x118"],
    ["bones", "170x132+590+370", "144x100"],
    ["skulls", "110x100+780+388", "132x92"],
    ["gold", "100x78+1068+405", "118x86"],
    ["treasure", "145x140+1346+374", "150x114"],
    ["potion", "104x168+512+832", "82x98"],
    ["weapon", "108x170+1036+826", "104x92"],
    ["armor", "108x168+900+830", "102x102"],
    ["charm", "104x166+636+832", "94x106"],
    ["wall-torch", "130x190+154+154", "136x160"],
    ["wall-banner", "110x190+300+150", "128x160"],
    ["wall-broken", "205x198+500+150", "142x160"],
    ["wall-arch", "112x172+830+170", "128x160"],
    ["door-boss", "140x194+1060+158", "144x160"],
    ["stairs", "142x110+1208+26", "128x100"],
    ["wall-torch-side", "126x190+10+154", "136x160"],
    ["wall-banner-side", "140x186+1374+160", "136x160"],
    ["wall-broken-side", "112x172+716+178", "136x160"],
    ["wall-arch-side", "145x190+1216+158", "136x160"]
  ];
  const sprites = spriteSheetHasLightMatte ? savedAtlasSprites : legacySprites;
  const spriteOutputs = sprites.map(([name]) => resolve(spriteDir, `${name}.png`));
  for (let i = 0; i < sprites.length; i += 1) {
    const [name, crop, resize] = sprites[i];
    const environmentOverride = environmentSpriteOverrides[name];
    if (environmentOverride && existsSync(environmentOverride.source)) {
      writeEnvironmentCell(environmentOverride.source, environmentOverride.column, environmentOverride.row, spriteOutputs[i], {
        extent: "160x160",
        resize: environmentOverride.resize,
        trim: true,
        modulate: environmentOverride.modulate,
        brightnessContrast: environmentOverride.brightnessContrast
      });
      continue;
    }
    const matteArgs = spriteSheetHasLightMatte
      ? [
          "-fuzz",
          "10%",
          "-transparent",
          "#f8f8f8",
          "-transparent",
          "#eeeeee",
          "-transparent",
          "#e8e8e8",
          "-bordercolor",
          "#f7f7f7",
          "-border",
          "2",
          "-fuzz",
          "12%",
          "-fill",
          "none",
          "-draw",
          "color 0,0 floodfill",
          "-shave",
          "2x2",
          "-trim",
          "+repage"
        ]
      : ["-bordercolor", "#050809", "-border", "2", "-fuzz", "8%", "-fill", "none", "-draw", "color 0,0 floodfill", "-shave", "2x2"];
    runConvert(
      [
        spriteSheet,
        "-crop",
        crop,
        "+repage",
        "-alpha",
        "set",
        ...matteArgs,
        "-resize",
        resize,
        "-gravity",
        "center",
        "-background",
        "none",
        "-extent",
        "160x160",
        spriteOutputs[i]
      ],
      `raster-sprite-${name}`
    );
  }
  runConvert([...spriteOutputs, "+append", resolve(atlasDir, "raster-sprites-atlas.png")], "raster-sprites-atlas");
}

const actorSheetSources = [
  { frame: "sprite-player", sheet: "player-torchbearer.png" },
  { frame: "sprite-fiend", sheet: "gutter-fiend.png" },
  { frame: "sprite-bone-warden", sheet: "bone-warden.png" },
  { frame: "sprite-ash-chanter", sheet: "ash-chanter.png" }
];

const legacyActorBases = [
  { frame: "sprite-player", file: "player", scale: 1.02 },
  { frame: "sprite-fiend", file: "fiend", scale: 0.95, eraseRects: [[58, 132, 11, 11]] },
  { frame: "sprite-bone-warden", file: "bone-warden", scale: 1.06, eraseRects: [[78, 148, 10, 10]] },
  { frame: "sprite-ash-chanter", file: "ash-chanter", scale: 1.02, eraseRects: [[44, 125, 10, 10]] }
];

const actorDirections = [
  { id: "east", mirror: false, scaleX: 0.88, yOffset: 1, shade: 0.96, sign: 1 },
  { id: "southeast", mirror: false, scaleX: 0.98, yOffset: 0, shade: 1.05, sign: 1 },
  { id: "south", mirror: false, scaleX: 1.03, yOffset: 0, shade: 1.1, sign: 1 },
  { id: "southwest", mirror: true, scaleX: 0.98, yOffset: 0, shade: 1.05, sign: -1 },
  { id: "west", mirror: true, scaleX: 0.88, yOffset: 1, shade: 0.96, sign: -1 },
  { id: "northwest", mirror: true, scaleX: 0.9, yOffset: 2, shade: 0.78, sign: -1 },
  { id: "north", mirror: false, scaleX: 0.86, yOffset: 3, shade: 0.72, sign: 1 },
  { id: "northeast", mirror: false, scaleX: 0.9, yOffset: 2, shade: 0.78, sign: 1 }
];

const actorAnimations = [
  { id: "idle", frames: 2 },
  { id: "run", frames: 4 },
  { id: "attack", frames: 3 },
  { id: "hit", frames: 2 },
  { id: "death", frames: 3 }
];
const actorSheetColumns = 14;
const actorSheetRows = 8;
const actorAtlasFrameWidth = 150;
const actorAtlasFrameHeight = 180;
const actorAtlasColumns = 28;
const actorAtlasRows = 16;

function actorAnimationColumnOffset(animationId) {
  let offset = 0;
  for (const animation of actorAnimations) {
    if (animation.id === animationId) return offset;
    offset += animation.frames;
  }
  throw new Error(`Unknown actor animation: ${animationId}`);
}

function signedOffset(value) {
  return value < 0 ? String(value) : `+${value}`;
}

function actorActionTransform(animation, frameIndex) {
  if (animation === "run") {
    const step = frameIndex % 2 === 0 ? -1 : 1;
    return {
      xOffset: step * 2.4,
      yOffset: frameIndex === 1 || frameIndex === 2 ? -2.4 : 1.4,
      scaleX: frameIndex % 2 === 0 ? 0.96 : 1.04,
      scaleY: frameIndex % 2 === 0 ? 1.04 : 0.96,
      shade: 1.03,
      saturation: 112
    };
  }
  if (animation === "attack") {
    return {
      xOffset: frameIndex === 1 ? 6.8 : frameIndex === 2 ? 2.8 : 0,
      yOffset: frameIndex === 1 ? -1.2 : 0,
      scaleX: frameIndex === 1 ? 1.1 : 1.02,
      scaleY: frameIndex === 1 ? 0.93 : 1,
      shade: 1.1,
      saturation: 122
    };
  }
  if (animation === "hit") {
    return {
      xOffset: frameIndex === 0 ? -4.2 : -1.7,
      yOffset: frameIndex === 0 ? 1.7 : 0.4,
      scaleX: frameIndex === 0 ? 1.05 : 1,
      scaleY: frameIndex === 0 ? 0.94 : 1,
      shade: 1.13,
      saturation: 126
    };
  }
  if (animation === "death") {
    return {
      xOffset: -3.6 - frameIndex * 2.6,
      yOffset: 8 + frameIndex * 5,
      scaleX: 1.08 + frameIndex * 0.05,
      scaleY: 0.76 - frameIndex * 0.08,
      shade: 0.68 - frameIndex * 0.08,
      saturation: 78
    };
  }
  return {
    xOffset: frameIndex === 0 ? 0 : 0.9,
    yOffset: frameIndex === 0 ? 0 : -1,
    scaleX: frameIndex === 0 ? 1 : 1.015,
    scaleY: frameIndex === 0 ? 1 : 0.988,
    shade: 1,
    saturation: 106
  };
}

function actorGlowDrawArgs(actor, animation, frameIndex, direction) {
  const cx = direction.sign > 0 ? 98 : 62;
  const args = [];
  if (actor.frame === "sprite-player") {
    const alpha = animation === "attack" && frameIndex === 1 ? 0.22 : 0.12;
    args.push(
      "-fill",
      `srgba(255,150,45,${alpha})`,
      "-draw",
      `ellipse ${cx},45 18,22 0,360`
    );
  }
  if (actor.frame === "sprite-ash-chanter") {
    const alpha = animation === "attack" ? 0.2 : 0.08;
    args.push("-fill", `srgba(94,210,230,${alpha})`, "-draw", "ellipse 80,50 24,28 0,360");
  }
  return args;
}

function actorStrikeDrawArgs(actor, animation, frameIndex, direction) {
  if (animation !== "attack" && animation !== "hit") return [];
  const mirrorX = (x) => (direction.sign > 0 ? x : 160 - x);
  const color =
    actor.frame === "sprite-ash-chanter"
      ? "srgba(115,230,245,0.72)"
      : actor.frame === "sprite-bone-warden"
        ? "srgba(236,218,170,0.62)"
        : actor.frame === "sprite-fiend"
          ? "srgba(255,86,50,0.66)"
          : "srgba(255,178,66,0.72)";

  if (animation === "hit") {
    return [
      "-stroke",
      "srgba(255,95,58,0.62)",
      "-strokewidth",
      frameIndex === 0 ? "3" : "2",
      "-draw",
      `line ${mirrorX(86)},55 ${mirrorX(117)},48`,
      "-draw",
      `line ${mirrorX(78)},78 ${mirrorX(108)},89`
    ];
  }

  const strong = frameIndex === 1;
  return [
    "-stroke",
    color,
    "-strokewidth",
    strong ? "5" : "3",
    "-draw",
    `line ${mirrorX(84 + frameIndex * 3)},102 ${mirrorX(121 + frameIndex * 2)},43`,
    "-stroke",
    actor.frame === "sprite-ash-chanter" ? "srgba(30,145,170,0.34)" : "srgba(205,75,25,0.28)",
    "-strokewidth",
    strong ? "10" : "6",
    "-draw",
    `line ${mirrorX(80 + frameIndex * 2)},104 ${mirrorX(123 + frameIndex * 2)},42`
  ];
}

function actorFrameLabel(actor, animation, direction, frameIndex) {
  return `${actor.frame}:${animation}:${direction.id}:${frameIndex}`;
}

function writeActorSpriteAtlas() {
  const sheetSources = actorSheetSources.map((actor) => ({
    ...actor,
    source: resolve(actorSheetDir, actor.sheet)
  }));
  if (sheetSources.every((actor) => existsSync(actor.source))) {
    writeActorSpriteAtlasFromSheets(sheetSources);
    return;
  }
  writeActorSpriteAtlasFromLegacySprites();
}

function writeActorSpriteAtlasFromSheets(sheetSources) {
  const tempDir = mkdtempSync(resolve(tmpdir(), "torchline-actor-sheets-"));
  const frameOutputs = [];
  let frameIndex = 0;

  try {
    for (const actor of sheetSources) {
      const { width, height } = identifyImageSize(actor.source);
      if (width % actorSheetColumns !== 0 || height % actorSheetRows !== 0)
        throw new Error(`${actor.source} must divide into ${actorSheetColumns}x${actorSheetRows} equal cells`);
      const cellWidth = width / actorSheetColumns;
      const cellHeight = height / actorSheetRows;

      for (let directionIndex = 0; directionIndex < actorDirections.length; directionIndex += 1) {
        const direction = actorDirections[directionIndex];
        for (const animation of actorAnimations) {
          const columnOffset = actorAnimationColumnOffset(animation.id);
          for (let localFrame = 0; localFrame < animation.frames; localFrame += 1) {
            const sourceX = (columnOffset + localFrame) * cellWidth;
            const sourceY = directionIndex * cellHeight;
            const out = resolve(tempDir, `actor-${String(frameIndex).padStart(4, "0")}.png`);
            runConvert(
              [
                actor.source,
                "-crop",
                `${cellWidth}x${cellHeight}+${sourceX}+${sourceY}`,
                "+repage",
                "-alpha",
                "set",
                "-filter",
                "Lanczos",
                "-resize",
                `${actorAtlasFrameWidth}x${actorAtlasFrameHeight}`,
                "-gravity",
                "center",
                "-background",
                "none",
                "-extent",
                `${actorAtlasFrameWidth}x${actorAtlasFrameHeight}`,
                "-unsharp",
                "0x0.55+0.72+0.012",
                "-strip",
                `PNG32:${out}`
              ],
              `actor-sheet-frame-${actorFrameLabel(actor, animation.id, direction, localFrame)}`
            );
            frameOutputs.push(out);
            frameIndex += 1;
          }
        }
      }
    }

    runImageTool(
      "montage",
      [
        ...frameOutputs,
        "-tile",
        `${actorAtlasColumns}x${actorAtlasRows}`,
        "-geometry",
        `${actorAtlasFrameWidth}x${actorAtlasFrameHeight}+0+0`,
        "-background",
        "none",
        "-depth",
        "8",
        `PNG32:${resolve(atlasDir, "actor-sprites-atlas.png")}`
      ],
      "actor-sprites-atlas"
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeActorSpriteAtlasFromLegacySprites() {
  const spriteDir = resolve(root, "assets/source/raster-sprites");
  const tempDir = mkdtempSync(resolve(tmpdir(), "torchline-actors-"));
  const frameOutputs = [];
  let frameIndex = 0;

  try {
    for (const actor of legacyActorBases) {
      const source = resolve(spriteDir, `${actor.file}.png`);
      if (!existsSync(source)) {
        console.warn(`${source} not found; generated actor animation atlas will be skipped.`);
        return;
      }
      for (const direction of actorDirections) {
        for (const animation of actorAnimations) {
          for (let localFrame = 0; localFrame < animation.frames; localFrame += 1) {
            const action = actorActionTransform(animation.id, localFrame);
            const width = Math.round(160 * actor.scale * direction.scaleX * action.scaleX);
            const height = Math.round(160 * actor.scale * action.scaleY);
            const x = Math.round((160 - width) / 2 + action.xOffset * direction.sign);
            const y = Math.round((160 - height) / 2 + direction.yOffset + action.yOffset);
            const brightness = Math.max(40, Math.round(100 * direction.shade * action.shade));
            const saturation = Math.max(45, Math.round(action.saturation));
            const out = resolve(tempDir, `actor-${String(frameIndex).padStart(4, "0")}.png`);
            const sourceArgs = [
              source,
              "-alpha",
              "set",
              ...((actor.eraseRects ?? []).flatMap(([rectX, rectY, rectWidth, rectHeight]) => [
                "-region",
                `${rectWidth}x${rectHeight}+${rectX}+${rectY}`,
                "-channel",
                "A",
                "-evaluate",
                "set",
                "0",
                "+channel",
                "+region"
              ])),
              ...(direction.mirror ? ["-flop"] : []),
              "-resize",
              `${width}x${height}!`,
              "-modulate",
              `${brightness},${saturation},100`
            ];
            const args = [
              "-size",
              "160x160",
              "xc:none",
              ...actorGlowDrawArgs(actor, animation.id, localFrame, direction),
              "(",
              ...sourceArgs,
              ")",
              "-geometry",
              `${signedOffset(x)}${signedOffset(y)}`,
              "-compose",
              "over",
              "-composite",
              ...actorStrikeDrawArgs(actor, animation.id, localFrame, direction),
              "-resize",
              `${actorAtlasFrameWidth}x${actorAtlasFrameHeight}!`,
              out
            ];
            runConvert(args, `actor-frame-${actorFrameLabel(actor, animation.id, direction, localFrame)}`);
            frameOutputs.push(out);
            frameIndex += 1;
          }
        }
      }
    }

    runImageTool(
      "montage",
      [
        ...frameOutputs,
        "-tile",
        `${actorAtlasColumns}x${actorAtlasRows}`,
        "-geometry",
        `${actorAtlasFrameWidth}x${actorAtlasFrameHeight}+0+0`,
        "-background",
        "none",
        "-depth",
        "8",
        `PNG32:${resolve(atlasDir, "actor-sprites-atlas.png")}`
      ],
      "actor-sprites-atlas"
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function frame(x, body) {
  return `<g transform="translate(${x} 0)">${body}</g>`;
}

function scratches(seed = 0, color = "#090909", opacity = 0.32) {
  return Array.from({ length: 13 }, (_, i) => {
    const x = (17 + i * 23 + seed * 11) % 118;
    const y = (13 + i * 19 + seed * 17) % 118;
    const dx = ((i % 5) - 2) * 7;
    const dy = ((i % 4) - 1.5) * 5;
    return `<path d="M${x} ${y}l${dx} ${dy}l${8 - (i % 3) * 4} ${5 + (i % 4)}" stroke="${color}" stroke-width="${i % 3 === 0 ? 2 : 1}" opacity="${opacity}" fill="none" stroke-linecap="round"/>`;
  }).join("");
}

function stoneGrid(color = "#080909", opacity = 0.38) {
  return `
    <path d="M0 31H128M0 64H128M0 96H128M31 0V128M64 0V128M96 0V128" stroke="${color}" stroke-width="1" opacity="${opacity}"/>
    <path d="M31 0l8 31M96 31l-11 33M64 64l14 32M27 96l-12 32" stroke="${color}" stroke-width="1" opacity="${opacity * 0.8}"/>
  `;
}

writeAsset(
  "dungeon-atlas",
  512,
  128,
  [
    frame(
      0,
      `<rect width="128" height="128" fill="url(#floor0)"/>
       ${stoneGrid()}
       ${scratches(1, "#caa773", 0.16)}
       <circle cx="31" cy="92" r="5" fill="#80643a" opacity=".25"/>
       <circle cx="96" cy="41" r="3" fill="#c79a52" opacity=".22"/>`
    ),
    frame(
      128,
      `<rect width="128" height="128" fill="url(#floor1)"/>
       ${stoneGrid("#050606", 0.48)}
       ${scratches(4, "#ddc191", 0.22)}
       <path d="M15 82c18-17 31-13 45-5c16 9 30 5 51-10" stroke="#0a0b0b" stroke-width="5" opacity=".42" fill="none"/>
       <path d="M19 84c15-13 27-10 42-3" stroke="#b19a71" stroke-width="1" opacity=".28" fill="none"/>`
    ),
    frame(
      256,
      `<rect width="128" height="128" fill="url(#floor2)"/>
       ${stoneGrid("#080909", 0.36)}
       <circle cx="64" cy="64" r="29" fill="none" stroke="#a87638" stroke-width="3" opacity=".52"/>
       <circle cx="64" cy="64" r="18" fill="none" stroke="#f0b45c" stroke-width="1" opacity=".38"/>
       <path d="M64 26v76M26 64h76M38 38l52 52M90 38L38 90" stroke="#d29745" stroke-width="1" opacity=".3"/>
       ${scratches(8, "#0a0a0a", 0.28)}`
    ),
    frame(
      384,
      `<rect width="128" height="128" fill="url(#floor3)"/>
       ${stoneGrid("#050606", 0.32)}
       <rect x="31" y="30" width="66" height="66" fill="#070808" opacity=".82"/>
       <path d="M39 30v66M52 30v66M65 30v66M78 30v66M91 30v66M31 39h66M31 52h66M31 65h66M31 78h66M31 91h66" stroke="#56605a" stroke-width="2" opacity=".62"/>
       <path d="M35 34h58M35 92h58" stroke="#b78a4f" opacity=".22"/>`
    )
  ].join(""),
  `
  <linearGradient id="floor0" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#514936"/><stop offset=".44" stop-color="#25241f"/><stop offset="1" stop-color="#0b0c0b"/></linearGradient>
  <linearGradient id="floor1" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#494231"/><stop offset=".5" stop-color="#211f1a"/><stop offset="1" stop-color="#090b0b"/></linearGradient>
  <linearGradient id="floor2" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#403b31"/><stop offset=".55" stop-color="#1d1c18"/><stop offset="1" stop-color="#080a0b"/></linearGradient>
  <linearGradient id="floor3" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#383a35"/><stop offset=".42" stop-color="#171b1b"/><stop offset="1" stop-color="#070909"/></linearGradient>
  `
);

writeAsset(
  "walls-doors-atlas",
  512,
  128,
  [
    frame(
      0,
      `<rect x="6" y="16" width="116" height="106" fill="url(#wallFace)" stroke="#6f5634" stroke-width="2"/>
       <path d="M12 27h101M16 49h94M10 72h108M17 96h88" stroke="#7e6848" opacity=".45"/>
       <path d="M17 20l20 98M60 16l-8 109M100 18l-18 102" stroke="#050505" opacity=".32"/>
       ${scratches(7, "#ccb27d", 0.14)}
       <path d="M6 16h116v18H6z" fill="#57462e" opacity=".88"/>
       <path d="M12 18h101" stroke="#d5a55b" opacity=".24"/>`
    ),
    frame(
      128,
      `<path d="M8 29L64 6l56 23v54L64 121L8 83z" fill="url(#wallTop)" stroke="#947044" stroke-width="2"/>
       <path d="M19 31h88M25 50h78M30 70h69M36 90h56" stroke="#c09a62" opacity=".28"/>
       <path d="M64 6v115M8 83l112-54M8 29l112 54" stroke="#090909" opacity=".22"/>`
    ),
    frame(
      256,
      `<ellipse cx="64" cy="105" rx="45" ry="12" fill="#000" opacity=".48"/>
       <path d="M24 111V51C24 22 104 22 104 51v60z" fill="#20130c" stroke="#8f6035" stroke-width="5"/>
       <path d="M33 109V53c0-20 62-20 62 0v56z" fill="url(#doorWood)" stroke="#1a0d07" stroke-width="2"/>
       <path d="M43 45v64M64 35v74M85 45v64" stroke="#85552e" stroke-width="6" opacity=".72"/>
       <path d="M32 68h64" stroke="#24100a" stroke-width="8" opacity=".55"/>
       <circle cx="85" cy="77" r="5" fill="#f2c26b" stroke="#2a1709" stroke-width="2"/>`
    ),
    frame(
      384,
      `<ellipse cx="64" cy="105" rx="45" ry="12" fill="#000" opacity=".48"/>
       <path d="M24 111V51C24 22 104 22 104 51v60" fill="none" stroke="#8f6035" stroke-width="5"/>
       <path d="M45 45l39 10v55l-39-10z" fill="url(#doorWood)" stroke="#b6743d" stroke-width="3"/>
       <path d="M84 55v55" stroke="#211009" stroke-width="6"/>
       <circle cx="73" cy="78" r="5" fill="#f2c26b"/>
       <circle cx="63" cy="73" r="34" fill="url(#emberBloom)" opacity=".45"/>`
    )
  ].join(""),
  `
  <linearGradient id="wallFace" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#554934"/><stop offset=".35" stop-color="#28251f"/><stop offset="1" stop-color="#090908"/></linearGradient>
  <linearGradient id="wallTop" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#625239"/><stop offset=".52" stop-color="#28251f"/><stop offset="1" stop-color="#0b0b0a"/></linearGradient>
  <linearGradient id="doorWood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6b3f24"/><stop offset=".55" stop-color="#30180d"/><stop offset="1" stop-color="#120805"/></linearGradient>
  `
);

writeEnvironmentDungeonAtlas();
writeEnvironmentWallsDoorsAtlas();
writeEnvironmentWallKitAtlas();
writeEnvironmentWallSpanAtlas();
writeEnvironmentFloorAtlas();

writeAsset(
  "loot-atlas",
  640,
  128,
  [
    frame(0, `<ellipse cx="64" cy="102" rx="36" ry="10" fill="#000" opacity=".45"/><circle cx="52" cy="72" r="21" fill="#c8892f" stroke="#f7cf70" stroke-width="5"/><circle cx="74" cy="79" r="19" fill="#d8a744" stroke="#ffdd83" stroke-width="4"/><circle cx="65" cy="61" r="14" fill="#f0bd55" opacity=".9"/><path d="M44 75h54M55 58h28" stroke="#7a4b1e" opacity=".35"/>`),
    frame(128, `<ellipse cx="64" cy="104" rx="29" ry="9" fill="#000" opacity=".45"/><rect x="49" y="38" width="30" height="56" rx="9" fill="url(#potionRed)" stroke="#f3d8b4" stroke-width="4"/><path d="M55 33h18v-11H55z" fill="#d7c7aa" stroke="#3d3022" stroke-width="2"/><path d="M57 50c12 6 10 20-1 30" stroke="#ffd4c2" opacity=".24" stroke-width="4" fill="none"/>`),
    frame(256, `<ellipse cx="64" cy="106" rx="39" ry="9" fill="#000" opacity=".45"/><path d="M29 95l54-70l14 13l-60 62z" fill="url(#steel)" stroke="#f7cf70" stroke-width="3"/><path d="M32 78l20 19" stroke="#6b391f" stroke-width="10"/><path d="M82 25l15 13" stroke="#fff1c8" stroke-width="3" opacity=".5"/>`),
    frame(384, `<ellipse cx="64" cy="106" rx="35" ry="9" fill="#000" opacity=".45"/><path d="M38 44l26-19l27 19l-7 55H45z" fill="url(#armor)" stroke="#d8cfb6" stroke-width="3"/><path d="M46 51h36M49 64h30M51 76h26" stroke="#121416" stroke-width="4"/><path d="M64 25v74" stroke="#cfc8b8" opacity=".22"/>`),
    frame(512, `<ellipse cx="64" cy="106" rx="32" ry="9" fill="#000" opacity=".45"/><path d="M64 23l25 32l-25 50l-25-50z" fill="url(#charm)" stroke="#d9ffd0" stroke-width="4"/><path d="M64 23v82M41 55h46" stroke="#153d22" opacity=".45" stroke-width="3"/><circle cx="64" cy="64" r="34" fill="#75ff8d" opacity=".12" filter="url(#glow)"/>`)
  ].join(""),
  `
  <linearGradient id="potionRed" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6a55"/><stop offset=".5" stop-color="#b52c2b"/><stop offset="1" stop-color="#3b0808"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7f0d8"/><stop offset=".45" stop-color="#7f898a"/><stop offset="1" stop-color="#1d2324"/></linearGradient>
  <linearGradient id="armor" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#87919a"/><stop offset=".5" stop-color="#3d4448"/><stop offset="1" stop-color="#101314"/></linearGradient>
  <linearGradient id="charm" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b5ffd0"/><stop offset=".48" stop-color="#54bd68"/><stop offset="1" stop-color="#174a23"/></linearGradient>
  `
);

writeAsset(
  "ui-atlas",
  640,
  128,
  [
    frame(0, `<rect x="9" y="9" width="110" height="110" rx="5" fill="url(#slotMetal)" stroke="#a97d45" stroke-width="4"/><rect x="19" y="19" width="90" height="90" fill="#080808" stroke="#302719" stroke-width="3"/><path d="M18 36L36 18M92 18l18 18M18 92l18 18M110 92l-18 18" stroke="#d0a15a" opacity=".36" stroke-width="3"/>`),
    frame(128, `<rect x="15" y="15" width="98" height="98" rx="6" fill="#1b130e" stroke="#f2a84b" stroke-width="4"/><path d="M64 20c24 32 17 58-2 88c-19-24-34-49 2-88z" fill="url(#emberBloom)"/><path d="M64 37c8 21 4 38-3 53" stroke="#fff0b8" opacity=".42" stroke-width="4"/>`),
    frame(256, `<rect x="15" y="15" width="98" height="98" rx="6" fill="#17191a" stroke="#c8bda8" stroke-width="4"/><path d="M34 96l58-64M37 32l55 63" stroke="#d8cfb6" stroke-width="10" stroke-linecap="round"/><path d="M28 88l20 19M81 22l19 18" stroke="#70401f" stroke-width="8" stroke-linecap="round"/>`),
    frame(384, `<rect x="15" y="15" width="98" height="98" rx="6" fill="#12141a" stroke="#75aee8" stroke-width="4"/><path d="M25 79c25-44 55-58 78-37c-14 33-38 48-78 37z" fill="#75aee8" opacity=".78"/><path d="M37 70c17-13 34-22 53-25" stroke="#e4fbff" stroke-width="3" opacity=".42"/>`),
    frame(512, `<rect x="15" y="15" width="98" height="98" rx="6" fill="#151a15" stroke="#80b95f" stroke-width="4"/><path d="M64 22l34 16v29c0 22-15 37-34 43c-19-6-34-21-34-43V38z" fill="#80b95f" opacity=".78"/><path d="M64 29v72M37 56h54" stroke="#d7ffd0" opacity=".28" stroke-width="4"/>`)
  ].join("")
);

writeAsset(
  "fx-atlas",
  640,
  128,
  [
    frame(0, `<circle cx="64" cy="64" r="62" fill="url(#emberBloom)"/>`),
    frame(128, `<circle cx="46" cy="72" r="8" fill="#f2a84b"/><circle cx="76" cy="43" r="6" fill="#ffd17a"/><circle cx="88" cy="84" r="9" fill="#d95d4d"/><circle cx="38" cy="39" r="4" fill="#fff2ba"/><circle cx="64" cy="64" r="58" fill="url(#emberBloom)" opacity=".12"/>`),
    frame(256, `<path d="M6 78c31-39 58 23 116-8v43H6z" fill="#6c8997" opacity=".34" filter="url(#soft)"/><path d="M3 54c25-25 50 14 82-11c14-11 30-6 40 2v32H3z" fill="#405d68" opacity=".22" filter="url(#soft)"/>`),
    frame(384, `<path d="M64 9l10 38l39-10l-31 24l33 23l-40-8l-11 43l-12-43l-39 8l32-23l-31-24l39 10z" fill="#fff1d4" opacity=".92"/><circle cx="64" cy="64" r="51" fill="#f2a84b" opacity=".18" filter="url(#glow)"/>`),
    frame(512, `<circle cx="64" cy="64" r="32" fill="none" stroke="#f7cf70" stroke-width="8"/><path d="M64 13v27M64 88v27M13 64h27M88 64h27M28 28l19 19M81 81l19 19M100 28L81 47M47 81l-19 19" stroke="#f7cf70" stroke-width="5" stroke-linecap="round"/><circle cx="64" cy="64" r="55" fill="url(#emberBloom)" opacity=".2"/>`)
  ].join("")
);

writeRasterAssetSheet();
writeActorSpriteAtlas();

const cues = {
  "ambience-crypt-loop": "anoisesrc=duration=8:color=brown:amplitude=0.08,lowpass=f=420,volume=0.45",
  "torch-loop": "anoisesrc=duration=4:color=pink:amplitude=0.07,highpass=f=500,lowpass=f=2400,volume=0.35",
  "footstep-stone-1": "sine=frequency=120:duration=0.12,volume=0.35",
  "footstep-stone-2": "sine=frequency=96:duration=0.14,volume=0.34",
  "footstep-stone-3": "sine=frequency=142:duration=0.10,volume=0.28",
  "door-open": "sine=frequency=74:duration=0.34,volume=0.45",
  "hit-light": "sine=frequency=220:duration=0.10,volume=0.38",
  "hit-heavy": "sine=frequency=92:duration=0.20,volume=0.50",
  "elite-alert": "sine=frequency=180:duration=0.42,volume=0.42",
  "monster-death": "sine=frequency=70:duration=0.32,volume=0.40",
  "loot-pickup": "sine=frequency=760:duration=0.16,volume=0.28",
  "rare-item-drop": "sine=frequency=540:duration=0.48,volume=0.42",
  "potion-drink": "sine=frequency=330:duration=0.18,volume=0.32",
  "pause-open": "sine=frequency=180:duration=0.18,volume=0.28",
  "save-confirm": "sine=frequency=640:duration=0.16,volume=0.30",
  "load-confirm": "sine=frequency=480:duration=0.18,volume=0.30",
  "shrine-activate": "sine=frequency=420:duration=0.52,volume=0.44",
  "buff-expire": "sine=frequency=160:duration=0.28,volume=0.26",
  "floor-transition": "sine=frequency=110:duration=0.52,volume=0.42",
  "skill-select": "sine=frequency=620:duration=0.28,volume=0.34"
};

for (const [name, filter] of Object.entries(cues)) {
  const out = resolve(audioDir, `${name}.ogg`);
  if (existsSync(out)) continue;
  const result = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", filter, "-c:a", "libvorbis", out], {
    stdio: "inherit"
  });
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
}

console.log(`Wrote runtime assets to ${dirname(atlasDir)}`);
