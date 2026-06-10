import { z } from "zod";
import {
  appendThoughtTextAndExtractKeywords,
  createThoughtKeywordExtractorState,
  flushThoughtKeywordExtractor,
} from "../src/loader-domain/thought-keyword.js";
import { readGeminiServerConfig, streamGeminiEvents } from "./gemini-stream-client.js";
import type { GeminiStreamServerEvent } from "./gemini-stream-types.js";

/** Gemini 代理请求体上限，和 Express 本地代理保持一致。 */
export const geminiStreamRequestBodyLimitBytes = 32 * 1024;

/** Gemini HTTP 错误响应体。 */
export type GeminiStreamErrorBody = {
  /** 面向用户展示的错误消息。 */
  message: string;
  /** 浏览器侧稳定识别的错误类型。 */
  causeKind: "gemini_request_failed" | "gemini_access_denied";
};

/** Gemini 访问口令校验结果。 */
export type GeminiStreamAccessValidationResult =
  | {
      /** 校验通过。 */
      kind: "valid";
    }
  | {
      /** URL 口令缺失、重复或不匹配。 */
      kind: "forbidden";
      /** HTTP 状态码。 */
      statusCode: 403;
      /** 错误响应体。 */
      body: GeminiStreamErrorBody;
    }
  | {
      /** 服务端口令配置缺失。 */
      kind: "configuration_error";
      /** HTTP 状态码。 */
      statusCode: 500;
      /** 错误响应体。 */
      body: GeminiStreamErrorBody;
    };

/** 请求体校验结果。 */
export type GeminiStreamRequestBodyValidationResult =
  | {
      /** 校验通过。 */
      kind: "valid";
      /** 清洗后的用户问题。 */
      prompt: string;
    }
  | {
      /** 校验失败。 */
      kind: "invalid";
      /** HTTP 状态码。 */
      statusCode: 400;
      /** 错误响应体。 */
      body: GeminiStreamErrorBody;
    };

/** Gemini 事件源创建结果。 */
export type GeminiStreamEventSourceResult =
  | {
      /** 事件源可用。 */
      kind: "valid";
      /** 协议无关的服务端事件流。 */
      events: AsyncGenerator<GeminiStreamServerEvent>;
    }
  | {
      /** 服务端配置错误。 */
      kind: "configuration_error";
      /** HTTP 状态码。 */
      statusCode: 500;
      /** 错误响应体。 */
      body: GeminiStreamErrorBody;
    };

/** 首个流事件读取结果。 */
export type GeminiStreamFirstEventResult =
  | {
      /** 成功读取首个事件。 */
      kind: "event";
      /** 首个服务端事件。 */
      event: GeminiStreamServerEvent;
    }
  | {
      /** 上游在首个事件前失败。 */
      kind: "upstream_error";
      /** HTTP 状态码。 */
      statusCode: 502;
      /** 错误响应体。 */
      body: GeminiStreamErrorBody;
    }
  | {
      /** 客户端在首个事件前取消。 */
      kind: "aborted";
    };

const geminiRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
});

const invalidRequestBody: GeminiStreamErrorBody = {
  message: "请输入有效问题。",
  causeKind: "gemini_request_failed",
};

const forbiddenAccessBody: GeminiStreamErrorBody = {
  message: "无权限调用 Gemini。",
  causeKind: "gemini_access_denied",
};

/** 判断 Content-Length 是否超过请求体上限。 */
export function isGeminiStreamBodyTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) {
    return false;
  }

  const parsedLength = Number.parseInt(contentLength, 10);
  if (!Number.isFinite(parsedLength)) {
    return false;
  }

  return parsedLength > geminiStreamRequestBodyLimitBytes;
}

/** 判断请求文本是否超过请求体上限。 */
export function isGeminiStreamBodyTextTooLarge(bodyText: string): boolean {
  return new TextEncoder().encode(bodyText).byteLength > geminiStreamRequestBodyLimitBytes;
}

/** 校验并清洗 Gemini 代理请求体。 */
export function parseGeminiStreamRequestBody(body: unknown): GeminiStreamRequestBodyValidationResult {
  const parseResult = geminiRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return {
      kind: "invalid",
      statusCode: 400,
      body: invalidRequestBody,
    };
  }

  return {
    kind: "valid",
    prompt: parseResult.data.prompt,
  };
}

/** 校验 URL pass 与服务端 PASS 是否完全匹配，避免未授权请求进入 Gemini 调用链。 */
export function validateGeminiStreamAccess(
  searchParams: URLSearchParams,
  env: NodeJS.ProcessEnv,
): GeminiStreamAccessValidationResult {
  const configuredPass = env.PASS?.trim();
  if (configuredPass === undefined || configuredPass.length === 0) {
    return {
      kind: "configuration_error",
      statusCode: 500,
      body: {
        message: "缺少 PASS 环境变量。",
        causeKind: "gemini_request_failed",
      },
    };
  }

  const passValues = searchParams.getAll("pass");
  if (passValues.length !== 1 || passValues[0] !== configuredPass) {
    return {
      kind: "forbidden",
      statusCode: 403,
      body: forbiddenAccessBody,
    };
  }

  return { kind: "valid" };
}

/** 创建 Gemini 服务端事件源，配置错误在流创建前收敛。 */
export function createGeminiStreamEventSource(
  prompt: string,
  env: NodeJS.ProcessEnv,
): GeminiStreamEventSourceResult {
  try {
    const config = readGeminiServerConfig(env);
    return {
      kind: "valid",
      events: streamGeminiServerEvents(prompt, config),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini 服务端配置无效。";
    return {
      kind: "configuration_error",
      statusCode: 500,
      body: {
        message,
        causeKind: "gemini_request_failed",
      },
    };
  }
}

/** 预取首个事件，让首包失败可以返回正确 HTTP 状态码。 */
export async function readFirstGeminiStreamEvent(
  events: AsyncGenerator<GeminiStreamServerEvent>,
  abortSignal?: AbortSignal,
): Promise<GeminiStreamFirstEventResult> {
  if (abortSignal?.aborted === true) {
    closeGeminiStreamEvents(events);
    return { kind: "aborted" };
  }

  const nextEvent = events
    .next()
    .then((result): GeminiStreamFirstEventResult => {
      return {
        kind: "event",
        event: result.done === true ? { kind: "done" } : result.value,
      };
    })
    .catch((): GeminiStreamFirstEventResult => {
      return {
        kind: "upstream_error",
        statusCode: 502,
        body: {
          message: "Gemini 请求失败，请检查密钥、模型或网络后重试。",
          causeKind: "gemini_request_failed",
        },
      };
    });

  if (abortSignal === undefined) {
    return nextEvent;
  }

  let removeAbortListener: () => void = () => undefined;
  const abortEvent = new Promise<GeminiStreamFirstEventResult>((resolve) => {
    const handleAbort = (): void => {
      closeGeminiStreamEvents(events);
      resolve({ kind: "aborted" });
    };
    abortSignal.addEventListener("abort", handleAbort, { once: true });
    removeAbortListener = () => {
      abortSignal.removeEventListener("abort", handleAbort);
    };
  });

  const result = await Promise.race([nextEvent, abortEvent]);
  removeAbortListener();
  return result;
}

/** 尽力关闭上游事件流，不能让取消路径等待远端网络返回。 */
export function closeGeminiStreamEvents(events: AsyncGenerator<GeminiStreamServerEvent>): void {
  void events.return(undefined).catch(() => undefined);
}

/** 将服务端事件序列化为 NDJSON 单行。 */
export function serializeGeminiStreamServerEvent(event: GeminiStreamServerEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/** 把 Gemini 模型流转换为浏览器可消费的稳定服务端事件流。 */
export async function* streamGeminiServerEvents(
  prompt: string,
  config: Parameters<typeof streamGeminiEvents>[1],
): AsyncGenerator<GeminiStreamServerEvent> {
  let keywordExtractorState = createThoughtKeywordExtractorState();

  for await (const event of streamGeminiEvents(prompt, config)) {
    if (event.kind === "text_chunk") {
      yield { kind: "chunk", text: event.text };
      continue;
    }

    const result = appendThoughtTextAndExtractKeywords(keywordExtractorState, event.text);
    keywordExtractorState = result.state;
    for (const keyword of result.keywords) {
      yield { kind: "thought_keyword", keyword: keyword.value };
    }
  }

  const flushResult = flushThoughtKeywordExtractor(keywordExtractorState);
  for (const keyword of flushResult.keywords) {
    yield { kind: "thought_keyword", keyword: keyword.value };
  }
  yield { kind: "done" };
}
