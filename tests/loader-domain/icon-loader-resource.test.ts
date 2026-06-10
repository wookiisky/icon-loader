import { describe, expect, it } from "vitest";
import {
  decodeIconLoaderResource,
  iconLoaderDisplayGrid,
  transformIconLoaderPointsToGrid,
} from "../../src/loader-domain/icon-loader-resource";
import type { IconLoaderResource } from "../../src/loader-domain/icon-loader-resource";

describe("icon loader resource", () => {
  it("随机 Icon Loader 运行时展示点阵固定为 24x24", () => {
    expect(iconLoaderDisplayGrid).toEqual({ columns: 24, rows: 24 });
  });

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

  it("按目标网格缩小点阵坐标", () => {
    const points = [
      { x: 0, y: 0, color: "#ff0000", alpha: 1 },
      { x: 63, y: 63, color: "#00ff00", alpha: 1 },
    ];

    expect(
      transformIconLoaderPointsToGrid(points, {
        sourceGrid: { columns: 64, rows: 64 },
        targetGrid: iconLoaderDisplayGrid,
      }),
    ).toEqual([
      { x: 0, y: 0, color: "#ff0000", alpha: 1 },
      { x: 23, y: 23, color: "#00ff00", alpha: 1 },
    ]);
  });

  it("同一目标格子使用 alpha 加权平均色和最大 alpha 聚合", () => {
    const points = [
      { x: 0, y: 0, color: "#ff0000", alpha: 1 },
      { x: 1, y: 0, color: "#0000ff", alpha: 0.5 },
    ];

    expect(
      transformIconLoaderPointsToGrid(points, {
        sourceGrid: { columns: 64, rows: 64 },
        targetGrid: iconLoaderDisplayGrid,
      }),
    ).toEqual([{ x: 0, y: 0, color: "#aa0055", alpha: 1 }]);
  });
});
