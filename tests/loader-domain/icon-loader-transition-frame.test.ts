import { describe, expect, it } from "vitest";
import { createIconLoaderTransitionFrame } from "../../src/loader-domain/icon-loader-transition-frame";
import type { IconLoaderColoredPoint } from "../../src/loader-domain/icon-loader-resource";
import type { IconLoaderTransitionEffect } from "../../src/loader-domain/icon-loader-transition-effect";

const grid = {
  columns: 4,
  rows: 4,
};
const points: IconLoaderColoredPoint[] = [
  { x: 0, y: 0, color: "#ff0000", alpha: 1 },
  { x: 1, y: 1, color: "#00ff00", alpha: 1 },
  { x: 2, y: 2, color: "#0000ff", alpha: 1 },
  { x: 3, y: 3, color: "#ffffff", alpha: 1 },
];

/** 创建通用测试帧。 */
function createFrame(effect: IconLoaderTransitionEffect, progress: number) {
  return createIconLoaderTransitionFrame({
    points,
    effect,
    progress,
    seed: 20260606,
    patternId: "pixel-icon-test",
    atMs: 500,
    grid,
    burst: 18,
    palette: ["#ff0000", "#00ff00", "#0000ff"],
  });
}

describe("icon loader transition frame", () => {
  it("旧填充效果最终全部落到目标点位", () => {
    const frame = createFrame(
      {
        kind: "assembly",
        groupMode: "point",
        orderMode: "left_to_right",
        originMode: "target_position",
        motionMode: "appear",
        settleMode: "none",
        trailMode: "none",
      },
      1,
    );

    expect(frame).toHaveLength(points.length);
    frame.forEach((point) => {
      expect(point.drawX).toBe(point.x);
      expect(point.drawY).toBe(point.y);
    });
  });

  it("像素雨开始阶段从目标上方下落", () => {
    const frame = createFrame(
      {
        kind: "assembly",
        groupMode: "point",
        orderMode: "top_to_bottom",
        originMode: "top_outside",
        motionMode: "drop",
        settleMode: "soft_bounce",
        trailMode: "short",
      },
      0.25,
    );

    expect(frame.length).toBeGreaterThan(0);
    expect(frame.some((point) => point.drawY < point.y)).toBe(true);
  });

  it("磁吸重组会产生散点轨迹并在最终落位", () => {
    const effect: IconLoaderTransitionEffect = {
      kind: "assembly",
      groupMode: "cluster",
      orderMode: "center_out",
      originMode: "random_scatter",
      motionMode: "fly",
      settleMode: "overshoot",
      trailMode: "glow",
    };
    const movingFrame = createFrame(effect, 0.35);
    const finalFrame = createFrame(effect, 1);

    expect(movingFrame.some((point) => point.trailAlpha > 0)).toBe(true);
    finalFrame.forEach((point) => {
      expect(point.drawX).toBeCloseTo(point.x, 5);
      expect(point.drawY).toBeCloseTo(point.y, 5);
    });
  });

  it("环形装配从环形起点进入并最终落位", () => {
    const effect: IconLoaderTransitionEffect = {
      kind: "assembly",
      groupMode: "ring_segment",
      orderMode: "spiral_in",
      originMode: "ring",
      motionMode: "orbit",
      settleMode: "soft_bounce",
      trailMode: "short",
    };
    const movingFrame = createFrame(effect, 0.4);
    const finalFrame = createFrame(effect, 1);

    expect(movingFrame.some((point) => point.drawX !== point.x || point.drawY !== point.y)).toBe(true);
    finalFrame.forEach((point) => {
      expect(point.drawX).toBeCloseTo(point.x, 5);
      expect(point.drawY).toBeCloseTo(point.y, 5);
    });
  });

  it("老虎机按列滚动，结束后停到目标图标列", () => {
    const effect: IconLoaderTransitionEffect = {
      kind: "column_slot",
      stopOrder: "left_to_right",
      spinMode: "random_target_pixels",
      columnDelayMs: 34,
    };
    const rollingFrame = createFrame(effect, 0.1);
    const finalFrame = createFrame(effect, 1);

    expect(rollingFrame.some((point) => point.drawY !== point.y)).toBe(true);
    finalFrame.forEach((point) => {
      expect(point.drawX).toBe(point.x);
      expect(point.drawY).toBe(point.y);
    });
  });

  it("雷达扫描逐步显影目标图标", () => {
    const effect: IconLoaderTransitionEffect = {
      kind: "radar_reveal",
      scanMode: "line",
      direction: "left_to_right",
      afterglow: true,
    };
    const earlyFrame = createFrame(effect, 0.1);
    const finalFrame = createFrame(effect, 1);

    expect(earlyFrame.length).toBeLessThan(points.length);
    expect(finalFrame).toHaveLength(points.length);
  });

  it("空点阵安全返回空帧", () => {
    const frame = createIconLoaderTransitionFrame({
      points: [],
      effect: {
        kind: "radar_reveal",
        scanMode: "line",
        direction: "left_to_right",
        afterglow: true,
      },
      progress: 0.5,
      seed: 20260606,
      patternId: "pixel-icon-empty",
      atMs: 500,
      grid,
      burst: 18,
      palette: [],
    });

    expect(frame).toEqual([]);
  });
});
