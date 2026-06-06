/** 页面请求状态，只表达用户提交到回复完成的核心流程。 */
export type AppRequestState =
  | { kind: "idle" }
  | { kind: "loading"; requestId: string; seed: number; startedAtMs: number; streamedText: string }
  | { kind: "success"; requestId: string; completedText: string; completedAtMs: number }
  | { kind: "error"; requestId: string | null; message: string; causeKind: AppErrorKind };

/** 页面可理解的错误分类，用于避免散落魔法字符串。 */
export type AppErrorKind =
  | "empty_prompt"
  | "duplicate_submit"
  | "gemini_request_failed"
  | "gemini_stream_interrupted"
  | "gemini_response_invalid"
  | "loader_runtime_failed";

/** 页面动作，所有状态迁移都通过 reducer 统一收敛。 */
export type AppAction =
  | { kind: "submit"; requestId: string; seed: number; nowMs: number; prompt: string }
  | { kind: "stream_chunk"; requestId: string; text: string }
  | { kind: "stream_done"; requestId: string; nowMs: number }
  | { kind: "fail"; requestId: string | null; message: string; causeKind: AppErrorKind };

/** 默认页面状态，页面首次打开时没有请求。 */
export const initialAppRequestState: AppRequestState = { kind: "idle" };

/** 判断 Loader 是否应播放，请求播放优先于手动控制。 */
export function shouldPlayLoaderAnimation(state: AppRequestState, manualPlaying: boolean): boolean {
  if (state.kind === "loading") {
    return true;
  }

  return manualPlaying;
}

/** 解析当前 Loader seed，请求中的 seed 优先于手动播放 seed。 */
export function resolveLoaderSeed(state: AppRequestState, manualSeed: number | null): number | null {
  if (state.kind === "loading") {
    return state.seed;
  }

  return manualSeed;
}
