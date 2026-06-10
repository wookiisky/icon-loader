import type { KeywordIconQueueItem } from "../loader-domain/keyword-icon-queue";

const transitionMs = 520;
const queueGridColumns = 16;
const queueGridRows = 16;
const slotsPerRow = 5;
const columnGapPx = 18;

/** Thinking Icon Queue 的可见槽位数。 */
export const keywordIconQueueSlotCount = 5;

/** Thinking Icon Queue 渲染器中的单个可视项。 */
export type QueueVisualItem = {
  /** 队列 icon 数据。 */
  item: KeywordIconQueueItem;
  /** 动画开始时所在槽位。 */
  fromSlot: number;
  /** 动画结束时所在槽位。 */
  toSlot: number;
  /** 本次槽位变化开始时间。 */
  changedAtMs: number;
  /** 是否正在离开队列。 */
  removing: boolean;
};

/** Thinking Icon Queue 的槽位布局。 */
export type QueueLayout = {
  /** 队列整体左上角横坐标。 */
  originX: number;
  /** 队列整体左上角纵坐标。 */
  originY: number;
  /** 单个像素格尺寸。 */
  tileSize: number;
  /** 实际绘制像素尺寸。 */
  pixelSize: number;
  /** 单个 icon 槽位宽度。 */
  slotWidth: number;
  /** 单个 icon 槽位高度。 */
  slotHeight: number;
  /** 单行槽位数。 */
  slotsPerRow: number;
  /** 槽位横向间距。 */
  columnGapPx: number;
};

/** Thinking Icon Queue 中单个槽位的左上角坐标。 */
export type QueueSlotPosition = {
  /** 槽位左上角横坐标。 */
  x: number;
  /** 槽位左上角纵坐标。 */
  y: number;
};

/** Thinking Icon Queue 可见区域边界。 */
export type QueueVisibleBounds = {
  /** 可见区域左边界。 */
  x: number;
  /** 可见区域上边界。 */
  y: number;
  /** 可见区域宽度。 */
  width: number;
  /** 可见区域高度。 */
  height: number;
};

/** 根据新队列计算下一批可视项，并避免同一 assetId 同屏重复。 */
export function createNextQueueVisualItems(
  currentVisualItems: readonly QueueVisualItem[],
  queue: readonly KeywordIconQueueItem[],
  nowMs: number,
): QueueVisualItem[] {
  const activeItems = currentVisualItems.filter((visualItem) => !visualItem.removing);
  const previousById = new Map(activeItems.map((visualItem) => [visualItem.item.id, visualItem]));
  const nextVisualItems: QueueVisualItem[] = [];

  queue.forEach((item, index) => {
    const previousItem = previousById.get(item.id);
    if (previousItem === undefined) {
      nextVisualItems.push({
        item,
        fromSlot: keywordIconQueueSlotCount,
        toSlot: index,
        changedAtMs: nowMs,
        removing: false,
      });
      return;
    }

    if (previousItem.toSlot === index) {
      nextVisualItems.push(previousItem);
      return;
    }

    nextVisualItems.push({
      item,
      fromSlot: resolveCurrentSlot(previousItem, nowMs),
      toSlot: index,
      changedAtMs: nowMs,
      removing: false,
    });
  });

  return nextVisualItems;
}

/** 计算 5 槽 16x16 队列在画布中的单行布局。 */
export function resolveQueueLayout(screenWidth: number, screenHeight: number): QueueLayout {
  const horizontalPadding = 36;
  const verticalReserved = 86;
  const maxTileWidth = Math.floor((screenWidth - horizontalPadding - columnGapPx * (slotsPerRow - 1)) / (queueGridColumns * slotsPerRow));
  const maxTileHeight = Math.floor((screenHeight - verticalReserved) / queueGridRows);
  const tileSize = Math.max(1, Math.min(8, maxTileWidth, maxTileHeight));
  const pixelSize = Math.max(1, tileSize - 1);
  const slotWidth = queueGridColumns * tileSize;
  const slotHeight = queueGridRows * tileSize;
  const queueWidth = slotWidth * slotsPerRow + columnGapPx * (slotsPerRow - 1);

  return {
    originX: Math.max(0, screenWidth / 2 - queueWidth / 2),
    originY: Math.max(48, screenHeight / 2 - slotHeight / 2 + 18),
    tileSize,
    pixelSize,
    slotWidth,
    slotHeight,
    slotsPerRow,
    columnGapPx,
  };
}

/** 解析槽位左上角坐标，支持 -1 和 5 这样的同一行队列外动画位置。 */
export function resolveSlotPosition(layout: QueueLayout, slot: number): QueueSlotPosition {
  return {
    x: layout.originX + slot * (layout.slotWidth + layout.columnGapPx),
    y: layout.originY,
  };
}

/** 解析 5 个可见槽位共同组成的裁剪边界。 */
export function resolveQueueVisibleBounds(layout: QueueLayout): QueueVisibleBounds {
  const lastSlot = resolveSlotPosition(layout, keywordIconQueueSlotCount - 1);

  return {
    x: layout.originX,
    y: layout.originY,
    width: lastSlot.x + layout.slotWidth - layout.originX,
    height: layout.slotHeight,
  };
}

/** 判断一个绘制像素是否完整落在 5 槽可见区域内。 */
export function isQueuePixelInsideVisibleBounds(
  bounds: QueueVisibleBounds,
  x: number,
  y: number,
  size: number,
): boolean {
  return x >= bounds.x && x + size <= bounds.x + bounds.width && y >= bounds.y && y + size <= bounds.y + bounds.height;
}

/** 解析可视项当前左上角坐标，使用起止槽位坐标插值，避免跨行槽位跳变。 */
export function resolveVisualItemPosition(visualItem: QueueVisualItem, layout: QueueLayout, nowMs: number): QueueSlotPosition {
  const progress = resolveTransitionProgress(visualItem, nowMs);
  const easedProgress = 1 - (1 - progress) ** 3;
  const fromPosition = resolveSlotPosition(layout, visualItem.fromSlot);
  const toPosition = resolveSlotPosition(layout, visualItem.toSlot);

  return {
    x: fromPosition.x + (toPosition.x - fromPosition.x) * easedProgress,
    y: fromPosition.y + (toPosition.y - fromPosition.y) * easedProgress,
  };
}

/** 计算 icon 当前所在槽位，支持滑入、左移和滑出。 */
export function resolveCurrentSlot(visualItem: QueueVisualItem, nowMs: number): number {
  const progress = resolveTransitionProgress(visualItem, nowMs);
  const easedProgress = 1 - (1 - progress) ** 3;
  return visualItem.fromSlot + (visualItem.toSlot - visualItem.fromSlot) * easedProgress;
}

/** 计算当前槽位变化的 0 到 1 进度。 */
export function resolveTransitionProgress(visualItem: QueueVisualItem, nowMs: number): number {
  const progress = (nowMs - visualItem.changedAtMs) / transitionMs;
  return Math.min(1, Math.max(0, progress));
}
