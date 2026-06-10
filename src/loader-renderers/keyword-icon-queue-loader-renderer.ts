import { Application, Container, Graphics, Text, Ticker } from "pixi.js";
import { iconLoaderResourceSchema } from "../asset-registry/icon-loader-resource-schema";
import {
  decodeIconLoaderResource,
  iconLoaderResourceGrid,
  transformIconLoaderPointsToGrid,
} from "../loader-domain/icon-loader-resource";
import type { IconLoaderColoredPoint } from "../loader-domain/icon-loader-resource";
import type { KeywordIconQueueItem } from "../loader-domain/keyword-icon-queue";
import {
  createNextQueueVisualItems,
  keywordIconQueueSlotCount,
  isQueuePixelInsideVisibleBounds,
  resolveQueueLayout,
  resolveQueueVisibleBounds,
  resolveTransitionProgress,
  resolveSlotPosition,
  resolveVisualItemPosition,
  type QueueVisibleBounds,
  type QueueLayout,
  type QueueVisualItem,
} from "./keyword-icon-queue-visual-state";
import type { LoaderRendererHandle } from "./pixi-loader-stage";

const queueGrid = {
  columns: 16,
  rows: 16,
} as const;

const transitionMs = 520;

type QueueIconResourceLoadState =
  | { kind: "loading" }
  | { kind: "ready"; points: IconLoaderColoredPoint[] }
  | { kind: "failed" };

/** 绘制 Thinking 关键词驱动的 16x16 像素 icon 队列。 */
export function createKeywordIconQueueLoaderRenderer(app: Application): LoaderRendererHandle {
  const root = new Container();
  const pixels = new Graphics();
  const title = new Text({
    text: "Thinking Icons",
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 14,
      fontWeight: "700",
      fill: "#151822",
    },
  });
  const caption = new Text({
    text: "等待 thought keyword",
    style: {
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 12,
      fontWeight: "700",
      fill: "#0f7792",
    },
  });
  let elapsedMs = 0;
  let visualItems: QueueVisualItem[] = [];
  const patternByAssetId = new Map<string, QueueIconResourceLoadState>();

  root.addChild(pixels, title, caption);
  app.stage.addChild(root);

  /** 接收 React 传入的最新队列，并转为连续槽位动画。 */
  function setKeywordIconQueue(queue: readonly KeywordIconQueueItem[]): void {
    visualItems = createNextQueueVisualItems(visualItems, queue.slice(-keywordIconQueueSlotCount), elapsedMs);
  }

  /** 确保某个 icon 的 16x16 点阵已加载。 */
  function ensurePatternLoaded(item: KeywordIconQueueItem): void {
    const existingState = patternByAssetId.get(item.assetId);
    if (existingState !== undefined) {
      return;
    }

    patternByAssetId.set(item.assetId, { kind: "loading" });
    void fetch(item.path)
      .then((response) => response.json())
      .then((rawPattern: unknown) => {
        const parseResult = iconLoaderResourceSchema.safeParse(rawPattern);
        if (!parseResult.success) {
          patternByAssetId.set(item.assetId, { kind: "failed" });
          return;
        }

        const sourcePoints = decodeIconLoaderResource(parseResult.data);
        const displayPoints = transformIconLoaderPointsToGrid(sourcePoints, {
          sourceGrid: iconLoaderResourceGrid,
          targetGrid: queueGrid,
        });

        patternByAssetId.set(item.assetId, {
          kind: "ready",
          points: displayPoints,
        });
      })
      .catch(() => {
        patternByAssetId.set(item.assetId, { kind: "failed" });
      });
  }

  /** 绘制当前动画帧。 */
  function drawFrame(ticker: Ticker): void {
    elapsedMs += ticker.deltaMS;
    pixels.clear();
    pixels.rect(0, 0, app.screen.width, app.screen.height).fill({ color: "#f8fafc" });

    const layout = resolveQueueLayout(app.screen.width, app.screen.height);
    drawSlotGuides(layout);

    visualItems.forEach((visualItem) => {
      ensurePatternLoaded(visualItem.item);
      drawVisualItem(visualItem, layout);
    });

    visualItems = visualItems.filter((visualItem) => {
      return !visualItem.removing || elapsedMs - visualItem.changedAtMs < transitionMs;
    });

    title.x = 14;
    title.y = 12;
    caption.text = visualItems.length === 0 ? "等待 thought keyword" : "最新 5 个 · 16x16";
    caption.x = 14;
    caption.y = 32;
  }

  /** 绘制单个可视 icon。 */
  function drawVisualItem(visualItem: QueueVisualItem, layout: QueueLayout): void {
    const loadState = patternByAssetId.get(visualItem.item.assetId);
    const position = resolveVisualItemPosition(visualItem, layout, elapsedMs);
    const slotX = position.x;
    const slotY = position.y;
    const progress = resolveTransitionProgress(visualItem, elapsedMs);
    const alpha = visualItem.removing ? 1 - progress : progress;
    const bounds = resolveQueueVisibleBounds(layout);

    if (loadState === undefined || loadState.kind === "loading") {
      drawLoadingDots(slotX, slotY, layout, bounds, alpha);
      return;
    }

    if (loadState.kind === "failed") {
      drawFailedMark(slotX, slotY, layout, bounds, alpha);
      return;
    }

    loadState.points.forEach((point) => {
      const x = slotX + point.x * layout.tileSize;
      const y = slotY + point.y * layout.tileSize;
      if (!isQueuePixelInsideVisibleBounds(bounds, x, y, layout.pixelSize)) {
        return;
      }

      const color = Number.parseInt(point.color.replace("#", ""), 16);
      pixels.rect(x, y, layout.pixelSize, layout.pixelSize).fill({
        color,
        alpha: Math.min(1, point.alpha * alpha),
      });
    });
  }

  /** 绘制空槽位引导线。 */
  function drawSlotGuides(layout: QueueLayout): void {
    for (let index = 0; index < keywordIconQueueSlotCount; index += 1) {
      const position = resolveSlotPosition(layout, index);
      pixels.rect(position.x - 5, position.y - 5, layout.slotWidth + 10, layout.slotHeight + 10).stroke({
        color: "#d5deeb",
        alpha: 0.84,
        width: 1,
      });
    }
  }

  /** 绘制加载中的轻量点阵占位。 */
  function drawLoadingDots(x: number, y: number, layout: QueueLayout, bounds: QueueVisibleBounds, alpha: number): void {
    for (let index = 0; index < 4; index += 1) {
      const dotX = x + (index % 2) * layout.tileSize * 9 + layout.tileSize * 3;
      const dotY = y + Math.floor(index / 2) * layout.tileSize * 9 + layout.tileSize * 3;
      if (!isQueuePixelInsideVisibleBounds(bounds, dotX, dotY, layout.pixelSize)) {
        continue;
      }

      pixels.rect(dotX, dotY, layout.pixelSize, layout.pixelSize).fill({
        color: "#15bfd6",
        alpha: Math.max(0.2, alpha),
      });
    }
  }

  /** 绘制加载失败的交叉占位。 */
  function drawFailedMark(x: number, y: number, layout: QueueLayout, bounds: QueueVisibleBounds, alpha: number): void {
    for (let index = 0; index < queueGrid.columns; index += 1) {
      drawFailedMarkPixel(x + index * layout.tileSize, y + index * layout.tileSize, layout, bounds, alpha);
      drawFailedMarkPixel(
        x + (queueGrid.columns - 1 - index) * layout.tileSize,
        y + index * layout.tileSize,
        layout,
        bounds,
        alpha,
      );
    }
  }

  /** 绘制失败标记中的单个像素，统一执行可见边界裁剪。 */
  function drawFailedMarkPixel(
    x: number,
    y: number,
    layout: QueueLayout,
    bounds: QueueVisibleBounds,
    alpha: number,
  ): void {
    if (!isQueuePixelInsideVisibleBounds(bounds, x, y, layout.pixelSize)) {
      return;
    }

    pixels.rect(x, y, layout.pixelSize, layout.pixelSize).fill({
      color: "#ef476f",
      alpha: Math.max(0.2, alpha),
    });
  }

  app.ticker.add(drawFrame);

  return {
    setKeywordIconQueue,
    destroy(): void {
      app.ticker.remove(drawFrame);
      root.destroy({ children: true });
    },
  };
}
