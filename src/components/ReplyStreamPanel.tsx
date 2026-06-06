import type { AppRequestState } from "../app/app-state";

type ReplyStreamPanelProps = {
  state: AppRequestState;
};

/** 回复展示区，按页面状态展示流式文本、完成文本或空态。 */
export function ReplyStreamPanel({ state }: ReplyStreamPanelProps) {
  if (state.kind === "idle") {
    return <div className="reply-placeholder">等待你的问题。</div>;
  }

  if (state.kind === "loading") {
    return <pre className="reply-text">{state.streamedText || "正在连接 Gemini..."}</pre>;
  }

  if (state.kind === "success") {
    return <pre className="reply-text">{state.completedText}</pre>;
  }

  return <div className="reply-placeholder">请求未完成。</div>;
}
