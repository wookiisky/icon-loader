import { describe, expect, it } from "vitest";
import { createIconLoaderRound } from "../../src/loader-domain/icon-loader-round-order";
import type { IconLoaderEvent } from "../../src/loader-domain/loader-event";

const assetIds = Array.from({ length: 32 }, (_, index) => `pixel-icon-${index}`);
const events: IconLoaderEvent[] = assetIds.map((assetId, index) => ({
  kind: "pixel_assemble",
  atMs: 500 + index * 1000,
  assetId,
  label: `Icon ${index}`,
  burst: 16,
}));

/** 提取当前轮次的图形顺序。 */
function assetOrder(roundEvents: readonly IconLoaderEvent[]): string {
  return roundEvents.map((event) => event.assetId).join("|");
}

describe("icon loader round order", () => {
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
});
