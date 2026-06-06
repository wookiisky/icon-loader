import { useReducer, useRef, useState } from "react";
import { appRequestReducer } from "./app-reducer";
import { initialAppRequestState, shouldPlayLoaderAnimation } from "./app-state";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoaderShowcase } from "../components/LoaderShowcase";
import { PromptForm } from "../components/PromptForm";
import { ReplyStreamPanel } from "../components/ReplyStreamPanel";
import { streamReplyFromProxy } from "../gemini-client/stream-reply-client";

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
  const [manualLoaderPlaying, setManualLoaderPlaying] = useState(false);
  const [manualLoaderSeed, setManualLoaderSeed] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isLoading = state.kind === "loading";
  const loaderPlaying = shouldPlayLoaderAnimation(state, manualLoaderPlaying);

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
      } else if (event.kind === "done") {
        dispatch({ kind: "stream_done", requestId, nowMs: Date.now() });
      } else {
        dispatch({
          kind: "fail",
          requestId,
          message: event.message,
          causeKind: event.causeKind,
        });
      }
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace-panel">
        <header className="app-header">
          <div className="app-header-copy">
            <p className="eyebrow">Icon Loader Lab</p>
            <h1>基于 Icon 的像素 Loader</h1>
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
      <LoaderShowcase manualSeed={manualLoaderSeed} playing={loaderPlaying} state={state} />
    </main>
  );
}
