/** 浏览器提交给 Gemini 代理的请求体。 */
export type GeminiStreamRequestBody = {
  prompt: string;
};

/** 代理向浏览器发送的流式事件。 */
export type GeminiStreamServerEvent =
  | { kind: "chunk"; text: string }
  | { kind: "thought_keyword"; keyword: string }
  | { kind: "done" }
  | { kind: "error"; message: string; causeKind: "gemini_request_failed" | "gemini_stream_interrupted" };

/** Gemini 服务端内部流式事件，thought 原文不得直接透传到浏览器。 */
export type GeminiModelStreamEvent =
  | { kind: "text_chunk"; text: string }
  | { kind: "thought_text"; text: string };

/** 服务端 Gemini 调用配置。 */
export type GeminiServerConfig = {
  /** Gemini API Key，只允许来自服务端环境变量。 */
  apiKey: string;
  /** Gemini 模型 ID，默认使用用户指定的 Gemini 3.1 Pro Preview。 */
  model: string;
  /** Gemini thinking 强度，当前需求固定为 high。 */
  thinkingLevel: "high";
};
