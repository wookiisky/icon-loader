import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/App";

const appMocks = vi.hoisted(() => ({
  loadAssetRegistry: vi.fn(),
  streamReplyFromProxy: vi.fn(),
  createLoaderRenderer: vi.fn(),
  createPixiApplication: vi.fn(),
  destroyPixiApplication: vi.fn(),
  setKeywordIconQueue: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../../src/asset-registry/load-asset-registry", () => ({
  loadAssetRegistry: appMocks.loadAssetRegistry,
}));

vi.mock("../../src/gemini-client/stream-reply-client", () => ({
  streamReplyFromProxy: appMocks.streamReplyFromProxy,
}));

vi.mock("../../src/loader-renderers/loader-renderer-factory", () => ({
  createLoaderRenderer: appMocks.createLoaderRenderer,
}));

vi.mock("../../src/loader-renderers/pixi-loader-stage", () => ({
  createPixiApplication: appMocks.createPixiApplication,
  destroyPixiApplication: appMocks.destroyPixiApplication,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const manifestRegistry = {
  assets: [
    {
      id: "pixel-icon-flat-color-icons-assistant",
      label: "Assistant",
      loaderKind: "icon_loader",
      assetKind: "icon_resource",
      format: "pixel-json",
      path: "/assistant.json",
      width: 64,
      height: 64,
      tags: ["flat-color-icons", "assistant"],
      license: "MIT",
      source: "test",
      attributionRequired: false,
    },
    {
      id: "pixel-icon-flat-color-icons-search",
      label: "Search",
      loaderKind: "icon_loader",
      assetKind: "icon_resource",
      format: "pixel-json",
      path: "/search.json",
      width: 64,
      height: 64,
      tags: ["flat-color-icons", "search"],
      license: "MIT",
      source: "test",
      attributionRequired: false,
    },
    {
      id: "pixel-icon-flat-color-icons-cache",
      label: "Cache",
      loaderKind: "icon_loader",
      assetKind: "icon_resource",
      format: "pixel-json",
      path: "/cache.json",
      width: 64,
      height: 64,
      tags: ["flat-color-icons", "cache"],
      license: "MIT",
      source: "test",
      attributionRequired: false,
    },
    {
      id: "pixel-icon-flat-color-icons-database",
      label: "Database",
      loaderKind: "icon_loader",
      assetKind: "icon_resource",
      format: "pixel-json",
      path: "/database.json",
      width: 64,
      height: 64,
      tags: ["flat-color-icons", "database"],
      license: "MIT",
      source: "test",
      attributionRequired: false,
    },
  ],
  findByLoaderKind: vi.fn(() => []),
  findByTag: vi.fn(() => []),
};

/** 构造只用于测试的可控异步流。 */
async function* createKeywordThenWaitingStream(waitForDone: Promise<void>): AsyncGenerator<unknown> {
  yield { kind: "thought_keyword", keyword: "database" };
  await waitForDone;
  yield { kind: "done" };
}

/** 构造多个关键词后等待结束的测试流。 */
async function* createKeywordsThenWaitingStream(
  keywords: readonly string[],
  waitForDone: Promise<void>,
): AsyncGenerator<unknown> {
  for (const keyword of keywords) {
    yield { kind: "thought_keyword", keyword };
  }
  await waitForDone;
  yield { kind: "done" };
}

/** 构造多个关键词后立即结束的测试流。 */
async function* createKeywordsThenDoneStream(keywords: readonly string[]): AsyncGenerator<unknown> {
  for (const keyword of keywords) {
    yield { kind: "thought_keyword", keyword };
  }
  yield { kind: "done" };
}

/** 构造多个关键词后立即失败的测试流。 */
async function* createKeywordsThenErrorStream(keywords: readonly string[]): AsyncGenerator<unknown> {
  for (const keyword of keywords) {
    yield { kind: "thought_keyword", keyword };
  }
  yield {
    kind: "error",
    message: "Gemini 请求失败。",
    causeKind: "gemini_request_failed",
  };
}

/** 构造关键词后立即结束的测试流。 */
async function* createKeywordThenDoneStream(onDone: () => void): AsyncGenerator<unknown> {
  yield { kind: "thought_keyword", keyword: "database" };
  yield { kind: "done" };
  onDone();
}

/** 刷新异步流和 React effect 产生的微任务。 */
async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** 返回 renderer 收到过的关键词队列快照。 */
function collectKeywordQueueSnapshots(): string[][] {
  return appMocks.setKeywordIconQueue.mock.calls.map(([queue]) => {
    if (!Array.isArray(queue)) {
      return [];
    }

    return queue.map((item) => item.keyword);
  });
}

/** 判断 renderer 是否收到过指定关键词队列。 */
function hasKeywordQueueSnapshot(keywords: readonly string[]): boolean {
  return collectKeywordQueueSnapshots().some((snapshot) => {
    return snapshot.length === keywords.length && snapshot.every((keyword, index) => keyword === keywords[index]);
  });
}

/** 配置 App 测试所需的 Pixi renderer mock。 */
function mockPixiRenderer(): void {
  appMocks.createPixiApplication.mockResolvedValue({
    stage: { addChild: vi.fn() },
    ticker: { add: vi.fn(), remove: vi.fn() },
    screen: { width: 320, height: 200 },
    canvas: document.createElement("canvas"),
    destroy: vi.fn(),
  });
  appMocks.createLoaderRenderer.mockReturnValue({
    setKeywordIconQueue: appMocks.setKeywordIconQueue,
    destroy: appMocks.destroy,
  });
}

describe("App", () => {
  it("连续多个 thought keyword 会首个立即 append，后续按间隔逐个 append", async () => {
    vi.useFakeTimers();
    let resolveStreamDone: () => void = () => undefined;
    const streamDone = new Promise<void>((resolve) => {
      resolveStreamDone = resolve;
    });
    appMocks.loadAssetRegistry.mockResolvedValue(manifestRegistry);
    appMocks.streamReplyFromProxy.mockImplementation(() =>
      createKeywordsThenWaitingStream(["database", "search", "cache"], streamDone),
    );
    mockPixiRenderer();

    render(<App />);
    await flushAsyncWork();
    fireEvent.change(screen.getByLabelText("输入问题"), { target: { value: "解释数据库索引" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    await flushAsyncWork();

    expect(hasKeywordQueueSnapshot(["database"])).toBe(true);
    expect(hasKeywordQueueSnapshot(["database", "search"])).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(359);
    });
    expect(hasKeywordQueueSnapshot(["database", "search"])).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(hasKeywordQueueSnapshot(["database", "search"])).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(360);
    });
    expect(hasKeywordQueueSnapshot(["database", "search", "cache"])).toBe(true);

    await act(async () => {
      resolveStreamDone();
      await vi.runOnlyPendingTimersAsync();
    });
  });

  it("多个关键词后立即 done 时不会丢掉首个可展示 icon", async () => {
    vi.useFakeTimers();
    appMocks.loadAssetRegistry.mockResolvedValue(manifestRegistry);
    appMocks.streamReplyFromProxy.mockImplementation(() => createKeywordsThenDoneStream(["database", "search"]));
    mockPixiRenderer();

    render(<App />);
    await flushAsyncWork();
    fireEvent.change(screen.getByLabelText("输入问题"), { target: { value: "解释数据库索引" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    await flushAsyncWork();

    expect(hasKeywordQueueSnapshot(["database"])).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(360);
    });
    expect(hasKeywordQueueSnapshot(["database", "search"])).toBe(false);
  });

  it("请求失败后旧 timer 不会继续 append 待播放 icon", async () => {
    vi.useFakeTimers();
    appMocks.loadAssetRegistry.mockResolvedValue(manifestRegistry);
    appMocks.streamReplyFromProxy.mockImplementation(() => createKeywordsThenErrorStream(["database", "search"]));
    mockPixiRenderer();

    render(<App />);
    await flushAsyncWork();
    fireEvent.change(screen.getByLabelText("输入问题"), { target: { value: "解释数据库索引" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    await flushAsyncWork();

    expect(hasKeywordQueueSnapshot(["database"])).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(360);
    });
    expect(hasKeywordQueueSnapshot(["database", "search"])).toBe(false);
  });

  it("资产清单 ready 后会把缓存关键词逐个 append", async () => {
    vi.useFakeTimers();
    let resolveRegistry: (registry: typeof manifestRegistry) => void = () => undefined;
    let resolveStreamDone: () => void = () => undefined;
    const streamDone = new Promise<void>((resolve) => {
      resolveStreamDone = resolve;
    });
    appMocks.loadAssetRegistry.mockReturnValue(
      new Promise((resolve) => {
        resolveRegistry = resolve;
      }),
    );
    appMocks.streamReplyFromProxy.mockImplementation(() =>
      createKeywordsThenWaitingStream(["database", "search"], streamDone),
    );
    mockPixiRenderer();

    render(<App />);
    fireEvent.change(screen.getByLabelText("输入问题"), { target: { value: "解释数据库索引" } });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    await flushAsyncWork();

    expect(hasKeywordQueueSnapshot(["database"])).toBe(false);

    await act(async () => {
      resolveRegistry(manifestRegistry);
    });
    await flushAsyncWork();

    expect(hasKeywordQueueSnapshot(["database"])).toBe(true);
    expect(hasKeywordQueueSnapshot(["database", "search"])).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(360);
    });
    expect(hasKeywordQueueSnapshot(["database", "search"])).toBe(true);

    await act(async () => {
      resolveStreamDone();
      await vi.runOnlyPendingTimersAsync();
    });
  });

  it("资产清单加载前收到的 thought keyword 会在清单 ready 后回放匹配", async () => {
    let resolveRegistry: (registry: typeof manifestRegistry) => void = () => undefined;
    let resolveStreamDone: () => void = () => undefined;
    const streamDone = new Promise<void>((resolve) => {
      resolveStreamDone = resolve;
    });
    appMocks.loadAssetRegistry.mockReturnValue(
      new Promise((resolve) => {
        resolveRegistry = resolve;
      }),
    );
    appMocks.streamReplyFromProxy.mockImplementation(() => createKeywordThenWaitingStream(streamDone));
    mockPixiRenderer();

    render(<App />);
    fireEvent.change(await screen.findByLabelText("输入问题"), { target: { value: "解释数据库索引" } });
    fireEvent.click(await screen.findByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(appMocks.streamReplyFromProxy).toHaveBeenCalled();
    });
    expect(appMocks.setKeywordIconQueue).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ keyword: "database" })]),
    );

    await act(async () => {
      resolveRegistry(manifestRegistry);
    });

    await waitFor(() => {
      expect(appMocks.setKeywordIconQueue).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            keyword: "database",
            assetId: "pixel-icon-flat-color-icons-database",
          }),
        ]),
      );
    });

    await act(async () => {
      resolveStreamDone();
    });
  });

  it("请求结束后资产清单才 ready 时不会回放过期 thought keyword", async () => {
    let resolveRegistry: (registry: typeof manifestRegistry) => void = () => undefined;
    let streamDone = false;
    appMocks.loadAssetRegistry.mockReturnValue(
      new Promise((resolve) => {
        resolveRegistry = resolve;
      }),
    );
    appMocks.streamReplyFromProxy.mockImplementation(() =>
      createKeywordThenDoneStream(() => {
        streamDone = true;
      }),
    );
    mockPixiRenderer();

    render(<App />);
    fireEvent.change(await screen.findByLabelText("输入问题"), { target: { value: "解释数据库索引" } });
    fireEvent.click(await screen.findByRole("button", { name: "提交" }));

    await waitFor(() => {
      expect(streamDone).toBe(true);
    });

    await act(async () => {
      resolveRegistry(manifestRegistry);
    });

    expect(appMocks.setKeywordIconQueue).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ keyword: "database" })]),
    );
  });
});
