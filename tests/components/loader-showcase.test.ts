import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssetRegistry } from "../../src/asset-registry/asset-registry";
import { LoaderShowcase } from "../../src/components/LoaderShowcase";
import { resolveLoaderShowcaseSlotSeeds } from "../../src/components/loader-showcase-seeds";
import type { AppRequestState } from "../../src/app/app-state";
import { appendKeywordIconQueueItem, createEmptyKeywordIconQueueState } from "../../src/loader-domain/keyword-icon-queue";
import type { KeywordIconQueueItem } from "../../src/loader-domain/keyword-icon-queue";

const rendererMocks = vi.hoisted(() => ({
  createLoaderRenderer: vi.fn(),
  createPixiApplication: vi.fn(),
  destroyPixiApplication: vi.fn(),
  setKeywordIconQueue: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../../src/loader-renderers/loader-renderer-factory", () => ({
  createLoaderRenderer: rendererMocks.createLoaderRenderer,
}));

vi.mock("../../src/loader-renderers/pixi-loader-stage", () => ({
  createPixiApplication: rendererMocks.createPixiApplication,
  destroyPixiApplication: rendererMocks.destroyPixiApplication,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** 构造组件测试用关键词 icon 队列项。 */
function createQueueItem(index: number): KeywordIconQueueItem {
  return {
    id: `item-${index}`,
    keyword: `keyword-${index}`,
    assetId: `asset-${index}`,
    label: `Asset ${index}`,
    assetKind: "icon_resource",
    path: `/asset-${index}.json`,
    format: "pixel-json",
    width: 64,
    height: 64,
    appendedAtMs: 100 + index,
  };
}

/** 构造包含指定数量唯一 icon 的关键词队列状态。 */
function createQueueState(itemCount: number) {
  return Array.from({ length: itemCount }, (_, index) => createQueueItem(index)).reduce(
    appendKeywordIconQueueItem,
    createEmptyKeywordIconQueueState(),
  );
}

describe("resolveLoaderShowcaseSlotSeeds", () => {
  it("为三个展示槽位派生不同 seed", () => {
    const seeds = resolveLoaderShowcaseSlotSeeds(100);

    expect(seeds).toHaveLength(3);
    expect(new Set(seeds).size).toBe(3);
    expect(seeds).toEqual([100, 8019, 15501]);
  });

  it("未传入 seed 时使用稳定兜底 seed", () => {
    const seeds = resolveLoaderShowcaseSlotSeeds(null);

    expect(seeds).toHaveLength(3);
    expect(new Set(seeds).size).toBe(3);
  });

  it("关键词队列更新通过 renderer 动态接口完成，不重建 Pixi", async () => {
    rendererMocks.createPixiApplication.mockResolvedValue({
      stage: { addChild: vi.fn() },
      ticker: { add: vi.fn(), remove: vi.fn() },
      screen: { width: 320, height: 200 },
      canvas: document.createElement("canvas"),
      destroy: vi.fn(),
    });
    rendererMocks.createLoaderRenderer.mockReturnValue({
      setKeywordIconQueue: rendererMocks.setKeywordIconQueue,
      destroy: rendererMocks.destroy,
    });

    const firstState: AppRequestState = {
      kind: "loading",
      requestId: "r1",
      seed: 1,
      startedAtMs: 100,
      streamedText: "",
      keywordIconQueueState: createEmptyKeywordIconQueueState(),
    };
    const secondState: AppRequestState = {
      ...firstState,
      keywordIconQueueState: appendKeywordIconQueueItem(firstState.keywordIconQueueState, createQueueItem(1)),
    };

    const view = render(
      createElement(LoaderShowcase, {
        assetRegistry: createAssetRegistry({ assets: [] }),
        manualSeed: null,
        playing: false,
        state: firstState,
      }),
    );

    await waitFor(() => {
      expect(rendererMocks.createLoaderRenderer).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      createElement(LoaderShowcase, {
        assetRegistry: createAssetRegistry({ assets: [] }),
        manualSeed: null,
        playing: false,
        state: secondState,
      }),
    );

    await waitFor(() => {
      expect(rendererMocks.setKeywordIconQueue).toHaveBeenLastCalledWith(secondState.keywordIconQueueState.items.slice(-5));
    });
    expect(rendererMocks.createLoaderRenderer).toHaveBeenCalledTimes(1);
    expect(rendererMocks.createPixiApplication).toHaveBeenCalledTimes(1);
  });

  it("Pixi 初始化完成时使用最新关键词队列", async () => {
    let resolvePixiApplication: (app: unknown) => void = () => undefined;
    rendererMocks.createPixiApplication.mockReturnValue(
      new Promise((resolve) => {
        resolvePixiApplication = resolve;
      }),
    );
    rendererMocks.createLoaderRenderer.mockReturnValue({
      setKeywordIconQueue: rendererMocks.setKeywordIconQueue,
      destroy: rendererMocks.destroy,
    });

    const firstState: AppRequestState = {
      kind: "loading",
      requestId: "r1",
      seed: 1,
      startedAtMs: 100,
      streamedText: "",
      keywordIconQueueState: createEmptyKeywordIconQueueState(),
    };
    const secondState: AppRequestState = {
      ...firstState,
      keywordIconQueueState: appendKeywordIconQueueItem(firstState.keywordIconQueueState, createQueueItem(1)),
    };

    const view = render(
      createElement(LoaderShowcase, {
        assetRegistry: createAssetRegistry({ assets: [] }),
        manualSeed: null,
        playing: false,
        state: firstState,
      }),
    );
    view.rerender(
      createElement(LoaderShowcase, {
        assetRegistry: createAssetRegistry({ assets: [] }),
        manualSeed: null,
        playing: false,
        state: secondState,
      }),
    );

    resolvePixiApplication({
      stage: { addChild: vi.fn() },
      ticker: { add: vi.fn(), remove: vi.fn() },
      screen: { width: 320, height: 200 },
      canvas: document.createElement("canvas"),
      destroy: vi.fn(),
    });

    await waitFor(() => {
      expect(rendererMocks.setKeywordIconQueue).toHaveBeenLastCalledWith(secondState.keywordIconQueueState.items.slice(-5));
    });
  });

  it("关键词队列标题展示最新 5 个", () => {
    render(
      createElement(LoaderShowcase, {
        assetRegistry: createAssetRegistry({ assets: [] }),
        manualSeed: null,
        playing: false,
        state: { kind: "idle" },
      }),
    );

    expect(screen.getByText("16x16 · 最新 5 个")).toBeInTheDocument();
  });

  it("逻辑队列有 10 项时只把最新 5 项传给 renderer", async () => {
    rendererMocks.createPixiApplication.mockResolvedValue({
      stage: { addChild: vi.fn() },
      ticker: { add: vi.fn(), remove: vi.fn() },
      screen: { width: 320, height: 200 },
      canvas: document.createElement("canvas"),
      destroy: vi.fn(),
    });
    rendererMocks.createLoaderRenderer.mockReturnValue({
      setKeywordIconQueue: rendererMocks.setKeywordIconQueue,
      destroy: rendererMocks.destroy,
    });
    const queueState = createQueueState(10);
    const state: AppRequestState = {
      kind: "loading",
      requestId: "r1",
      seed: 1,
      startedAtMs: 100,
      streamedText: "",
      keywordIconQueueState: queueState,
    };

    render(
      createElement(LoaderShowcase, {
        assetRegistry: createAssetRegistry({ assets: [] }),
        manualSeed: null,
        playing: false,
        state,
      }),
    );

    await waitFor(() => {
      expect(rendererMocks.setKeywordIconQueue).toHaveBeenLastCalledWith(queueState.items.slice(-5));
    });
  });

  it("流式文本变化但队列引用不变时不重复推送关键词队列", async () => {
    rendererMocks.createPixiApplication.mockResolvedValue({
      stage: { addChild: vi.fn() },
      ticker: { add: vi.fn(), remove: vi.fn() },
      screen: { width: 320, height: 200 },
      canvas: document.createElement("canvas"),
      destroy: vi.fn(),
    });
    rendererMocks.createLoaderRenderer.mockReturnValue({
      setKeywordIconQueue: rendererMocks.setKeywordIconQueue,
      destroy: rendererMocks.destroy,
    });
    const queueState = createQueueState(3);
    const firstState: AppRequestState = {
      kind: "loading",
      requestId: "r1",
      seed: 1,
      startedAtMs: 100,
      streamedText: "第一段",
      keywordIconQueueState: queueState,
    };
    const view = render(
      createElement(LoaderShowcase, {
        assetRegistry: createAssetRegistry({ assets: [] }),
        manualSeed: null,
        playing: false,
        state: firstState,
      }),
    );

    await waitFor(() => {
      expect(rendererMocks.setKeywordIconQueue).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      createElement(LoaderShowcase, {
        assetRegistry: createAssetRegistry({ assets: [] }),
        manualSeed: null,
        playing: false,
        state: {
          ...firstState,
          streamedText: "第一段第二段",
        },
      }),
    );

    expect(rendererMocks.setKeywordIconQueue).toHaveBeenCalledTimes(1);
  });
});
