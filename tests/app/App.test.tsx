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

/** 构造关键词后立即结束的测试流。 */
async function* createKeywordThenDoneStream(onDone: () => void): AsyncGenerator<unknown> {
  yield { kind: "thought_keyword", keyword: "database" };
  yield { kind: "done" };
  onDone();
}

describe("App", () => {
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
