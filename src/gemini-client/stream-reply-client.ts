import type { StreamReplyEvent } from "./stream-reply-types";

const geminiStreamProxyPath = "/api/gemini/stream";

/** 从页面 URL 中提取 pass 并转发给同源 Gemini 代理。 */
function createGeminiStreamProxyPath(): string {
  if (typeof window === "undefined") {
    return geminiStreamProxyPath;
  }

  const passValues = new URLSearchParams(window.location.search).getAll("pass");
  if (passValues.length === 0) {
    return geminiStreamProxyPath;
  }

  const proxySearchParams = new URLSearchParams();
  for (const passValue of passValues) {
    proxySearchParams.append("pass", passValue);
  }

  return `${geminiStreamProxyPath}?${proxySearchParams.toString()}`;
}

/** 校验非 2xx JSON 错误体，避免脏数据进入页面状态。 */
function parseStreamReplyErrorBody(value: unknown): StreamReplyEvent | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const errorBody = value as Record<string, unknown>;
  if (typeof errorBody.message !== "string") {
    return null;
  }

  if (errorBody.causeKind === "gemini_access_denied" || errorBody.causeKind === "gemini_request_failed") {
    return {
      kind: "error",
      message: errorBody.message,
      causeKind: errorBody.causeKind,
    };
  }

  return null;
}

/** 读取代理返回的非 2xx 错误，失败时回退到稳定通用错误。 */
async function readStreamReplyError(response: Response): Promise<StreamReplyEvent> {
  try {
    const value: unknown = await response.json();
    const errorEvent = parseStreamReplyErrorBody(value);
    if (errorEvent !== null) {
      return errorEvent;
    }
  } catch {
    return {
      kind: "error",
      message: "Gemini 请求失败，请稍后重试。",
      causeKind: "gemini_request_failed",
    };
  }

  return {
    kind: "error",
    message: "Gemini 请求失败，请稍后重试。",
    causeKind: "gemini_request_failed",
  };
}

/** 校验代理返回事件，避免脏数据直接进入页面状态。 */
function parseStreamReplyEvent(line: string): StreamReplyEvent {
  const value: unknown = JSON.parse(line);
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    throw new Error("Gemini 流式事件结构无效。");
  }

  const event = value as Record<string, unknown>;
  if (event.kind === "chunk" && typeof event.text === "string") {
    return { kind: "chunk", text: event.text };
  }

  if (event.kind === "thought_keyword" && typeof event.keyword === "string") {
    const keyword = event.keyword.trim();
    if (keyword.length > 0 && keyword.length <= 32) {
      return { kind: "thought_keyword", keyword };
    }
  }

  if (event.kind === "done") {
    return { kind: "done" };
  }

  if (
    event.kind === "error" &&
    typeof event.message === "string" &&
    (event.causeKind === "gemini_access_denied" ||
      event.causeKind === "gemini_request_failed" ||
      event.causeKind === "gemini_stream_interrupted")
  ) {
    return {
      kind: "error",
      message: event.message,
      causeKind: event.causeKind,
    };
  }

  throw new Error("Gemini 流式事件内容无效。");
}

/** 从本地代理读取 Gemini 流式回复，并按事件逐个 yield。 */
export async function* streamReplyFromProxy(
  prompt: string,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamReplyEvent> {
  const response = await fetch(createGeminiStreamProxyPath(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt }),
    signal: abortSignal,
  });

  if (!response.ok) {
    yield await readStreamReplyError(response);
    return;
  }

  if (response.body === null) {
    yield await readStreamReplyError(response);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.length > 0) {
          yield parseStreamReplyEvent(trimmedLine);
        }
      }
    }

    const finalLine = buffer.trim();
    if (finalLine.length > 0) {
      yield parseStreamReplyEvent(finalLine);
    }
  } catch {
    yield {
      kind: "error",
      message: "Gemini 流式回复中断，请稍后重试。",
      causeKind: "gemini_stream_interrupted",
    };
  } finally {
    reader.releaseLock();
  }
}
