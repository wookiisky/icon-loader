import { readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import { loaderAssetManifestSchema } from "../src/asset-registry/asset-manifest-schema";
import type { LoaderAssetManifest, LoaderAssetManifestItem } from "../src/asset-registry/asset-manifest-schema";
import { iconLoaderResourceGrid } from "../src/loader-domain/icon-loader-resource";
import type { IconLoaderEncodedPixel, IconLoaderResource } from "../src/loader-domain/icon-loader-resource";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, "public/assets/loaders/icon-loader/patterns");
const manifestPath = path.join(repositoryRoot, "public/assets/loaders/manifest.json");
const generatedAssetKind = "icon_resource";
const notoEmojiMetadataRelativePath = "assets/icon-packs/noto-emoji/data/emoji_17_0_ordering.json";

export type IconSource = {
  /** 生成后使用的稳定 ID。 */
  id: string;
  /** 生成后使用的展示名称。 */
  label: string;
  /** 原始 icon 文件绝对路径。 */
  sourcePath: string;
  /** 原始 icon 文件相对仓库路径。 */
  relativeSourcePath: string;
  /** 生成后的文件名。 */
  outputFileName: string;
  /** 原始素材许可证。 */
  license: string;
  /** 原始素材来源。 */
  source: string;
  /** 是否需要署名。 */
  attributionRequired: boolean;
  /** manifest 查询标签。 */
  tags: string[];
};

type OpenMojiMetadata = {
  /** OpenMoji 十六进制码点。 */
  hexcode: string;
  /** OpenMoji 英文描述。 */
  annotation: string;
  /** OpenMoji 分组。 */
  group: string;
};

type NotoEmojiMetadataValue = {
  /** Noto Emoji 展示名称，来自 shortcode。 */
  label: string;
  /** Noto Emoji 参与关键词匹配的标签。 */
  tags: string[];
};

type PixelExtractionResult = {
  /** RGB 调色板。 */
  palette: string[];
  /** 非透明像素元组。 */
  pixels: IconLoaderEncodedPixel[];
};

const notoEmojiMetadataEntrySchema = z.object({
  base: z.array(z.number().int().nonnegative()),
  alternates: z.array(z.array(z.number().int().nonnegative())),
  emoticons: z.array(z.string()),
  shortcodes: z.array(z.string()),
});

const notoEmojiMetadataGroupSchema = z.object({
  group: z.string().min(1),
  emoji: z.array(notoEmojiMetadataEntrySchema),
});

const notoEmojiMetadataSchema = z.array(notoEmojiMetadataGroupSchema);

const openMojiMetadataSchema = z.array(
  z.object({
    hexcode: z.string().min(1),
    annotation: z.string().min(1),
    group: z.string().min(1),
  }),
);

/** 将输入 icon 转换为 64 * 64 彩色 Icon Loader 资源。 */
export async function convertIconSourceToIconResource(iconSource: IconSource): Promise<IconLoaderResource> {
  const extractionResult = await extractPixelsFromIcon(iconSource.sourcePath);

  return {
    schemaVersion: 1,
    id: iconSource.id,
    label: iconSource.label,
    sourceIconPath: iconSource.relativeSourcePath,
    baseResolution: {
      columns: iconLoaderResourceGrid.columns,
      rows: iconLoaderResourceGrid.rows,
    },
    palette: extractionResult.palette,
    pixels: extractionResult.pixels,
  };
}

/** 构建所有下载 icon 的 Icon Loader 资源，并更新 manifest。 */
export async function buildIconLoaderResources(): Promise<void> {
  const iconSources = await discoverIconSources();
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });

  const generatedAssets = await mapWithConcurrency(iconSources, 12, async (iconSource) => {
    const pattern = await convertIconSourceToIconResource(iconSource);
    const outputPath = path.join(outputDirectory, iconSource.outputFileName);
    await writeFile(outputPath, `${JSON.stringify(pattern)}\n`, "utf8");

    return createManifestItem(iconSource);
  });

  const manifest = await readManifest();
  const retainedAssets = manifest.assets.filter((asset) => {
    return asset.loaderKind !== "icon_loader" || asset.assetKind !== generatedAssetKind;
  });
  const nextManifest: LoaderAssetManifest = {
    assets: [...retainedAssets, ...generatedAssets].sort((firstAsset, secondAsset) => {
      return firstAsset.id.localeCompare(secondAsset.id);
    }),
  };

  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  console.log(`已生成 ${generatedAssets.length} 个 Icon Loader 资源。`);
}

/** 从 SVG/PNG 中提取 64 * 64 RGBA 像素，并过滤透明背景。 */
async function extractPixelsFromIcon(sourcePath: string): Promise<PixelExtractionResult> {
  const { data, info } = await sharp(sourcePath)
    .resize(iconLoaderResourceGrid.columns, iconLoaderResourceGrid.rows, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const palette: string[] = [];
  const paletteIndexByColor = new Map<string, number>();
  const pixels: IconLoaderEncodedPixel[] = [];
  const channels = info.channels;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * channels;
      const alphaByte = data[offset + 3];
      if (alphaByte === 0) {
        continue;
      }

      const color = createHexColor(data[offset], data[offset + 1], data[offset + 2]);
      let paletteIndex = paletteIndexByColor.get(color);
      if (paletteIndex === undefined) {
        paletteIndex = palette.length;
        palette.push(color);
        paletteIndexByColor.set(color, paletteIndex);
      }

      pixels.push([x, y, paletteIndex, alphaByte]);
    }
  }

  return { palette, pixels };
}

/** 发现当前仓库中已下载的可独立处理 icon。 */
export async function discoverIconSources(rootDirectory: string = repositoryRoot): Promise<IconSource[]> {
  const flatColorSources = await discoverFlatColorIconSources(rootDirectory);
  const notoEmojiSources = await discoverNotoEmojiSources(rootDirectory);
  return [...flatColorSources, ...notoEmojiSources].sort((firstSource, secondSource) => {
    return firstSource.id.localeCompare(secondSource.id);
  });
}

/** 发现当前仓库中已下载的 OpenMoji icon；该能力保留但不进入默认构建源。 */
export async function discoverOpenMojiIconSources(rootDirectory: string = repositoryRoot): Promise<IconSource[]> {
  return discoverOpenMojiSources(rootDirectory);
}

/** 发现当前仓库中已下载的全部历史 icon 源，供脚本维护和回归测试使用。 */
export async function discoverAllAvailableIconSources(rootDirectory: string = repositoryRoot): Promise<IconSource[]> {
  const flatColorSources = await discoverFlatColorIconSources(rootDirectory);
  const notoEmojiSources = await discoverNotoEmojiSources(rootDirectory);
  const openMojiSources = await discoverOpenMojiSources(rootDirectory);
  return [...flatColorSources, ...notoEmojiSources, ...openMojiSources].sort((firstSource, secondSource) => {
    return firstSource.id.localeCompare(secondSource.id);
  });
}

/** 发现 Icons8 Flat Color Icons 的 SVG 文件。 */
async function discoverFlatColorIconSources(rootDirectory: string = repositoryRoot): Promise<IconSource[]> {
  const sourceDirectory = path.join(rootDirectory, "assets/icon-packs/flat-color-icons/svg");
  const fileNames = await readdir(sourceDirectory);

  return fileNames
    .filter((fileName) => fileName.endsWith(".svg"))
    .map((fileName) => {
      const iconName = fileName.replace(/\.svg$/, "");
      const label = createLabelFromSlug(iconName);
      const relativeSourcePath = `assets/icon-packs/flat-color-icons/svg/${fileName}`;

      return {
        id: `pixel-icon-flat-color-icons-${iconName}`,
        label,
        sourcePath: path.join(sourceDirectory, fileName),
        relativeSourcePath,
        outputFileName: `flat-color-icons-${iconName}.pixel.json`,
        license: "MIT OR Good Boy License",
        source: "https://github.com/icons8/flat-color-icons",
        attributionRequired: false,
        tags: ["flat-color-icons", iconName],
      };
    });
}

/** 发现 Noto Emoji 的 SVG 文件，并用上游 metadata 生成可匹配标签。 */
export async function discoverNotoEmojiSources(rootDirectory: string = repositoryRoot): Promise<IconSource[]> {
  const sourceDirectory = path.join(rootDirectory, "assets/icon-packs/noto-emoji/svg");
  const metadataByCodepoints = await readNotoEmojiMetadataByCodepoints(rootDirectory);
  const fileNames = await readdir(sourceDirectory);

  return fileNames
    .filter((fileName) => fileName.endsWith(".svg"))
    .map((fileName) => {
      return createNotoEmojiIconSource(fileName, metadataByCodepoints, rootDirectory);
    });
}

/** 将 Noto Emoji 文件名转换为稳定资源描述。 */
export function createNotoEmojiIconSource(
  fileName: string,
  metadataByCodepoints: ReadonlyMap<string, NotoEmojiMetadataValue>,
  rootDirectory: string = repositoryRoot,
): IconSource {
  const codepoints = parseNotoEmojiFileName(fileName);
  const metadata = metadataByCodepoints.get(codepoints.normalizedKey);
  const relativeSourcePath = `assets/icon-packs/noto-emoji/svg/${fileName}`;
  const fallbackLabel = `Noto Emoji ${codepoints.normalizedKey}`;

  return {
    id: `pixel-icon-noto-emoji-${codepoints.normalizedKey}`,
    label: metadata?.label ?? fallbackLabel,
    sourcePath: path.join(rootDirectory, relativeSourcePath),
    relativeSourcePath,
    outputFileName: `noto-emoji-${codepoints.normalizedKey}.pixel.json`,
    license: "Apache-2.0",
    source: "https://github.com/googlefonts/noto-emoji",
    attributionRequired: false,
    tags: metadata?.tags ?? ["noto-emoji", codepoints.normalizedKey],
  };
}

/** 从 Noto Emoji SVG 文件名中解析码点。 */
export function parseNotoEmojiFileName(fileName: string): { normalizedKey: string; codepoints: number[] } {
  const match = /^emoji_u([0-9a-fA-F_]+)\.svg$/.exec(fileName);
  if (match === null) {
    throw new Error(`非法 Noto Emoji SVG 文件名：${fileName}`);
  }

  const codepoints = match[1].split("_").map((part) => Number.parseInt(part, 16));
  if (codepoints.some((codepoint) => Number.isNaN(codepoint))) {
    throw new Error(`非法 Noto Emoji 码点文件名：${fileName}`);
  }

  return {
    codepoints,
    normalizedKey: normalizeNotoEmojiCodepoints(codepoints),
  };
}

/** 规范化 Noto Emoji 码点，统一 metadata 与 SVG 文件名差异。 */
export function normalizeNotoEmojiCodepoints(codepoints: readonly number[]): string {
  return codepoints
    .filter((codepoint) => codepoint !== 0xfe0e && codepoint !== 0xfe0f)
    .map((codepoint) => codepoint.toString(16).toLowerCase())
    .join("-");
}

/** 读取 Noto Emoji metadata，提供 icon 展示名称和关键词标签。 */
export async function readNotoEmojiMetadataByCodepoints(
  rootDirectory: string = repositoryRoot,
): Promise<Map<string, NotoEmojiMetadataValue>> {
  const metadataPath = path.join(rootDirectory, notoEmojiMetadataRelativePath);
  const rawMetadata = JSON.parse(await readFile(metadataPath, "utf8")) as unknown;
  const parseResult = notoEmojiMetadataSchema.safeParse(rawMetadata);
  if (!parseResult.success) {
    throw new Error(`Noto Emoji metadata 结构非法：${parseResult.error.message}`);
  }

  return createNotoEmojiMetadataByCodepoints(parseResult.data);
}

/** 将已清洗的 Noto metadata 转为按码点索引的查询表。 */
export function createNotoEmojiMetadataByCodepoints(
  metadataGroups: z.infer<typeof notoEmojiMetadataSchema>,
): Map<string, NotoEmojiMetadataValue> {
  const metadataByCodepoints = new Map<string, NotoEmojiMetadataValue>();

  metadataGroups.forEach((metadataGroup) => {
    metadataGroup.emoji.forEach((entry) => {
      const label = createNotoEmojiLabel(entry.shortcodes, entry.base);
      const tags = createNotoEmojiTags({
        group: metadataGroup.group,
        codepointKey: normalizeNotoEmojiCodepoints(entry.base),
        label,
        shortcodes: entry.shortcodes,
        emoticons: entry.emoticons,
      });
      const metadataValue = { label, tags };
      const sequences = [entry.base, ...entry.alternates];

      sequences.forEach((sequence) => {
        metadataByCodepoints.set(normalizeNotoEmojiCodepoints(sequence), metadataValue);
      });
    });
  });

  return metadataByCodepoints;
}

/** 发现 OpenMoji 的 SVG 文件；同名 PNG 视为同一 icon 的重复导出，不重复处理。 */
async function discoverOpenMojiSources(rootDirectory: string = repositoryRoot): Promise<IconSource[]> {
  const sourceDirectory = path.join(rootDirectory, "assets/icon-packs/openmoji/color/svg");
  const metadataByHexcode = await readOpenMojiMetadataByHexcode(rootDirectory);
  const fileNames = await readdir(sourceDirectory);

  return fileNames
    .filter((fileName) => fileName.endsWith(".svg"))
    .map((fileName) => {
      const hexcode = fileName.replace(/\.svg$/, "");
      const metadata = metadataByHexcode.get(hexcode);
      const label = metadata?.annotation ?? `OpenMoji ${hexcode}`;
      const group = metadata?.group ?? "unknown";
      const relativeSourcePath = `assets/icon-packs/openmoji/color/svg/${fileName}`;

      return {
        id: `pixel-icon-openmoji-${hexcode.toLowerCase()}`,
        label,
        sourcePath: path.join(sourceDirectory, fileName),
        relativeSourcePath,
        outputFileName: `openmoji-${hexcode.toLowerCase()}.pixel.json`,
        license: "CC BY-SA 4.0",
        source: "https://openmoji.org/",
        attributionRequired: true,
        tags: ["openmoji", group, hexcode],
      };
    });
}

/** 读取 OpenMoji 元数据，提供 icon 展示名称和分组。 */
async function readOpenMojiMetadataByHexcode(rootDirectory: string = repositoryRoot): Promise<Map<string, OpenMojiMetadata>> {
  const metadataPath = path.join(rootDirectory, "assets/icon-packs/openmoji/data/openmoji.json");
  const rawMetadata = JSON.parse(await readFile(metadataPath, "utf8")) as unknown;
  const parseResult = openMojiMetadataSchema.safeParse(rawMetadata);
  if (!parseResult.success) {
    throw new Error(`OpenMoji metadata 结构非法：${parseResult.error.message}`);
  }
  const metadataByHexcode = new Map<string, OpenMojiMetadata>();

  parseResult.data.forEach((metadata) => {
    metadataByHexcode.set(metadata.hexcode, metadata);
  });

  return metadataByHexcode;
}

/** 从 Noto shortcode 生成可读标签。 */
function createNotoEmojiLabel(shortcodes: readonly string[], fallbackCodepoints: readonly number[]): string {
  const firstShortcode = shortcodes.find((shortcode) => shortcode.trim().length > 0);
  if (firstShortcode === undefined) {
    return `Noto Emoji ${normalizeNotoEmojiCodepoints(fallbackCodepoints)}`;
  }

  return createLabelFromSlug(firstShortcode.replace(/^:/, "").replace(/:$/, ""));
}

/** 生成 Noto Emoji 的关键词标签，供 Thinking Icon Queue 匹配。 */
function createNotoEmojiTags(context: {
  group: string;
  codepointKey: string;
  label: string;
  shortcodes: readonly string[];
  emoticons: readonly string[];
}): string[] {
  const rawTags = [
    "noto-emoji",
    context.group,
    context.codepointKey,
    context.label,
    ...context.shortcodes.map((shortcode) => shortcode.replace(/^:/, "").replace(/:$/, "")),
    ...context.emoticons,
  ];

  return Array.from(new Set(rawTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)));
}

/** 读取现有 manifest，非法或缺失时回退为空清单。 */
async function readManifest(): Promise<LoaderAssetManifest> {
  try {
    const rawManifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
    const parseResult = loaderAssetManifestSchema.safeParse(rawManifest);
    return parseResult.success ? parseResult.data : { assets: [] };
  } catch {
    return { assets: [] };
  }
}

/** 创建 Icon Loader 资源对应的 manifest 条目。 */
function createManifestItem(iconSource: IconSource): LoaderAssetManifestItem {
  return {
    id: iconSource.id,
    label: iconSource.label,
    loaderKind: "icon_loader",
    assetKind: generatedAssetKind,
    format: "icon-loader-json",
    path: `/assets/loaders/icon-loader/patterns/${iconSource.outputFileName}`,
    width: iconLoaderResourceGrid.columns,
    height: iconLoaderResourceGrid.rows,
    tags: iconSource.tags,
    license: iconSource.license,
    source: iconSource.source,
    attributionRequired: iconSource.attributionRequired,
  };
}

/** 用受控并发处理大量 icon，避免同时打开过多文件。 */
async function mapWithConcurrency<TInput, TOutput>(
  inputs: readonly TInput[],
  concurrency: number,
  mapper: (input: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const outputs: TOutput[] = new Array<TOutput>(inputs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      outputs[currentIndex] = await mapper(inputs[currentIndex]);
    }
  }

  const workerCount = Math.min(concurrency, inputs.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return outputs;
}

/** 从文件名生成可读标签。 */
function createLabelFromSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

/** 将 RGB 三元组转换为十六进制颜色。 */
function createHexColor(red: number, green: number, blue: number): string {
  return `#${toHexByte(red)}${toHexByte(green)}${toHexByte(blue)}`;
}

/** 将单个颜色通道转换为两位十六进制。 */
function toHexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}

const executedFilePath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
const currentFilePath = fileURLToPath(import.meta.url);

if (executedFilePath === currentFilePath) {
  void buildIconLoaderResources().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error(`Icon Loader icon 构建失败：${message}`);
    process.exitCode = 1;
  });
}
