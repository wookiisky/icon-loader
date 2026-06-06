import { describe, expect, it } from "vitest";
import {
  orderIconLoaderPoints,
  iconLoaderFillOrderModes,
  selectIconLoaderFillOrderMode,
} from "../../src/loader-domain/icon-loader-fill-order";
import { iconLoaderResourceGrid } from "../../src/loader-domain/icon-loader-resource";
import type { IconLoaderFillOrderContext } from "../../src/loader-domain/icon-loader-fill-order";
import type { IconLoaderColoredPoint } from "../../src/loader-domain/icon-loader-resource";

const iconPoints: IconLoaderColoredPoint[] = Array.from({ length: 20 }, (_, index) => ({
  x: index % 5,
  y: Math.floor(index / 5),
  color: index % 2 === 0 ? "#ff0000" : "#00ff00",
  alpha: 1,
}));
const baseContext: IconLoaderFillOrderContext = {
  seed: 20260605,
  patternId: "pixel-icon-test",
  atMs: 500,
  grid: iconLoaderResourceGrid,
};

/** 将点阵转换成便于比较的稳定字符串。 */
function serializePoints(points: readonly IconLoaderColoredPoint[]): string {
  return points.map((point) => `${point.x}:${point.y}:${point.color}`).join("|");
}

describe("icon loader fill order", () => {
  it("同一上下文生成稳定填充顺序", () => {
    const firstOrder = orderIconLoaderPoints(iconPoints, baseContext);
    const secondOrder = orderIconLoaderPoints(iconPoints, baseContext);

    expect(firstOrder).toEqual(secondOrder);
  });

  it("填充顺序不丢点、不重复点且保留颜色", () => {
    const orderedPoints = orderIconLoaderPoints(iconPoints, baseContext);
    const originalCells = new Set(iconPoints.map((point) => `${point.x}:${point.y}`));
    const orderedCells = new Set(orderedPoints.map((point) => `${point.x}:${point.y}`));
    const orderedColors = new Set(orderedPoints.map((point) => point.color));

    expect(orderedPoints).toHaveLength(iconPoints.length);
    expect(orderedCells).toEqual(originalCells);
    expect(orderedColors).toEqual(new Set(["#ff0000", "#00ff00"]));
  });

  it("不同上下文能够产生不同填充顺序", () => {
    const serializedOrders = Array.from({ length: 20 }, (_, index) => {
      return serializePoints(
        orderIconLoaderPoints(iconPoints, {
          seed: 20260605 + index,
          patternId: "pixel-icon-test",
          atMs: 500 + index * 97,
          grid: iconLoaderResourceGrid,
        }),
      );
    });

    expect(new Set(serializedOrders).size).toBeGreaterThan(1);
  });

  it("填充模式只来自显式白名单", () => {
    const selectedMode = selectIconLoaderFillOrderMode(baseContext);

    expect(iconLoaderFillOrderModes).toContain(selectedMode);
  });
});
