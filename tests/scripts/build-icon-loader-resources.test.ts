import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  convertIconSourceToIconResource,
  createNotoEmojiIconSource,
  createNotoEmojiMetadataByCodepoints,
  discoverIconSources,
  discoverOpenMojiIconSources,
  normalizeNotoEmojiCodepoints,
  parseNotoEmojiFileName,
  readNotoEmojiMetadataByCodepoints,
} from "../../scripts/build-icon-loader-resources";
import { createAssetRegistry } from "../../src/asset-registry/asset-registry";
import { matchKeywordToIconAsset } from "../../src/asset-registry/keyword-icon-asset-matcher";
import { iconLoaderResourceSchema } from "../../src/asset-registry/icon-loader-resource-schema";
import { iconLoaderResourceGrid } from "../../src/loader-domain/icon-loader-resource";

describe("build icon loader resources", () => {
  it("将 SVG icon 转为 64 * 64 彩色像素图案", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "icon-loader-icon-"));
    const sourcePath = path.join(tempDirectory, "sample.svg");
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
      '<rect x="8" y="8" width="20" height="48" fill="#ff0000"/>',
      '<circle cx="42" cy="32" r="16" fill="#00ff00"/>',
      "</svg>",
    ].join("");

    await writeFile(sourcePath, svg, "utf8");

    try {
      const pattern = await convertIconSourceToIconResource({
        id: "pixel-icon-sample",
        label: "Sample",
        sourcePath,
        relativeSourcePath: "sample.svg",
        outputFileName: "sample.pixel.json",
        license: "cc0",
        source: "test",
        attributionRequired: false,
        tags: ["test"],
      });

      const parseResult = iconLoaderResourceSchema.safeParse(pattern);
      const palette = new Set(pattern.palette);

      expect(parseResult.success).toBe(true);
      expect(pattern.baseResolution).toEqual(iconLoaderResourceGrid);
      expect(pattern.pixels.length).toBeGreaterThan(0);
      expect(palette.has("#ff0000")).toBe(true);
      expect(palette.has("#00ff00")).toBe(true);
      expect(pattern.pixels.every((pixel) => pixel[3] > 0)).toBe(true);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  it("解析 Noto Emoji SVG 文件名并保留 ZWJ 序列", () => {
    expect(parseNotoEmojiFileName("emoji_u1f600.svg")).toEqual({
      codepoints: [0x1f600],
      normalizedKey: "1f600",
    });
    expect(parseNotoEmojiFileName("emoji_u1f468_200d_1f469.svg")).toEqual({
      codepoints: [0x1f468, 0x200d, 0x1f469],
      normalizedKey: "1f468-200d-1f469",
    });
  });

  it("规范化 Noto Emoji metadata 和 SVG 文件名中的变体选择符差异", () => {
    expect(normalizeNotoEmojiCodepoints([0x26f9, 0xfe0f, 0x200d, 0x2640, 0xfe0f])).toBe("26f9-200d-2640");
  });

  it("从 Noto metadata 的 base 和 alternates 建立关键词标签", () => {
    const metadataByCodepoints = createNotoEmojiMetadataByCodepoints([
      {
        group: "People",
        emoji: [
          {
            base: [0x1f3c3],
            alternates: [[0x1f3c3, 0x1f3fb]],
            emoticons: [],
            shortcodes: [":person_running:"],
          },
          {
            base: [0x26f9, 0xfe0f, 0x200d, 0x2640, 0xfe0f],
            alternates: [],
            emoticons: [],
            shortcodes: [":woman_bouncing_ball:"],
          },
        ],
      },
    ]);

    const alternateMetadata = metadataByCodepoints.get("1f3c3-1f3fb");
    const variationMetadata = metadataByCodepoints.get("26f9-200d-2640");

    expect(alternateMetadata?.label).toBe("Person Running");
    expect(alternateMetadata?.tags).toContain("person_running");
    expect(variationMetadata?.label).toBe("Woman Bouncing Ball");
  });

  it("用 Noto metadata 生成可被关键词队列匹配的 manifest 字段", () => {
    const metadataByCodepoints = createNotoEmojiMetadataByCodepoints([
      {
        group: "People",
        emoji: [
          {
            base: [0x1f3c3],
            alternates: [],
            emoticons: [],
            shortcodes: [":person_running:"],
          },
        ],
      },
    ]);
    const source = createNotoEmojiIconSource("emoji_u1f3c3.svg", metadataByCodepoints, "/repo");
    const registry = createAssetRegistry({
      assets: [
        {
          id: source.id,
          label: source.label,
          loaderKind: "icon_loader",
          assetKind: "icon_resource",
          format: "icon-loader-json",
          path: `/assets/loaders/icon-loader/patterns/${source.outputFileName}`,
          width: 64,
          height: 64,
          tags: source.tags,
          license: source.license,
          source: source.source,
          attributionRequired: source.attributionRequired,
        },
      ],
    });

    const match = matchKeywordToIconAsset("running", registry);

    expect(source).toMatchObject({
      id: "pixel-icon-noto-emoji-1f3c3",
      label: "Person Running",
      relativeSourcePath: "assets/icon-packs/noto-emoji/svg/emoji_u1f3c3.svg",
      outputFileName: "noto-emoji-1f3c3.pixel.json",
      license: "Apache-2.0",
      source: "https://github.com/googlefonts/noto-emoji",
      attributionRequired: false,
    });
    expect(source.tags).toEqual(expect.arrayContaining(["noto-emoji", "People", "1f3c3", "person_running"]));
    expect(match?.asset.id).toBe("pixel-icon-noto-emoji-1f3c3");
  });

  it("Noto metadata 文件缺失或结构非法时失败", async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "icon-loader-noto-metadata-"));
    const metadataDirectory = path.join(tempDirectory, "assets/icon-packs/noto-emoji/data");

    try {
      await expect(readNotoEmojiMetadataByCodepoints(tempDirectory)).rejects.toThrow();
      await mkdir(metadataDirectory, { recursive: true });
      await writeFile(path.join(metadataDirectory, "emoji_17_0_ordering.json"), JSON.stringify({ invalid: true }), "utf8");

      await expect(readNotoEmojiMetadataByCodepoints(tempDirectory)).rejects.toThrow("Noto Emoji metadata 结构非法");
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  it("默认资源池使用 Icons8 和 Noto Emoji，保留但不默认使用 OpenMoji", async () => {
    const defaultSources = await discoverIconSources();
    const openMojiSources = await discoverOpenMojiIconSources();

    expect(defaultSources.some((source) => source.id.startsWith("pixel-icon-flat-color-icons-"))).toBe(true);
    expect(defaultSources.some((source) => source.id.startsWith("pixel-icon-noto-emoji-"))).toBe(true);
    expect(defaultSources.some((source) => source.id.startsWith("pixel-icon-openmoji-"))).toBe(false);
    expect(openMojiSources.some((source) => source.id.startsWith("pixel-icon-openmoji-"))).toBe(true);
  });
});
