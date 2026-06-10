import type { AppErrorKind } from "../app/app-state";

/** 浏览器从代理收到的 NDJSON 事件。 */
export type StreamReplyEvent =
  | { kind: "chunk"; text: string }
  | { kind: "thought_keyword"; keyword: string }
  | { kind: "done" }
  | {
      kind: "error";
      message: string;
      causeKind: Extract<AppErrorKind, "gemini_access_denied" | "gemini_request_failed" | "gemini_stream_interrupted">;
    };
