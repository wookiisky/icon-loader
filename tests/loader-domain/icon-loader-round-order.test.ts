import { describe, expect, it } from "vitest";
import { createIconLoaderRound } from "../../src/loader-domain/icon-loader-round-order";
import type { IconLoaderEvent } from "../../src/loader-domain/loader-event";

const assetIds = Array.from({ length: 32 }, (_, index) => `pixel-icon-${index}`);
const events: IconLoaderEvent[] = assetIds.map((assetId, index) => ({
  kind: "icon_transition",
  atMs: 500 + index * 1000,
  assetId,
  label: `Icon ${index}`,
  burst: 16,
  durationMs: 1800,
  effect: {
    kind: "assembly",
    groupMode: "point",
    orderMode: "left_to_right",
    originMode: "target_position",
    motionMode: "appear",
    settleMode: "none",
    trailMode: "none",
  },
}));

const twoIconEvents = events.slice(0, 2);

/** 提取当前轮次的图形顺序。 */
function assetOrder(roundEvents: readonly IconLoaderEvent[]): string {
  return roundEvents.map((event) => event.assetId).join("|");
}

/** 读取一组事件的最后一个资产 ID。 */
function lastAssetId(roundEvents: readonly IconLoaderEvent[]): string | undefined {
  const lastEvent = roundEvents[roundEvents.length - 1];
  return lastEvent?.assetId;
}

describe("icon loader round order", () => {
  it("空事件稳定返回空轮次", () => {
    const round = createIconLoaderRound([], 20260605, 0);

    expect(round.events).toEqual([]);
  });

  it("单事件稳定返回且不抛错", () => {
    const firstRound = createIconLoaderRound([events[0]], 20260605, 0);
    const secondRound = createIconLoaderRound([events[0]], 20260605, 1, {
      previousLastAssetId: events[0].assetId,
    });

    expect(firstRound.events.map((event) => event.assetId)).toEqual([events[0].assetId]);
    expect(secondRound.events.map((event) => event.assetId)).toEqual([events[0].assetId]);
  });

  it("单轮覆盖完整 icon 资产池且不重复", () => {
    const round = createIconLoaderRound(events, 20260605, 0);
    const roundAssetIds = round.events.map((event) => event.assetId);

    expect(roundAssetIds).toHaveLength(assetIds.length);
    expect(new Set(roundAssetIds).size).toBe(assetIds.length);
  });

  it("同一 seed 和轮次生成稳定顺序", () => {
    const firstRound = createIconLoaderRound(events, 20260605, 2);
    const secondRound = createIconLoaderRound(events, 20260605, 2);

    expect(firstRound).toEqual(secondRound);
  });

  it("不同轮次生成不同 seed 和不同图形顺序", () => {
    const firstRound = createIconLoaderRound(events, 20260605, 0);
    const secondRound = createIconLoaderRound(events, 20260605, 1);

    expect(firstRound.seed).not.toBe(secondRound.seed);
    expect(assetOrder(firstRound.events)).not.toBe(assetOrder(secondRound.events));
  });

  it("两种 icon 连续多轮播放时跨轮边界不重复", () => {
    let previousLast: string | undefined;

    Array.from({ length: 8 }, (_, roundIndex) => roundIndex).forEach((roundIndex) => {
      const round = createIconLoaderRound(twoIconEvents, 20260605, roundIndex, {
        previousLastAssetId: previousLast,
      });
      const roundAssetIds = round.events.map((event) => event.assetId);

      expect(roundAssetIds).toHaveLength(twoIconEvents.length);
      expect(new Set(roundAssetIds).size).toBe(twoIconEvents.length);
      if (previousLast !== undefined) {
        expect(roundAssetIds[0]).not.toBe(previousLast);
      }

      previousLast = lastAssetId(round.events);
    });
  });

  it("多种 icon 连续多轮播放时保留覆盖且跨轮边界不重复", () => {
    let previousLast: string | undefined;

    Array.from({ length: 8 }, (_, roundIndex) => roundIndex).forEach((roundIndex) => {
      const round = createIconLoaderRound(events, 20260605, roundIndex, {
        previousLastAssetId: previousLast,
      });
      const roundAssetIds = round.events.map((event) => event.assetId);

      expect(roundAssetIds).toHaveLength(assetIds.length);
      expect(new Set(roundAssetIds).size).toBe(assetIds.length);
      if (previousLast !== undefined) {
        expect(roundAssetIds[0]).not.toBe(previousLast);
      }

      previousLast = lastAssetId(round.events);
    });
  });

  it("最后实际展示项命中当前轮首项时移动不同 icon 到首位", () => {
    const naturalRound = createIconLoaderRound(events, 20260605, 3);
    const naturalFirstAssetId = naturalRound.events[0]?.assetId;
    const adjustedRound = createIconLoaderRound(events, 20260605, 3, {
      previousLastAssetId: naturalFirstAssetId,
    });
    const adjustedAssetIds = adjustedRound.events.map((event) => event.assetId);

    expect(adjustedAssetIds[0]).not.toBe(naturalFirstAssetId);
    expect(new Set(adjustedAssetIds)).toEqual(new Set(assetIds));
  });
});
