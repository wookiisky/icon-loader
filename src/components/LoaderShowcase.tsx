import { useEffect, useMemo, useRef } from "react";
import type { AssetRegistry } from "../asset-registry/asset-registry";
import { resolveLoaderSeed } from "../app/app-state";
import type { AppRequestState } from "../app/app-state";
import type { LoaderScenario } from "../loader-domain/loader-config";
import type { KeywordIconQueueItem } from "../loader-domain/keyword-icon-queue";
import { generateLoaderScenario } from "../loader-generation/loader-scenario-generator";
import { createLoaderRenderer } from "../loader-renderers/loader-renderer-factory";
import type { LoaderRendererHandle } from "../loader-renderers/pixi-loader-stage";
import { createPixiApplication, destroyPixiApplication } from "../loader-renderers/pixi-loader-stage";
import { loaderShowcaseSlots, resolveLoaderShowcaseSlotSeeds } from "./loader-showcase-seeds";

type LoaderShowcaseProps = {
  assetRegistry: AssetRegistry;
  manualSeed: number | null;
  playing: boolean;
  state: AppRequestState;
};

type LoaderTileProps = {
  scenario: LoaderScenario;
  playing: boolean;
  title: string;
};

type KeywordQueueTileProps = {
  queue: readonly KeywordIconQueueItem[];
  playing: boolean;
};

const emptyKeywordIconQueue: readonly KeywordIconQueueItem[] = [];
const visibleKeywordIconQueueLength = 5;

/** 单个 PixiJS Loader 容器，负责挂载、启动和销毁 PixiJS 实例。 */
function LoaderTile({ scenario, playing, title }: LoaderTileProps) {
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
        <span>{title}</span>
        <small>{scenarioTitleMap[scenario.kind]} · {scenario.tempo}</small>
      </div>
      <div className="loader-stage" ref={containerRef}>
        {!playing ? <div className="loader-resting">等待启动</div> : null}
      </div>
    </section>
  );
}

/** Thinking 关键词像素队列容器，只通过 renderer 动态接口更新队列。 */
function KeywordQueueTile({ queue, playing }: KeywordQueueTileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<LoaderRendererHandle | null>(null);
  const latestQueueRef = useRef<readonly KeywordIconQueueItem[]>(queue);

  useEffect(() => {
    latestQueueRef.current = queue;
  }, [queue]);

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

      const renderer = createLoaderRenderer(app, {
        kind: "keyword_icon_queue_loader",
        seed: 0,
        palette: ["#15bfd6", "#6d4aff", "#f4d35e", "#151822"],
        tempo: "normal",
        assets: [],
        events: [],
      });
      renderer.setKeywordIconQueue?.(latestQueueRef.current);
      rendererRef.current = renderer;
      cleanup = () => {
        rendererRef.current = null;
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
  }, [playing]);

  useEffect(() => {
    rendererRef.current?.setKeywordIconQueue?.(queue);
  }, [queue]);

  return (
    <section className="loader-tile keyword-queue-tile">
      <div className="loader-tile-header">
        <span>Thinking Icons</span>
        <small>16x16 · 最新 5 个</small>
      </div>
      <div className="loader-stage keyword-queue-stage" ref={containerRef}>
        {!playing ? <div className="loader-resting">等待 thought keyword</div> : null}
      </div>
    </section>
  );
}

const scenarioTitleMap: Record<LoaderScenario["kind"], string> = {
  icon_loader: "Icon Loader",
  keyword_icon_queue_loader: "Thinking Icons",
};

/** 多 Loader 展示区，Loader 生命周期跟随请求状态和手动控制状态。 */
export function LoaderShowcase({ assetRegistry, manualSeed, playing, state }: LoaderShowcaseProps) {
  const seed = resolveLoaderSeed(state, manualSeed);
  const keywordIconQueueItems = state.kind === "loading" ? state.keywordIconQueueState.items : emptyKeywordIconQueue;
  const keywordIconQueue = useMemo(() => {
    if (keywordIconQueueItems.length <= visibleKeywordIconQueueLength) {
      return keywordIconQueueItems;
    }

    return keywordIconQueueItems.slice(-visibleKeywordIconQueueLength);
  }, [keywordIconQueueItems]);
  const keywordQueuePlaying = state.kind === "loading";
  const scenarios = useMemo(() => {
    const slotSeeds = resolveLoaderShowcaseSlotSeeds(seed);
    return loaderShowcaseSlots.map((slot, index) => ({
      slot,
      scenario: generateLoaderScenario("icon_loader", slotSeeds[index], assetRegistry),
    }));
  }, [assetRegistry, seed]);

  return (
    <aside className="loader-showcase" aria-label="Loader 动画展示">
      <KeywordQueueTile playing={keywordQueuePlaying} queue={keywordIconQueue} />
      <div className="loader-grid">
        {scenarios.map(({ slot, scenario }) => (
          <LoaderTile key={`${slot.id}-${scenario.seed}`} playing={playing} scenario={scenario} title={slot.title} />
        ))}
      </div>
    </aside>
  );
}
