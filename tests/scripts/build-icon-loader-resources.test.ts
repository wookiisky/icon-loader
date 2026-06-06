import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convertIconSourceToIconResource } from "../../scripts/build-icon-loader-resources";
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
});
