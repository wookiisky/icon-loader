import { describe, expect, it } from "vitest";
import {
  createNextQueueVisualItems,
  keywordIconQueueSlotCount,
  isQueuePixelInsideVisibleBounds,
  resolveQueueLayout,
  resolveQueueVisibleBounds,
  resolveSlotPosition,
  type QueueVisualItem,
} from "../../src/loader-renderers/keyword-icon-queue-visual-state";
import type { KeywordIconQueueItem } from "../../src/loader-domain/keyword-icon-queue";

/** 构造关键词 icon 队列测试项。 */
function createQueueItem(index: number, assetId = `asset-${index}`): KeywordIconQueueItem {
  return {
    id: `item-${index}`,
    keyword: `keyword-${index}`,
    assetId,
    label: `Asset ${index}`,
    assetKind: "icon_resource",
    path: `/asset-${index}.json`,
    format: "pixel-json",
    width: 64,
    height: 64,
    appendedAtMs: 100 + index,
  };
}

/** 构造 renderer 可视项测试数据。 */
function createVisualItem(item: KeywordIconQueueItem, slot: number): QueueVisualItem {
  return {
    item,
    fromSlot: slot,
    toSlot: slot,
    changedAtMs: 0,
    removing: false,
  };
}

describe("createNextQueueVisualItems", () => {
  it("同一 assetId 新项进入时不保留旧项退场动画", () => {
    const oldItem = createQueueItem(1, "asset-shared");
    const newItem = createQueueItem(2, "asset-shared");
    const nextVisualItems = createNextQueueVisualItems([createVisualItem(oldItem, 0)], [newItem], 100);

    expect(nextVisualItems).toHaveLength(1);
    expect(nextVisualItems[0].item.id).toBe("item-2");
    expect(nextVisualItems[0].removing).toBe(false);
  });

  it("不同 assetId 的旧项不在最新队列中时会直接移除", () => {
    const oldItem = createQueueItem(1, "asset-old");
    const newItem = createQueueItem(2, "asset-new");
    const nextVisualItems = createNextQueueVisualItems([createVisualItem(oldItem, 0)], [newItem], 100);

    expect(nextVisualItems).toHaveLength(1);
    expect(nextVisualItems[0].item.assetId).toBe("asset-new");
    expect(nextVisualItems[0].removing).toBe(false);
  });

  it("同一队列重复设置时保留已有可视项动画时间", () => {
    const item = createQueueItem(1, "asset-stable");
    const visualItem = {
      ...createVisualItem(item, 0),
      fromSlot: 5,
      toSlot: 0,
      changedAtMs: 100,
    };
    const nextVisualItems = createNextQueueVisualItems([visualItem], [item], 240);

    expect(nextVisualItems).toHaveLength(1);
    expect(nextVisualItems[0]).toBe(visualItem);
    expect(nextVisualItems[0].changedAtMs).toBe(100);
  });

  it("新 icon 从 5 槽布局右侧进入", () => {
    const item = createQueueItem(1, "asset-new");
    const nextVisualItems = createNextQueueVisualItems([], [item], 100);

    expect(nextVisualItems[0].fromSlot).toBe(keywordIconQueueSlotCount);
    expect(nextVisualItems[0].toSlot).toBe(0);
  });

  it("满 5 个后追加新队列时不保留被挤出的旧项", () => {
    const oldItems = Array.from({ length: 5 }, (_, index) => createQueueItem(index));
    const nextItems = Array.from({ length: 5 }, (_, index) => createQueueItem(index + 1));
    const currentVisualItems = oldItems.map((item, index) => createVisualItem(item, index));
    const nextVisualItems = createNextQueueVisualItems(currentVisualItems, nextItems, 100);

    expect(nextVisualItems).toHaveLength(5);
    expect(nextVisualItems.map((visualItem) => visualItem.item.id)).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
    expect(nextVisualItems.some((visualItem) => visualItem.item.id === "item-0")).toBe(false);
  });
});

describe("resolveQueueLayout", () => {
  it.each([280, 320, 960])("宽度 %i 下 5 个可见槽位不会横向溢出", (screenWidth) => {
    const layout = resolveQueueLayout(screenWidth, 200);

    for (let slot = 0; slot < keywordIconQueueSlotCount; slot += 1) {
      const position = resolveSlotPosition(layout, slot);

      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x + layout.slotWidth).toBeLessThanOrEqual(screenWidth);
    }
  });

  it("5 个可见槽位保持单行", () => {
    const layout = resolveQueueLayout(320, 200);
    const firstSlot = resolveSlotPosition(layout, 0);

    for (let slot = 1; slot < keywordIconQueueSlotCount; slot += 1) {
      expect(resolveSlotPosition(layout, slot).y).toBe(firstSlot.y);
    }
  });

  it("右侧入场位置和可见槽位保持同一行", () => {
    const layout = resolveQueueLayout(320, 200);
    const lastSlot = resolveSlotPosition(layout, 4);
    const enterSlot = resolveSlotPosition(layout, 5);

    expect(enterSlot.y).toBe(lastSlot.y);
    expect(enterSlot.x).toBeGreaterThan(lastSlot.x);
  });

  it("左侧退场位置和可见槽位保持同一行", () => {
    const layout = resolveQueueLayout(320, 200);
    const firstSlot = resolveSlotPosition(layout, 0);
    const exitSlot = resolveSlotPosition(layout, -1);

    expect(exitSlot.y).toBe(firstSlot.y);
    expect(exitSlot.x).toBeLessThan(firstSlot.x);
  });

  it("可见边界裁掉左右队列外像素", () => {
    const layout = resolveQueueLayout(320, 200);
    const bounds = resolveQueueVisibleBounds(layout);
    const firstSlot = resolveSlotPosition(layout, 0);
    const exitSlot = resolveSlotPosition(layout, -1);
    const enterSlot = resolveSlotPosition(layout, 5);

    expect(isQueuePixelInsideVisibleBounds(bounds, firstSlot.x, firstSlot.y, layout.pixelSize)).toBe(true);
    expect(isQueuePixelInsideVisibleBounds(bounds, exitSlot.x, exitSlot.y, layout.pixelSize)).toBe(false);
    expect(isQueuePixelInsideVisibleBounds(bounds, enterSlot.x, enterSlot.y, layout.pixelSize)).toBe(false);
  });

  it("可见边界裁掉队列外 loading 和 failed 占位像素", () => {
    const layout = resolveQueueLayout(320, 200);
    const bounds = resolveQueueVisibleBounds(layout);
    const enterSlot = resolveSlotPosition(layout, 5);
    const loadingDotX = enterSlot.x + layout.tileSize * 3;
    const loadingDotY = enterSlot.y + layout.tileSize * 3;
    const failedPixelX = enterSlot.x + layout.tileSize * 8;
    const failedPixelY = enterSlot.y + layout.tileSize * 8;

    expect(isQueuePixelInsideVisibleBounds(bounds, loadingDotX, loadingDotY, layout.pixelSize)).toBe(false);
    expect(isQueuePixelInsideVisibleBounds(bounds, failedPixelX, failedPixelY, layout.pixelSize)).toBe(false);
  });

  it("可见边界裁掉只重叠 1px 的边缘像素", () => {
    const layout = resolveQueueLayout(960, 260);
    const bounds = resolveQueueVisibleBounds(layout);
    const rightEdgePartialX = bounds.x + bounds.width - 1;
    const leftEdgePartialX = bounds.x - layout.pixelSize + 1;
    const rightEdgeInsideX = bounds.x + bounds.width - layout.pixelSize;

    expect(isQueuePixelInsideVisibleBounds(bounds, bounds.x, bounds.y, layout.pixelSize)).toBe(true);
    expect(isQueuePixelInsideVisibleBounds(bounds, rightEdgeInsideX, bounds.y, layout.pixelSize)).toBe(true);
    expect(isQueuePixelInsideVisibleBounds(bounds, rightEdgePartialX, bounds.y, layout.pixelSize)).toBe(false);
    expect(isQueuePixelInsideVisibleBounds(bounds, leftEdgePartialX, bounds.y, layout.pixelSize)).toBe(false);
  });
});
