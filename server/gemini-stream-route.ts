import type { NextFunction, Request, Response } from "express";
import {
  closeGeminiStreamEvents,
  createGeminiStreamEventSource,
  parseGeminiStreamRequestBody,
  readFirstGeminiStreamEvent,
  serializeGeminiStreamServerEvent,
  validateGeminiStreamAccess,
} from "./gemini-stream-service.js";
import type { GeminiStreamServerEvent } from "./gemini-stream-types.js";

/** Express 流式请求取消状态。 */
type GeminiStreamRouteCancellation = {
  /** 当前请求对应的取消信号。 */
  signal: AbortSignal;
  /** 移除事件监听器。 */
  dispose: () => void;
};

/** 写入一个 NDJSON 流事件，浏览器按行解析。 */
function writeStreamEvent(response: Response, event: GeminiStreamServerEvent): void {
  response.write(serializeGeminiStreamServerEvent(event));
}

/** 从 Express 原始 URL 中读取 query，避免 request.query 的数组解析差异。 */
function readGeminiStreamRouteSearchParams(request: Request): URLSearchParams {
  const requestUrl = request.originalUrl || request.url;
  return new URL(requestUrl, "http://127.0.0.1").searchParams;
}

/** Gemini 流式代理访问门禁，必须在 JSON body 解析前执行。 */
export function handleGeminiStreamAccessRoute(request: Request, response: Response, next: NextFunction): void {
  const accessResult = validateGeminiStreamAccess(readGeminiStreamRouteSearchParams(request), process.env);
  if (accessResult.kind !== "valid") {
    response.status(accessResult.statusCode).json(accessResult.body);
    return;
  }

  next();
}

/** 绑定 Express 连接断开事件，统一转成 AbortSignal。 */
function createGeminiStreamRouteCancellation(
  request: Request,
  response: Response,
  events: AsyncGenerator<GeminiStreamServerEvent>,
): GeminiStreamRouteCancellation {
  const abortController = new AbortController();
  const abort = (): void => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
    closeGeminiStreamEvents(events);
  };

  request.once("aborted", abort);
  response.once("close", abort);

  return {
    signal: abortController.signal,
    dispose: () => {
      request.off("aborted", abort);
      response.off("close", abort);
    },
  };
}

/** Gemini 流式代理路由，负责 Express 协议适配和错误收敛。 */
export async function handleGeminiStreamRoute(request: Request, response: Response): Promise<void> {
  const parseResult = parseGeminiStreamRequestBody(request.body);
  if (parseResult.kind === "invalid") {
    response.status(parseResult.statusCode).json(parseResult.body);
    return;
  }

  const eventSource = createGeminiStreamEventSource(parseResult.prompt, process.env);
  if (eventSource.kind === "configuration_error") {
    response.status(eventSource.statusCode).json(eventSource.body);
    return;
  }

  const cancellation = createGeminiStreamRouteCancellation(request, response, eventSource.events);
  try {
    const firstEventResult = await readFirstGeminiStreamEvent(eventSource.events, cancellation.signal);
    if (firstEventResult.kind === "upstream_error") {
      response.status(firstEventResult.statusCode).json(firstEventResult.body);
      return;
    }
    if (firstEventResult.kind === "aborted") {
      response.end();
      return;
    }

    response.status(200);
    response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("X-Accel-Buffering", "no");

    if (cancellation.signal.aborted) {
      response.end();
      return;
    }

    writeStreamEvent(response, firstEventResult.event);
    for await (const event of eventSource.events) {
      if (cancellation.signal.aborted) {
        closeGeminiStreamEvents(eventSource.events);
        break;
      }

      writeStreamEvent(response, event);
    }

    if (!response.writableEnded) {
      response.end();
    }
  } catch {
    if (cancellation.signal.aborted || response.writableEnded) {
      return;
    }

    writeStreamEvent(response, {
      kind: "error",
      message: "Gemini 流式回复中断，请稍后重试。",
      causeKind: "gemini_stream_interrupted",
    });
    response.end();
  } finally {
    cancellation.dispose();
  }
}
