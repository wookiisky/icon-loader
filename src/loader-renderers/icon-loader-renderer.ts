import { Application, Container, Graphics, Text, Ticker } from "pixi.js";
import { iconLoaderResourceSchema } from "../asset-registry/icon-loader-resource-schema";
import type { LoaderAssetRef } from "../loader-domain/loader-config";
import {
  decodeIconLoaderResource,
  iconLoaderDisplayGrid,
  transformIconLoaderPointsToGrid,
} from "../loader-domain/icon-loader-resource";
import type { IconLoaderColoredPoint } from "../loader-domain/icon-loader-resource";
import type { LoaderScenario } from "../loader-domain/loader-config";
import type { IconLoaderEvent } from "../loader-domain/loader-event";
import { createIconLoaderTransitionFrame } from "../loader-domain/icon-loader-transition-frame";
import type { IconLoaderFramePoint } from "../loader-domain/icon-loader-transition-frame";
import type { LoaderRendererHandle } from "./pixi-loader-stage";
import {
  createIconLoaderTimelineRound,
  resolveIconLoaderTimelineRoundFrame,
} from "./icon-loader-timeline";
import type { IconLoaderTimelineFrame, IconLoaderTimelineRound } from "./icon-loader-timeline";

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
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 14,
      fontWeight: "700",
      fill: "#151822",
    },
  });
  let elapsedMs = 0;
  let timelineRoundStartMs = 0;
  let cachedTimelineRound: IconLoaderTimelineRound | null = null;
  const events = scenario.events.filter((event): event is IconLoaderEvent => event.kind === "icon_transition");
  const assetById = new Map(scenario.assets.map((asset) => [asset.id, asset]));
  const patternByAssetId = new Map<string, IconLoaderResourceLoadState>();

  root.addChild(pixels, title);
  app.stage.addChild(root);

  function activeTimelineFrame(): IconLoaderTimelineFrame | null {
    if (events.length === 0) {
      return null;
    }

    if (cachedTimelineRound === null) {
      cachedTimelineRound = createIconLoaderTimelineRound({
        events,
        scenarioSeed: scenario.seed,
        roundIndex: 0,
      });
    }

    while (elapsedMs >= timelineRoundStartMs + cachedTimelineRound.durationMs) {
      timelineRoundStartMs += cachedTimelineRound.durationMs;
      cachedTimelineRound = createIconLoaderTimelineRound({
        events,
        scenarioSeed: scenario.seed,
        roundIndex: cachedTimelineRound.roundIndex + 1,
        previousLastAssetId: cachedTimelineRound.lastAssetId,
      });
    }

    return resolveIconLoaderTimelineRoundFrame({
      timelineRound: cachedTimelineRound,
      roundElapsedMs: elapsedMs - timelineRoundStartMs,
    });
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
    pixels.rect(0, 0, app.screen.width, app.screen.height).fill({ color: "#f8fafc" });
  }

  function drawFrame(ticker: Ticker): void {
    elapsedMs += ticker.deltaMS;
    const active = activeTimelineFrame();
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
        title.text = "Icon Loader";
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
      const phase = active.transitionProgress;
      const pulseAlpha = 0.78 + Math.sin(phase * Math.PI) * Math.min(0.2, event.burst / 120);
      const framePoints = createIconLoaderTransitionFrame({
        points: loadState.points,
        effect: event.effect,
        progress: phase,
        seed: active.roundSeed,
        patternId: event.assetId,
        atMs: event.atMs,
        grid,
        burst: event.burst,
        palette: scenario.palette,
      });

      framePoints.forEach((point) => {
        drawFramePoint(point, {
          originX,
          originY,
          tileSize,
          tileGap,
          pulseAlpha,
        });
      });

      title.text = "Icon Loader";
    } else {
      title.text = events.length === 0 ? "Icon Loader · 等待素材" : "Icon Loader";
    }

    title.x = 14;
    title.y = 12;
  }

  function drawFramePoint(
    point: IconLoaderFramePoint,
    options: {
      originX: number;
      originY: number;
      tileSize: number;
      tileGap: number;
      pulseAlpha: number;
    },
  ): void {
    const tileWidth = Math.max(1, options.tileSize - options.tileGap);
    const x = options.originX + point.drawX * options.tileSize;
    const y = options.originY + point.drawY * options.tileSize;

    if (point.trailAlpha > 0 && point.trailFromX !== undefined && point.trailFromY !== undefined) {
      const trailX = options.originX + point.trailFromX * options.tileSize;
      const trailY = options.originY + point.trailFromY * options.tileSize;
      pixels.moveTo(trailX + tileWidth / 2, trailY + tileWidth / 2);
      pixels.lineTo(x + tileWidth / 2, y + tileWidth / 2);
      pixels.stroke({ color: point.color, alpha: point.trailAlpha, width: Math.max(1, options.tileSize / 2) });
    }

    pixels.rect(x + options.tileGap, y + options.tileGap, tileWidth, tileWidth).fill({
      color: "#06070a",
      alpha: 0.18,
    });
    pixels.rect(x, y, tileWidth, tileWidth).fill({
      color: point.color,
      alpha: Math.min(1, point.alpha * options.pulseAlpha),
    });
  }

  app.ticker.add(drawFrame);

  return {
    destroy(): void {
      app.ticker.remove(drawFrame);
      root.destroy({ children: true });
    },
  };
}
