import type { AppAction, AppRequestState } from "./app-state";

/** 对用户输入做边界清洗，核心状态逻辑只接收清洗后的 prompt。 */
function normalizePrompt(prompt: string): string {
  return prompt.trim();
}

/** 统一处理页面请求状态迁移，避免组件里散落流程判断。 */
export function appRequestReducer(state: AppRequestState, action: AppAction): AppRequestState {
  if (action.kind === "submit") {
    const prompt = normalizePrompt(action.prompt);
    if (prompt.length === 0) {
      return {
        kind: "error",
        requestId: null,
        message: "请输入问题后再提交。",
        causeKind: "empty_prompt",
      };
    }

    if (state.kind === "loading") {
      return {
        kind: "error",
        requestId: state.requestId,
        message: "当前请求还在进行中，请等待回复完成。",
        causeKind: "duplicate_submit",
      };
    }

    return {
      kind: "loading",
      requestId: action.requestId,
      seed: action.seed,
      startedAtMs: action.nowMs,
      streamedText: "",
    };
  }

  if (action.kind === "stream_chunk") {
    if (state.kind !== "loading" || state.requestId !== action.requestId) {
      return state;
    }

    return {
      ...state,
      streamedText: `${state.streamedText}${action.text}`,
    };
  }

  if (action.kind === "stream_done") {
    if (state.kind !== "loading" || state.requestId !== action.requestId) {
      return state;
    }

    return {
      kind: "success",
      requestId: state.requestId,
      completedText: state.streamedText,
      completedAtMs: action.nowMs,
    };
  }

  return {
    kind: "error",
    requestId: action.requestId,
    message: action.message,
    causeKind: action.causeKind,
  };
}
