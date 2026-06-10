import type { Application } from "pixi.js";
import type { LoaderScenario } from "../loader-domain/loader-config";
import { createIconLoaderRenderer } from "./icon-loader-renderer";
import { createKeywordIconQueueLoaderRenderer } from "./keyword-icon-queue-loader-renderer";
import type { LoaderRendererHandle } from "./pixi-loader-stage";

/** 根据 Loader 类型创建对应 PixiJS 渲染器。 */
export function createLoaderRenderer(app: Application, scenario: LoaderScenario): LoaderRendererHandle {
  if (scenario.kind === "keyword_icon_queue_loader") {
    return createKeywordIconQueueLoaderRenderer(app);
  }

  return createIconLoaderRenderer(app, scenario);
}
