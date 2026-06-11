import { useEffect, useReducer, useRef, useState } from "react";
import { createAssetRegistry } from "../asset-registry/asset-registry";
import type { AssetRegistry } from "../asset-registry/asset-registry";
import { matchKeywordToIconAsset } from "../asset-registry/keyword-icon-asset-matcher";
import { loadAssetRegistry } from "../asset-registry/load-asset-registry";
import { appRequestReducer } from "./app-reducer";
import { initialAppRequestState, shouldPlayLoaderAnimation } from "./app-state";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoaderShowcase } from "../components/LoaderShowcase";
import { PromptForm } from "../components/PromptForm";
import { ReplyStreamPanel } from "../components/ReplyStreamPanel";
import { streamReplyFromProxy } from "../gemini-client/stream-reply-client";
import type { KeywordIconQueueItem } from "../loader-domain/keyword-icon-queue";

type AssetRegistryLoadState = "loading" | "ready" | "failed";

type PendingKeywordIconItem = {
  /** 所属请求 ID，用于防止旧请求 timer 串入新请求。 */
  requestId: string;
  /** 已完成资产匹配、等待进入 UI 队列的 icon。 */
  item: KeywordIconQueueItem;
};

const keywordIconAppendIntervalMs = 360;

/** 生成请求 ID，避免不同流式请求互相覆盖状态。 */
function createRequestId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

/** 生成 Loader seed，每次请求都有可见差异。 */
function createLoaderSeed(): number {
  return Math.floor((Date.now() % 100000000) + Math.random() * 100000);
}

/** 应用根组件，协调输入、Gemini 流式回复和 Loader 生命周期。 */
export function App() {
  const [state, dispatch] = useReducer(appRequestReducer, initialAppRequestState);
  const [assetRegistry, setAssetRegistry] = useState<AssetRegistry>(() => createAssetRegistry({ assets: [] }));
  const [assetRegistryLoadState, setAssetRegistryLoadState] = useState<AssetRegistryLoadState>("loading");
  const [manualLoaderPlaying, setManualLoaderPlaying] = useState(false);
  const [manualLoaderSeed, setManualLoaderSeed] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const assetRegistryRef = useRef<AssetRegistry>(assetRegistry);
  const assetRegistryLoadStateRef = useRef<AssetRegistryLoadState>(assetRegistryLoadState);
  const pendingKeywordEventsRef = useRef<{ requestId: string; keyword: string; receivedAtMs: number }[]>([]);
  const pendingKeywordIconItemsRef = useRef<PendingKeywordIconItem[]>([]);
  const keywordIconAppendTimerRef = useRef<number | null>(null);
  const lastKeywordIconAppendAtRef = useRef<number | null>(null);
  const currentLoadingRequestIdRef = useRef<string | null>(null);
  const isLoading = state.kind === "loading";
  const loaderPlaying = shouldPlayLoaderAnimation(state, manualLoaderPlaying);

  useEffect(() => {
    currentLoadingRequestIdRef.current = state.kind === "loading" ? state.requestId : null;
  }, [state]);

  useEffect(() => {
    assetRegistryRef.current = assetRegistry;
  }, [assetRegistry]);

  useEffect(() => {
    assetRegistryLoadStateRef.current = assetRegistryLoadState;
  }, [assetRegistryLoadState]);

  useEffect(() => {
    let disposed = false;
    void loadAssetRegistry()
      .then((registry) => {
        if (!disposed) {
          setAssetRegistry(registry);
          setAssetRegistryLoadState("ready");
        }
      })
      .catch(() => {
        if (!disposed) {
          setAssetRegistry(createAssetRegistry({ assets: [] }));
          pendingKeywordEventsRef.current = [];
          setAssetRegistryLoadState("failed");
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearKeywordIconAppendTimer();
    };
  }, []);

  useEffect(() => {
    if (assetRegistryLoadState !== "ready" || state.kind !== "loading") {
      return;
    }

    const pendingEvents = pendingKeywordEventsRef.current.filter((event) => event.requestId === state.requestId);
    pendingKeywordEventsRef.current = pendingKeywordEventsRef.current.filter((event) => event.requestId !== state.requestId);
    pendingEvents.forEach((event) => {
      dispatchKeywordIconMatch(event.requestId, event.keyword, event.receivedAtMs);
    });
  }, [assetRegistryLoadState, state]);

  function handleManualLoaderStart(): void {
    setManualLoaderSeed(createLoaderSeed());
    setManualLoaderPlaying(true);
  }

  async function handlePromptSubmit(prompt: string): Promise<void> {
    if (state.kind === "loading") {
      return;
    }

    const requestId = createRequestId();
    const seed = createLoaderSeed();
    const trimmedPrompt = prompt.trim();
    clearPendingKeywordEvents();
    clearPendingKeywordIconItems();
    currentLoadingRequestIdRef.current = trimmedPrompt.length > 0 ? requestId : null;
    dispatch({
      kind: "submit",
      requestId,
      seed,
      nowMs: Date.now(),
      prompt,
    });

    if (trimmedPrompt.length === 0) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    for await (const event of streamReplyFromProxy(trimmedPrompt, abortController.signal)) {
      if (event.kind === "chunk") {
        dispatch({ kind: "stream_chunk", requestId, text: event.text });
      } else if (event.kind === "thought_keyword") {
        handleThoughtKeywordEvent(requestId, event.keyword);
      } else if (event.kind === "done") {
        clearPendingKeywordEvents(requestId);
        clearPendingKeywordIconItems();
        currentLoadingRequestIdRef.current = null;
        dispatch({ kind: "stream_done", requestId, nowMs: Date.now() });
      } else {
        clearPendingKeywordEvents(requestId);
        clearPendingKeywordIconItems();
        currentLoadingRequestIdRef.current = null;
        dispatch({
          kind: "fail",
          requestId,
          message: event.message,
          causeKind: event.causeKind,
        });
      }
    }
  }

  /** 清理逐项 append 的 timer，避免卸载或终态后继续触发。 */
  function clearKeywordIconAppendTimer(): void {
    if (keywordIconAppendTimerRef.current === null) {
      return;
    }

    window.clearTimeout(keywordIconAppendTimerRef.current);
    keywordIconAppendTimerRef.current = null;
  }

  /** 清理已匹配但尚未展示的 icon 队列。 */
  function clearPendingKeywordIconItems(): void {
    clearKeywordIconAppendTimer();
    pendingKeywordIconItemsRef.current = [];
    lastKeywordIconAppendAtRef.current = null;
  }

  /** 根据资产加载状态处理 thought keyword，加载中则先缓存。 */
  function handleThoughtKeywordEvent(requestId: string, keyword: string): void {
    const receivedAtMs = Date.now();
    if (assetRegistryLoadStateRef.current === "loading") {
      pendingKeywordEventsRef.current = [
        ...pendingKeywordEventsRef.current,
        { requestId, keyword, receivedAtMs },
      ].slice(-20);
      return;
    }

    dispatchKeywordIconMatch(requestId, keyword, receivedAtMs);
  }

  /** 清理尚未匹配的关键词，避免终态请求或新请求残留缓存。 */
  function clearPendingKeywordEvents(requestId?: string): void {
    if (requestId === undefined) {
      pendingKeywordEventsRef.current = [];
      return;
    }

    pendingKeywordEventsRef.current = pendingKeywordEventsRef.current.filter((event) => event.requestId !== requestId);
  }

  /** 在浏览器边界完成关键词到 icon 资产的匹配，再把纯队列项交给 reducer。 */
  function dispatchKeywordIconMatch(requestId: string, keyword: string, appendedAtMs: number): void {
    if (currentLoadingRequestIdRef.current !== requestId) {
      return;
    }

    const match = matchKeywordToIconAsset(keyword, assetRegistryRef.current);
    if (match === null) {
      return;
    }

    enqueueKeywordIconItem({
      requestId,
      item: {
        id: `${requestId}-${appendedAtMs}-${match.keyword}-${match.asset.id}`,
        keyword: match.keyword,
        assetId: match.asset.id,
        label: match.asset.label ?? match.asset.id,
        assetKind: match.asset.assetKind,
        path: match.asset.path,
        format: match.asset.format,
        width: match.asset.width,
        height: match.asset.height,
        appendedAtMs,
      },
    });
  }

  /** 将已匹配 icon 放入播放队列，由调度器保证每次只 append 1 个。 */
  function enqueueKeywordIconItem(item: PendingKeywordIconItem): void {
    pendingKeywordIconItemsRef.current = [...pendingKeywordIconItemsRef.current, item];
    scheduleNextKeywordIconAppend();
  }

  /** 按固定间隔调度下一次 icon append，首个 icon 会立即进入队列。 */
  function scheduleNextKeywordIconAppend(): void {
    if (keywordIconAppendTimerRef.current !== null || pendingKeywordIconItemsRef.current.length === 0) {
      return;
    }

    const nowMs = Date.now();
    const lastAppendAtMs = lastKeywordIconAppendAtRef.current;
    const delayMs =
      lastAppendAtMs === null ? 0 : Math.max(0, keywordIconAppendIntervalMs - (nowMs - lastAppendAtMs));

    if (delayMs === 0) {
      appendNextKeywordIconItem();
      return;
    }

    keywordIconAppendTimerRef.current = window.setTimeout(() => {
      keywordIconAppendTimerRef.current = null;
      appendNextKeywordIconItem();
    }, delayMs);
  }

  /** 从待播放队列取出 1 个当前请求的 icon 并 dispatch。 */
  function appendNextKeywordIconItem(): void {
    while (pendingKeywordIconItemsRef.current.length > 0) {
      const [nextItem, ...remainingItems] = pendingKeywordIconItemsRef.current;
      pendingKeywordIconItemsRef.current = remainingItems;
      if (currentLoadingRequestIdRef.current !== nextItem.requestId) {
        continue;
      }

      lastKeywordIconAppendAtRef.current = Date.now();
      dispatch({
        kind: "thought_keyword_icon",
        requestId: nextItem.requestId,
        item: nextItem.item,
      });
      break;
    }

    scheduleNextKeywordIconAppend();
  }

  return (
    <main className="app-shell">
      <header className="app-masthead">
        <p className="eyebrow">Live Loader Set</p>
        <h1>Fun Loader</h1>
      </header>
      <LoaderShowcase
        assetRegistry={assetRegistry}
        manualSeed={manualLoaderSeed}
        playing={loaderPlaying}
        state={state}
      />
      <section className="workspace-panel">
        <header className="app-header">
          <div className="app-header-copy">
            <p className="eyebrow">Icon Loader Lab</p>
            <h2>控制区</h2>
          </div>
          <div className="loader-controls" aria-label="Loader 动画控制">
            <button
              className="loader-control-button loader-control-button-primary"
              disabled={manualLoaderPlaying}
              onClick={handleManualLoaderStart}
              type="button"
            >
              开始
            </button>
            <button
              className="loader-control-button"
              disabled={!manualLoaderPlaying}
              onClick={() => setManualLoaderPlaying(false)}
              type="button"
            >
              停止
            </button>
          </div>
        </header>
        <PromptForm disabled={isLoading} onSubmit={(prompt) => void handlePromptSubmit(prompt)} />
        <ErrorNotice state={state} />
        <section className="reply-panel" aria-label="Gemini 回复">
          <ReplyStreamPanel state={state} />
        </section>
      </section>
    </main>
  );
}
