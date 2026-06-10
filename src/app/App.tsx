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

type AssetRegistryLoadState = "loading" | "ready" | "failed";

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
  const isLoading = state.kind === "loading";
  const loaderPlaying = shouldPlayLoaderAnimation(state, manualLoaderPlaying);

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
    dispatch({
      kind: "submit",
      requestId,
      seed,
      nowMs: Date.now(),
      prompt,
    });

    if (prompt.trim().length === 0) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    for await (const event of streamReplyFromProxy(prompt.trim(), abortController.signal)) {
      if (event.kind === "chunk") {
        dispatch({ kind: "stream_chunk", requestId, text: event.text });
      } else if (event.kind === "thought_keyword") {
        handleThoughtKeywordEvent(requestId, event.keyword);
      } else if (event.kind === "done") {
        clearPendingKeywordEvents(requestId);
        dispatch({ kind: "stream_done", requestId, nowMs: Date.now() });
      } else {
        clearPendingKeywordEvents(requestId);
        dispatch({
          kind: "fail",
          requestId,
          message: event.message,
          causeKind: event.causeKind,
        });
      }
    }
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

  /** 清理指定请求尚未匹配的关键词，避免终态请求残留缓存。 */
  function clearPendingKeywordEvents(requestId: string): void {
    pendingKeywordEventsRef.current = pendingKeywordEventsRef.current.filter((event) => event.requestId !== requestId);
  }

  /** 在浏览器边界完成关键词到 icon 资产的匹配，再把纯队列项交给 reducer。 */
  function dispatchKeywordIconMatch(requestId: string, keyword: string, appendedAtMs: number): void {
    const match = matchKeywordToIconAsset(keyword, assetRegistryRef.current);
    if (match === null) {
      return;
    }

    dispatch({
      kind: "thought_keyword_icon",
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
