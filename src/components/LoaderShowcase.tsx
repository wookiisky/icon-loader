import { useEffect, useMemo, useRef, useState } from "react";
import { createAssetRegistry } from "../asset-registry/asset-registry";
import type { AssetRegistry } from "../asset-registry/asset-registry";
import { resolveLoaderSeed } from "../app/app-state";
import type { AppRequestState } from "../app/app-state";
import type { LoaderScenario } from "../loader-domain/loader-config";
import { defaultLoaderKinds } from "../loader-domain/loader-kind";
import { generateLoaderScenario } from "../loader-generation/loader-scenario-generator";
import { createLoaderRenderer } from "../loader-renderers/loader-renderer-factory";
import { createPixiApplication, destroyPixiApplication } from "../loader-renderers/pixi-loader-stage";

type LoaderShowcaseProps = {
  manualSeed: number | null;
  playing: boolean;
  state: AppRequestState;
};

type LoaderTileProps = {
  scenario: LoaderScenario;
  playing: boolean;
};

/** 单个 PixiJS Loader 容器，负责挂载、启动和销毁 PixiJS 实例。 */
function LoaderTile({ scenario, playing }: LoaderTileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || !playing) {
      return;
    }

    const containerElement: HTMLElement = container;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    async function mount(): Promise<void> {
      const app = await createPixiApplication(containerElement);
      if (disposed) {
        destroyPixiApplication(app);
        return;
      }

      const renderer = createLoaderRenderer(app, scenario);
      cleanup = () => {
        renderer.destroy();
        destroyPixiApplication(app);
      };
    }

    void mount();

    return () => {
      disposed = true;
      cleanup?.();
      cleanup = null;
    };
  }, [playing, scenario]);

  return (
    <section className="loader-tile">
      <div className="loader-tile-header">
        <span>{scenarioTitleMap[scenario.kind]}</span>
        <small>{scenario.tempo}</small>
      </div>
      <div className="loader-stage" ref={containerRef}>
        {!playing ? <div className="loader-resting">等待启动</div> : null}
      </div>
    </section>
  );
}

const scenarioTitleMap: Record<LoaderScenario["kind"], string> = {
  icon_loader: "Icon Loader",
};

/** 加载资产清单，失败时回退为空清单，避免影响主回复链路。 */
async function loadAssetRegistry(): Promise<AssetRegistry> {
  try {
    const response = await fetch("/assets/loaders/manifest.json");
    const manifest: unknown = await response.json();
    return createAssetRegistry(manifest);
  } catch {
    return createAssetRegistry({ assets: [] });
  }
}

/** 多 Loader 展示区，Loader 生命周期跟随请求状态和手动控制状态。 */
export function LoaderShowcase({ manualSeed, playing, state }: LoaderShowcaseProps) {
  const [assetRegistry, setAssetRegistry] = useState<AssetRegistry>(() => createAssetRegistry({ assets: [] }));
  const seed = resolveLoaderSeed(state, manualSeed);
  const scenarios = useMemo(() => {
    const baseSeed = seed ?? 20260605;
    return defaultLoaderKinds.map((kind, index) => generateLoaderScenario(kind, baseSeed + index * 101, assetRegistry));
  }, [assetRegistry, seed]);

  useEffect(() => {
    let disposed = false;
    void loadAssetRegistry().then((registry) => {
      if (!disposed) {
        setAssetRegistry(registry);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  return (
    <aside className="loader-showcase" aria-label="Loader 动画展示">
      {scenarios.map((scenario) => (
        <LoaderTile key={`${scenario.kind}-${scenario.seed}`} playing={playing} scenario={scenario} />
      ))}
    </aside>
  );
}
