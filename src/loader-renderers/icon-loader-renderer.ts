import { Application, Container, Graphics, Text, Ticker } from "pixi.js";
import { iconLoaderResourceSchema } from "../asset-registry/icon-loader-resource-schema";
import type { LoaderAssetRef } from "../loader-domain/loader-config";
import { orderIconLoaderPoints } from "../loader-domain/icon-loader-fill-order";
import {
  decodeIconLoaderResource,
  iconLoaderDisplayGrid,
  transformIconLoaderPointsToGrid,
} from "../loader-domain/icon-loader-resource";
import type { IconLoaderColoredPoint } from "../loader-domain/icon-loader-resource";
import { createIconLoaderRound } from "../loader-domain/icon-loader-round-order";
import type { IconLoaderRound } from "../loader-domain/icon-loader-round-order";
import type { LoaderScenario } from "../loader-domain/loader-config";
import type { IconLoaderEvent } from "../loader-domain/loader-event";
import type { LoaderRendererHandle } from "./pixi-loader-stage";

const animationCycleMs = 1800;

type IconLoaderResourceLoadState =
  | { kind: "loading" }
  | { kind: "ready"; points: IconLoaderColoredPoint[] }
  | { kind: "failed" };

/** 绘制 Icon Loader，像素组合只作为等待娱乐。 */
export function createIconLoaderRenderer(app: Application, scenario: LoaderScenario): LoaderRendererHandle {
  const root = new Container();
  const pixels = new Graphics();
  const title = new Text({
    text: "Icon Loader",
    style: {
      fontFamily: "Georgia, serif",
      fontSize: 14,
      fill: "#f8f4e3",
    },
  });
  let elapsedMs = 0;
  let cachedRoundIndex = -1;
  let cachedRound: IconLoaderRound | null = null;
  const events = scenario.events.filter((event): event is IconLoaderEvent => event.kind === "pixel_assemble");
  const assetById = new Map(scenario.assets.map((asset) => [asset.id, asset]));
  const patternByAssetId = new Map<string, IconLoaderResourceLoadState>();

  root.addChild(pixels, title);
  app.stage.addChild(root);

  function activeRoundEvent(): { event: IconLoaderEvent; roundSeed: number } | null {
    if (events.length === 0) {
      return null;
    }

    const stepIndex = Math.floor(elapsedMs / animationCycleMs);
    const roundIndex = Math.floor(stepIndex / events.length);
    const eventIndex = stepIndex % events.length;

    if (cachedRound === null || cachedRoundIndex !== roundIndex) {
      cachedRoundIndex = roundIndex;
      cachedRound = createIconLoaderRound(events, scenario.seed, roundIndex);
    }

    return {
      event: cachedRound.events[eventIndex],
      roundSeed: cachedRound.seed,
    };
  }

  function ensurePatternLoaded(asset: LoaderAssetRef): void {
    const existingState = patternByAssetId.get(asset.id);
    if (existingState !== undefined) {
      return;
    }

    patternByAssetId.set(asset.id, { kind: "loading" });
    void fetch(asset.path)
      .then((response) => response.json())
      .then((rawPattern: unknown) => {
        const parseResult = iconLoaderResourceSchema.safeParse(rawPattern);
        if (!parseResult.success) {
          patternByAssetId.set(asset.id, { kind: "failed" });
          return;
        }

        const sourcePoints = decodeIconLoaderResource(parseResult.data);
        const displayPoints = transformIconLoaderPointsToGrid(sourcePoints, {
          sourceGrid: parseResult.data.baseResolution,
          targetGrid: iconLoaderDisplayGrid,
        });

        patternByAssetId.set(asset.id, {
          kind: "ready",
          points: displayPoints,
        });
      })
      .catch(() => {
        patternByAssetId.set(asset.id, { kind: "failed" });
      });
  }

  function drawBackground(): void {
    pixels.clear();
    pixels.rect(0, 0, app.screen.width, app.screen.height).fill({ color: "#151319" });
    for (let index = 0; index < 36; index += 1) {
      const drift = Math.sin(elapsedMs / 210 + index) * 8;
      const y = ((elapsedMs / 12 + index * 17) % (app.screen.height + 40)) - 20;
      const x = (index * 31 + drift) % app.screen.width;
      pixels.rect(x, y, 5, 5).fill({ color: scenario.palette[index % scenario.palette.length], alpha: 0.24 });
    }
  }

  function drawFrame(ticker: Ticker): void {
    elapsedMs += ticker.deltaMS;
    const active = activeRoundEvent();
    const horizontalPadding = 34;
    const verticalReserved = 52;

    drawBackground();

    if (active !== null) {
      const event = active.event;
      const asset = assetById.get(event.assetId);
      if (asset === undefined) {
        title.text = "Icon Loader";
        title.x = 14;
        title.y = 12;
        return;
      }

      ensurePatternLoaded(asset);
      const loadState = patternByAssetId.get(asset.id);
      if (loadState === undefined || loadState.kind === "loading") {
        title.text = `Icon Loader · ${event.label}`;
        title.x = 14;
        title.y = 12;
        return;
      }

      if (loadState.kind === "failed") {
        title.text = "Icon Loader · 素材不可用";
        title.x = 14;
        title.y = 12;
        return;
      }

      const grid = iconLoaderDisplayGrid;
      const maxTileWidth = Math.floor((app.screen.width - horizontalPadding) / grid.columns);
      const maxTileHeight = Math.floor((app.screen.height - verticalReserved) / grid.rows);
      const tileSize = Math.max(1, Math.min(8, maxTileWidth, maxTileHeight));
      const tileGap = tileSize >= 5 ? 1 : 0;
      const gridWidth = grid.columns * tileSize;
      const gridHeight = grid.rows * tileSize;
      const originX = app.screen.width / 2 - gridWidth / 2;
      const originY = app.screen.height / 2 - gridHeight / 2 + 8;
      const points = orderIconLoaderPoints(loadState.points, {
        seed: active.roundSeed,
        patternId: event.assetId,
        atMs: event.atMs,
        grid,
      });
      const phase = (elapsedMs % animationCycleMs) / animationCycleMs;
      const visiblePointCount = Math.ceil(points.length * Math.min(1, phase * 1.35));
      const pulseAlpha = 0.78 + Math.sin(phase * Math.PI) * Math.min(0.2, event.burst / 120);

      points.slice(0, visiblePointCount).forEach((point) => {
        const x = originX + point.x * tileSize;
        const y = originY + point.y * tileSize;

        pixels.rect(x + tileGap, y + tileGap, tileSize - tileGap, tileSize - tileGap).fill({
          color: "#06070a",
          alpha: 0.22,
        });
        pixels.rect(x, y, tileSize - tileGap, tileSize - tileGap).fill({
          color: point.color,
          alpha: Math.min(1, point.alpha * pulseAlpha),
        });
      });

      title.text = `Icon Loader · ${event.label}`;
    } else {
      title.text = events.length === 0 ? "Icon Loader · 等待素材" : "Icon Loader";
    }

    title.x = 14;
    title.y = 12;
  }

  app.ticker.add(drawFrame);

  return {
    destroy(): void {
      app.ticker.remove(drawFrame);
      root.destroy({ children: true });
    },
  };
}
