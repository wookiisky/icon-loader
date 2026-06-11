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
  it("空队列返回空可视项", () => {
    expect(createNextQueueVisualItems([], [], 100)).toEqual([]);
  });

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
      ...createVisualItem(item, 4),
      fromSlot: 5,
      toSlot: 4,
      changedAtMs: 100,
    };
    const nextVisualItems = createNextQueueVisualItems([visualItem], [item], 240);

    expect(nextVisualItems).toHaveLength(1);
    expect(nextVisualItems[0]).toBe(visualItem);
    expect(nextVisualItems[0].changedAtMs).toBe(100);
  });

  it("单个新 icon 从 5 槽布局右侧进入最右侧槽位", () => {
    const item = createQueueItem(1, "asset-new");
    const nextVisualItems = createNextQueueVisualItems([], [item], 100);

    expect(nextVisualItems[0].fromSlot).toBe(keywordIconQueueSlotCount);
    expect(nextVisualItems[0].toSlot).toBe(4);
  });

  it("追加第二个 icon 时旧项左移，新项进入最右侧", () => {
    const firstItem = createQueueItem(1, "asset-1");
    const secondItem = createQueueItem(2, "asset-2");
    const currentVisualItems = [createVisualItem(firstItem, 4)];
    const nextVisualItems = createNextQueueVisualItems(currentVisualItems, [firstItem, secondItem], 100);

    expect(nextVisualItems).toHaveLength(2);
    expect(nextVisualItems[0]).toMatchObject({
      item: firstItem,
      fromSlot: 4,
      toSlot: 3,
      changedAtMs: 100,
    });
    expect(nextVisualItems[1]).toMatchObject({
      item: secondItem,
      fromSlot: 5,
      toSlot: 4,
      changedAtMs: 100,
    });
  });

  it("从 4 个追加到 5 个时所有旧项左移并补满最右槽位", () => {
    const oldItems = Array.from({ length: 4 }, (_, index) => createQueueItem(index));
    const nextItems = [...oldItems, createQueueItem(4)];
    const currentVisualItems = oldItems.map((item, index) => createVisualItem(item, index + 1));
    const nextVisualItems = createNextQueueVisualItems(currentVisualItems, nextItems, 100);

    expect(nextVisualItems.map((visualItem) => visualItem.toSlot)).toEqual([0, 1, 2, 3, 4]);
    expect(nextVisualItems[4]).toMatchObject({
      item: nextItems[4],
      fromSlot: 5,
      toSlot: 4,
    });
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
    expect(nextVisualItems.map((visualItem) => [visualItem.item.id, visualItem.fromSlot, visualItem.toSlot])).toEqual([
      ["item-1", 1, 0],
      ["item-2", 2, 1],
      ["item-3", 3, 2],
      ["item-4", 4, 3],
      ["item-5", 5, 4],
    ]);
    expect(nextVisualItems.some((visualItem) => visualItem.item.id === "item-0")).toBe(false);
  });

  it("即使传入超过 5 个也只保留最新 5 个可视项", () => {
    const nextItems = Array.from({ length: 6 }, (_, index) => createQueueItem(index));
    const nextVisualItems = createNextQueueVisualItems([], nextItems, 100);

    expect(nextVisualItems).toHaveLength(5);
    expect(nextVisualItems.map((visualItem) => visualItem.item.id)).toEqual([
      "item-1",
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
    expect(nextVisualItems.map((visualItem) => visualItem.toSlot)).toEqual([0, 1, 2, 3, 4]);
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
