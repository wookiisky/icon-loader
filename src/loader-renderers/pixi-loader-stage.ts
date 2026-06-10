import { Application } from "pixi.js";
import type { LoaderScenario } from "../loader-domain/loader-config";
import type { KeywordIconQueueItem } from "../loader-domain/keyword-icon-queue";

/** Loader 渲染器句柄，React 卸载时必须调用 destroy。 */
export type LoaderRendererHandle = {
  /** 可选实时更新关键词 icon 队列，只有队列 Loader 实现。 */
  setKeywordIconQueue?: (queue: readonly KeywordIconQueueItem[]) => void;
  /** 销毁渲染器并释放 Pixi 资源。 */
  destroy: () => void;
};

/** 单个 Loader 渲染器工厂函数。 */
export type LoaderRendererFactory = (app: Application, scenario: LoaderScenario) => LoaderRendererHandle;

/** PixiJS 应用创建尺寸约束。 */
export type PixiApplicationSizeOptions = {
  /** 容器宽度不可用或过小时使用的最小宽度。 */
  minWidth: number;
  /** 容器高度不可用或过小时使用的最小高度。 */
  minHeight: number;
};

const defaultPixiApplicationSizeOptions: PixiApplicationSizeOptions = {
  minWidth: 280,
  minHeight: 180,
};

/** 创建并挂载 PixiJS 应用，统一设置生命周期参数。 */
export async function createPixiApplication(
  container: HTMLElement,
  sizeOptions: PixiApplicationSizeOptions = defaultPixiApplicationSizeOptions,
): Promise<Application> {
  const app = new Application();
  const width = Math.max(container.clientWidth, sizeOptions.minWidth);
  const height = Math.max(container.clientHeight, sizeOptions.minHeight);

  await app.init({
    width,
    height,
    background: "#f8fafc",
    antialias: true,
    autoStart: true,
    sharedTicker: false,
  });

  app.canvas.className = "loader-canvas";
  container.appendChild(app.canvas);
  return app;
}

/** 销毁 PixiJS 应用并释放 canvas 和子节点资源。 */
export function destroyPixiApplication(app: Application): void {
  app.destroy(
    { removeView: true },
    {
      children: true,
      texture: true,
      textureSource: true,
    },
  );
}
