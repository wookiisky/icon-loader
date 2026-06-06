import { describe, expect, it } from "vitest";
import { decodeIconLoaderResource } from "../../src/loader-domain/icon-loader-resource";
import type { IconLoaderResource } from "../../src/loader-domain/icon-loader-resource";

describe("icon loader resource", () => {
  it("将调色板编码像素解码为带颜色点阵", () => {
    const pattern: IconLoaderResource = {
      schemaVersion: 1,
      id: "pixel-icon-test",
      label: "Test",
      sourceIconPath: "assets/icon.svg",
      baseResolution: { columns: 64, rows: 64 },
      palette: ["#ff0000", "#00ff00"],
      pixels: [
        [0, 0, 0, 255],
        [1, 0, 1, 128],
      ],
    };

    expect(decodeIconLoaderResource(pattern)).toEqual([
      { x: 0, y: 0, color: "#ff0000", alpha: 1 },
      { x: 1, y: 0, color: "#00ff00", alpha: 128 / 255 },
    ]);
  });
});
